// ═══════════════════════════════════════════════════════════════
//  CART MODULE (F2) — panier persistant avec alertes stock/prix
//  et fusion du panier invité (token Redis) à la connexion.
// ═══════════════════════════════════════════════════════════════

import { Router, Request, Response, NextFunction } from 'express';
import { z }                from 'zod';
import { AppDataSource }    from '../../config/database';
import { Cart, CartItem }   from '../../entities/Cart';
import { ProductVariant }   from '../../entities/ProductVariant';
import { StockLevel }       from '../../entities/StockLevel';
import { redis }            from '../../config/redis';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { validate, validateParams, authenticate } from '../../middlewares';
import { MOQ_UNIT_BY_ORG_TYPE, moqMessage, type OrgType } from '../../shared/org-rules';

const AddItemSchema = z.object({
  variantId: z.string().uuid(),
  quantity:  z.number().int().positive().max(10_000),
});

const UpdateItemSchema = z.object({
  quantity: z.number().int().positive().max(10_000),
});

const cartRepo = ()     => AppDataSource.getRepository(Cart);
const itemRepo = ()     => AppDataSource.getRepository(CartItem);
const variantRepo = ()  => AppDataSource.getRepository(ProductVariant);

// Prix courant d'une variante (identique à la règle du checkout)
const currentPriceOf = (v: ProductVariant) => v.priceOverride ?? v.product.basePrice;

// MOQ du produit : quantity minimale autorisée (null = pas de MOQ) + unité
// de vente dérivée du org_type du vendeur (palette / carton / unité)
function moqOf(v: ProductVariant): { quantity: number; unit: string; message: string } | null {
  const moq = v.product.minOrderQty;
  if (moq == null || moq <= 0) return null;
  const sellerType = (v.product.org?.orgType ?? null) as OrgType | null;
  const unit = (sellerType && MOQ_UNIT_BY_ORG_TYPE[sellerType]) || 'unité';
  return { quantity: moq, unit, message: moqMessage(moq, unit) };
}

/** Règle métier : bloque l'ajout/modification sous le MOQ du produit. */
function assertMoq(moq: { quantity: number; unit: string; message: string } | null, quantity: number): void {
  if (moq && quantity < moq.quantity) {
    throw ApiError.badRequest(moq.message);
  }
}

export const CartService = {
  async getOrCreate(userId: string): Promise<Cart> {
    let cart = await cartRepo().findOne({ where: { user: { id: userId } } });
    if (!cart) {
      cart = await cartRepo().save(cartRepo().create({ user: { id: userId } as any }));
    }
    return cart;
  },

  /** Panier + état de fraîcheur : stock insuffisant / prix modifié / sous le MOQ. */
  async getDetailed(userId: string) {
    const cart = await this.getOrCreate(userId);
    const items = await itemRepo().find({
      where: { cart: { id: cart.id } },
      relations: ['variant', 'variant.product', 'variant.product.images', 'variant.product.org'],
      order: { createdAt: 'ASC' },
    });

    const detailed = [];
    for (const item of items) {
      const v = item.variant;
      const currentPrice = v ? currentPriceOf(v) : 0;
      const moq = v ? moqOf(v) : null;

      // Disponibilité : tous les entrepôts qui stockent la variante
      const stockRow = await AppDataSource.getRepository(StockLevel)
        .createQueryBuilder('sl')
        .select('SUM(sl.qtyOnHand - sl.qtyReserved)', 'available')
        .where('sl.variant_id = :vid', { vid: item.variant.id })
        .getRawOne<{ available: string }>();
      const available = parseInt(stockRow?.available ?? '0', 10);

      const issues: string[] = [];
      if (moq && item.quantity < moq.quantity) {
        issues.push(moq.message);
      }
      if (available < item.quantity) {
        issues.push(`Stock insuffisant (${available} disponible(s))`);
      }
      if (Number(item.priceAtAdd) !== Number(currentPrice)) {
        issues.push(`Prix modifié : ${item.priceAtAdd} → ${currentPrice} XAF`);
      }

      detailed.push({
        id:           item.id,
        variantId:    item.variant.id,
        productName:  v?.product?.name,
        variantSku:   v?.variantSku,
        image:        v?.product?.images?.[0]?.url ?? null,
        quantity:     item.quantity,
        priceAtAdd:   Number(item.priceAtAdd),
        currentPrice,
        available,
        moq,
        issues,
      });
    }

    return {
      cartId: cart.id,
      items: detailed,
      totalEstimated: detailed.reduce((s, i) => s + i.currentPrice * i.quantity, 0),
      hasIssues: detailed.some(i => i.issues.length > 0),
    };
  },

  async addItem(userId: string, dto: z.infer<typeof AddItemSchema>) {
    // relations product+org requises : prix courant et règle MOQ
    const variant = await variantRepo().findOne({
      where: { id: dto.variantId, isActive: true },
      relations: ['product', 'product.org'],
    });
    if (!variant) throw ApiError.notFound('Variante');

    // Règles org_type : la quantité (après fusion de ligne) doit respecter le MOQ
    const moq = moqOf(variant);
    const cart = await this.getOrCreate(userId);
    const existing = await itemRepo().findOneBy({
      cart: { id: cart.id },
      variant: { id: dto.variantId },
    });

    if (existing) {
      assertMoq(moq, existing.quantity + dto.quantity);
      existing.quantity += dto.quantity;
      return itemRepo().save(existing);
    }
    assertMoq(moq, dto.quantity);
    return itemRepo().save(itemRepo().create({
      cart:      { id: cart.id } as any,
      variant:   { id: dto.variantId } as any,
      quantity:  dto.quantity,
      priceAtAdd: currentPriceOf(variant),
    }));
  },

  async updateItem(userId: string, itemId: string, quantity: number) {
    const item = await this.getOwnedItem(userId, itemId);
    // relation requise pour la règle MOQ (getOwnedItem ne charge pas variant)
    const variant = await variantRepo().findOne({
      where: { id: (item.variant as ProductVariant)?.id, isActive: true },
      relations: ['product', 'product.org'],
    });
    if (!variant) throw ApiError.notFound('Variante');
    assertMoq(moqOf(variant), quantity);
    item.quantity = quantity;
    return itemRepo().save(item);
  },

  async removeItem(userId: string, itemId: string) {
    const item = await this.getOwnedItem(userId, itemId);
    await itemRepo().remove(item);
  },

  async clear(userId: string) {
    const cart = await this.getOrCreate(userId);
    await itemRepo().delete({ cart: { id: cart.id } });
  },

  async getOwnedItem(userId: string, itemId: string) {
    // Jointure cart→user : garantit la propriété de l'article (anti-IDOR)
    const item = await itemRepo().findOne({
      where: { id: itemId, cart: { user: { id: userId } } },
      relations: ['variant'],
    });
    if (!item) throw ApiError.notFound('Article du panier');
    return item;
  },

  /**
   * Fusion du panier invité (stocké côté serveur sous un token anonyme)
   * dans le panier du compte, à la connexion. Les quantités s'additionnent.
   * Les lignes sous le MOQ du produit sont rejetées (comptées dans `rejected`).
   */
  async mergeGuestCart(userId: string, guestToken: string) {
    const key = `guest-cart:${guestToken}`;
    const raw = await redis.get(key);
    if (!raw) return { merged: 0, rejected: 0 };

    let guestItems: Array<{ variantId: string; quantity: number }>;
    try {
      guestItems = JSON.parse(raw);
    } catch {
      await redis.del(key);
      return { merged: 0, rejected: 0 };
    }

    const cart = await this.getOrCreate(userId);
    let merged = 0;
    let rejected = 0;
    for (const gi of guestItems) {
      if (!gi?.variantId || !Number.isInteger(gi.quantity) || gi.quantity <= 0) continue;
      const variant = await variantRepo().findOne({
        where: { id: gi.variantId, isActive: true },
        relations: ['product', 'product.org'],
      });
      if (!variant) continue;
      const moq = moqOf(variant);
      const existing = await itemRepo().findOneBy({
        cart: { id: cart.id }, variant: { id: gi.variantId },
      });
      const targetQty = (existing?.quantity ?? 0) + gi.quantity;
      if (moq && targetQty < moq.quantity) {
        rejected++;
        continue;
      }
      if (existing) {
        existing.quantity = targetQty;
        await itemRepo().save(existing);
      } else {
        await itemRepo().save(itemRepo().create({
          cart: { id: cart.id } as any,
          variant: { id: gi.variantId } as any,
          quantity: gi.quantity,
          priceAtAdd: currentPriceOf(variant),
        }));
      }
      merged++;
    }
    await redis.del(key);
    return { merged, rejected };
  },
};

export const cartRouter = Router();
cartRouter.use(authenticate);

cartRouter.get('/', async (req, res, next) => {
  try { res.json(ApiResponse.success(await CartService.getDetailed(req.user!.id))); } catch (e) { next(e); }
});
cartRouter.post('/items', validate(AddItemSchema), async (req, res, next) => {
  try { res.status(201).json(ApiResponse.created(await CartService.addItem(req.user!.id, req.body))); } catch (e) { next(e); }
});
cartRouter.patch('/items/:id', validateParams('id'), validate(UpdateItemSchema), async (req, res, next) => {
  try { res.json(ApiResponse.success(await CartService.updateItem(req.user!.id, req.params.id, req.body.quantity))); } catch (e) { next(e); }
});
cartRouter.delete('/items/:id', validateParams('id'), async (req, res, next) => {
  try { await CartService.removeItem(req.user!.id, req.params.id); res.json(ApiResponse.noContent()); } catch (e) { next(e); }
});
cartRouter.delete('/', async (req, res, next) => {
  try { await CartService.clear(req.user!.id); res.json(ApiResponse.noContent()); } catch (e) { next(e); }
});
cartRouter.post('/merge', async (req, res, next) => {
  try {
    const token = req.headers['x-cart-token'] as string | undefined;
    if (!token) throw ApiError.badRequest('Header X-Cart-Token requis');
    res.json(ApiResponse.success(await CartService.mergeGuestCart(req.user!.id, token), 'Panier fusionné'));
  } catch (e) { next(e); }
});
