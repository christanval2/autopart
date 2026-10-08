// ═══════════════════════════════════════════════════════════════
//  ORDERS MODULE
// ═══════════════════════════════════════════════════════════════

import { Router, Request, Response, NextFunction } from 'express';
import { z }                 from 'zod';
import { AppDataSource }     from '../../config/database';
import { Order }             from '../../entities/Order';
import { OrderLine }         from '../../entities/OrderLine';
import { ProductVariant }    from '../../entities/ProductVariant';
import { StockLevel }        from '../../entities/StockLevel';
import { Organization }      from '../../entities/Organization';
import { OrderApproval }     from '../../entities/OrderApproval';
import { CatalogProduct }    from '../../entities/CatalogProduct';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { paginate, generateOrderNumber, sanitizeDeep } from '../../shared/utils/helpers';
import { validate, validateParams, authenticate, authorize } from '../../middlewares';
import { Jobs } from '../../jobs/queues';
import { logger } from '../../shared/utils/logger';
import { notifyUser } from '../push-notifications';
import { getVatRate } from '../../shared/utils/tax';
import { AnalyticsService } from '../analytics';
import { ShippingZone } from '../../entities/ShippingZone';
import { ShippingService } from '../shipping';
import { recordStockMovement } from '../../shared/utils/stock-log';
import { canBuyB2B, canBuyFrom, effectiveDiscountRate, MOQ_UNIT_BY_ORG_TYPE, moqMessage, type OrgType } from '../../shared/org-rules';
import type { OrderStatus, OrderChannel }   from '../../shared/types';

// ─── Schémas Zod ─────────────────────────────────────────────────

const LineSchema = z.object({
  variantId:  z.string().uuid(),
  quantity:   z.number().int().min(1),
  catalogId:  z.string().uuid().optional(), // Si achat depuis un catalogue B2B spécifique
});

export const CreateOrderSchema = z.object({
  // Optionnel : résolu côté backend depuis le stock des variantes (checkout
  // mobile/vocal où l'acheteur ne connaît pas le vendeur)
  sellerOrgId:       z.string().uuid().optional(),
  channel:           z.enum(['b2b', 'b2c', 'marketplace']),
  billingAddressId:  z.string().uuid(),
  shippingAddressId: z.string().uuid(),
  lines:             z.array(LineSchema).min(1).max(200),
  notes:             z.string().max(1000).optional(),
  currency:          z.string().length(3).default('XAF'),
  discountCode:      z.string().optional(),
  // F2 — zone de livraison choisie au checkout (frais réels)
  shippingZoneId:    z.string().uuid().optional(),
  // Vider le panier serveur après création réussie
  fromCart:          z.boolean().optional(),
});

export const UpdateOrderStatusSchema = z.object({
  // AUTHZ-2 : 'refunded' interdit côté client (le service re-vérifie)
  status: z.enum(['confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']),
  // Validation note pour éviter XSS stocké
   note:   z.string().max(500).trim().optional(),
});

export const OrderQuerySchema = z.object({
  page:        z.coerce.number().int().positive().default(1),
  limit:       z.coerce.number().int().min(1).max(100).default(20),
  status:      z.enum(['draft','confirmed','processing','shipped','delivered','cancelled','refunded']).optional(),
  channel:     z.enum(['b2b','b2c','marketplace']).optional(),
  buyerId:     z.string().uuid().optional(),
  sellerOrgId: z.string().uuid().optional(),
  startDate:   z.coerce.date().optional(),
  endDate:     z.coerce.date().optional(),
  minAmount:   z.coerce.number().min(0).optional(),
});

export type CreateOrderDto = z.infer<typeof CreateOrderSchema>;
export type OrderQuery     = z.infer<typeof OrderQuerySchema>;

// ─── Constantes ───────────────────────────────────────────────────

// TVA : configurée en base (table tax_configs), fallback 19,25 % Cameroun
const vatRate = () => getVatRate('CM');

export type { OrderStatus };

// ─── Machine à états des commandes (source de vérité, testée) ────
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft:       ['confirmed', 'cancelled'],
  confirmed:   ['processing', 'cancelled'],
  processing:  ['shipped', 'cancelled'],
  shipped:     ['delivered'],
  delivered:   ['refunded'],
  cancelled:   [],
  refunded:    [],
};

export function canOrderTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Service ─────────────────────────────────────────────────────

const orderRepo   = () => AppDataSource.getRepository(Order);
const variantRepo = () => AppDataSource.getRepository(ProductVariant);
const stockRepo   = () => AppDataSource.getRepository(StockLevel);
const orgRepo     = () => AppDataSource.getRepository(Organization);
const catProdRepo = () => AppDataSource.getRepository(CatalogProduct);

export const OrdersService = {

  async create(buyerId: string, dto: CreateOrderDto): Promise<Order> {
    return AppDataSource.transaction(async manager => {

      // 1. Vendeur : fourni, ou résolu depuis le stock des variantes (checkout
      //    mobile/vocal). Toutes les lignes doivent partager le même vendeur.
      let sellerOrgId = dto.sellerOrgId;
      if (!sellerOrgId) {
        const variantIds = dto.lines.map(l => l.variantId);
        const rows = await AppDataSource.getRepository(StockLevel)
          .createQueryBuilder('sl')
          .innerJoin('sl.warehouse', 'wh')
          .select('sl.variant_id', 'variantId')
          .addSelect('MIN(wh.org_id)', 'orgId')
          .where('sl.variant_id IN (:...vids)', { vids: variantIds })
          .groupBy('sl.variant_id')
          .getRawMany<{ variantId: string; orgId: string }>();
        const sellerOf = new Map(rows.map(r => [r.variantId, r.orgId]));
        const sellers = new Set(dto.lines.map(l => sellerOf.get(l.variantId)).filter(Boolean));
        if (sellers.size === 0) throw ApiError.badRequest('Aucun vendeur ne stocke ces pièces');
        if (sellers.size > 1) throw ApiError.badRequest('Les pièces appartiennent à plusieurs vendeurs — passez des commandes séparées');
        sellerOrgId = [...sellers][0];
      }
      const sellerOrg = await orgRepo().findOneBy({ id: sellerOrgId, isVerified: true });
      if (!sellerOrg) throw ApiError.notFound('Organisation vendeuse');

      // ── Règles métier org_type (vérifiées BACKEND, 403 impossibles à
      // contourner depuis le frontend) ────────────────────────────────
      const buyerUser = await manager.getRepository('User').findOneBy({ id: buyerId });
      const buyerOrgId = (buyerUser as any)?.orgId ?? null;
      const buyerOrg = buyerOrgId
        ? await manager.getRepository(Organization).findOne({ where: { id: buyerOrgId }, relations: ['tier'] })
        : null;
      if (buyerOrg) {
        const buyerType = buyerOrg.orgType as OrgType;
        const sellerType = sellerOrg.orgType as OrgType;

        // Un importer n'achète pas sur la plateforme (ses achats fabricant
        // sont hors plateforme) — rôle vendeur uniquement.
        if (!canBuyB2B(buyerType)) {
          throw ApiError.forbidden(
            "Les comptes importateurs sont vendeurs uniquement : ils n'effectuent pas de commandes B2B sur la plateforme",
          );
        }
        // Un garage/retailer achète chez un wholesaler, jamais directement
        // chez un importer (can_sell ne change pas le rôle d'acheteur).
        if (!canBuyFrom(buyerType, sellerType)) {
          throw ApiError.forbidden(
            `Un compte ${buyerType} ne peut pas commander auprès d'un vendeur ${sellerType}`,
          );
        }
      }

      // 2. Calculer les lignes et vérifier le stock
      let subtotal = 0;
      const lines: Partial<OrderLine>[] = [];

      for (const item of dto.lines) {
        // Récupérer la variante avec son produit
        const variant = await variantRepo().findOne({
          where: { id: item.variantId, isActive: true },
          relations: ['product'],
        });
        if (!variant) throw ApiError.notFound(`Variante ${item.variantId}`);

        // Vérifier le stock dans tous les entrepôts du vendeur
        // (StockLevel n'a pas de propriété variantId : utiliser la colonne)
        const stockQb = stockRepo()
          .createQueryBuilder('sl')
          .innerJoin('sl.warehouse', 'wh', 'wh.orgId = :orgId', { orgId: dto.sellerOrgId })
          .where('sl.variant_id = :vid', { vid: item.variantId })
          .select('SUM(sl.qtyOnHand - sl.qtyReserved)', 'total');
        const total = await stockQb.getRawOne<{ total: string }>();
        const available = parseInt(total?.total ?? '0', 10);

        if (available < item.quantity) {
          throw ApiError.conflict(
            `Stock insuffisant pour ${variant.product.name} (dispo: ${available}, demandé: ${item.quantity})`,
          );
        }

        // Règles org_type : MOQ du produit (défaut selon org_type du vendeur :
        // importer 50 = palette, wholesaler 5 = carton), modifiable par produit.
        const moq = variant.product.minOrderQty;
        if (moq != null && moq > 0 && item.quantity < moq) {
          throw ApiError.badRequest(
            moqMessage(moq, MOQ_UNIT_BY_ORG_TYPE[sellerOrg.orgType as OrgType] ?? 'unité'),
          );
        }

        // Déterminer le prix : catalogue B2B > priceOverride > basePrice
        let unitPrice = variant.priceOverride ?? variant.product.basePrice;

        if (item.catalogId && dto.channel === 'b2b') {
          const catProd = await catProdRepo().findOne({
            where: { catalog: { id: item.catalogId }, variant: { id: item.variantId }, isAvailable: true },
            relations: ['catalog'],
          });
          if (catProd) {
            unitPrice = catProd.customPrice
              ?? variant.product.basePrice * (1 + (catProd.catalog.markupPct / 100));
            if (catProd.minQty && item.quantity < catProd.minQty) {
              throw ApiError.badRequest(
                `Quantité minimale pour ce catalogue : ${catProd.minQty}`,
              );
            }
          }
        }

        // Grille de prix : remise du tier de l'ACHETEUR (le tier est la
        // source de vérité des prix). La remise ne s'applique que si ce
        // tier est autorisé pour son org_type — un garage ne paie jamais
        // le prix « gros », même si son tier a été mal configuré.
        if (buyerOrg && dto.channel === 'b2b') {
          const rate = effectiveDiscountRate(
            buyerOrg.orgType as OrgType,
            buyerOrg.tier?.name,
            buyerOrg.tier?.discountRate,
          );
          if (rate > 0) unitPrice = Math.round(unitPrice * (1 - rate / 100) * 100) / 100;
        }

        const lineTotal = unitPrice * item.quantity;
        subtotal += lineTotal;

        lines.push({
          variant,
          productSnapshot: {
            name:         variant.product.name,
            sku:          variant.variantSku,
            oemReference: variant.product.oemReference,
            attributes:   variant.attributes,
            unitPrice,
          },
          quantity:  item.quantity,
          unitPrice,
          lineTotal,
          taxRate:   await vatRate(),
        });

        // Réserver le stock (décrémenter sur le premier entrepôt disponible)
        await manager
          .createQueryBuilder()
          .update(StockLevel)
          // FIX SÉCURITÉ : utiliser query paramétrée au lieu d'interpolation dans .set()
          .set({ qtyReserved: () => 'qty_reserved + :incr' })
          .setParameter('incr', Math.trunc(Number(item.quantity)))
.where(`variant_id = :vid AND warehouse_id IN (
            SELECT wh.id FROM warehouses wh WHERE wh.org_id = :orgId
          ) AND qty_on_hand - qty_reserved >= :qty`, {
            vid: item.variantId,
            orgId: sellerOrgId,
            qty: Math.trunc(Number(item.quantity)),
          })
          .execute();
      }

      const taxAmount = subtotal * (await vatRate());

      // F2 — frais de livraison réels selon la zone choisie (fallback 0 si
      // le vendeur n'a configuré aucune zone : comportement historique préservé)
      let shippingCost = 0;
      if (dto.shippingZoneId) {
        const zone = await manager.getRepository(ShippingZone).findOneBy({
          id: dto.shippingZoneId, org: { id: dto.sellerOrgId }, isActive: true,
        });
        if (!zone) throw ApiError.notFound('Zone de livraison');
        const totalWeightKg = lines.reduce(
          (w, l) => w + (((l.variant as any)?.product?.weightKg as number | undefined) ?? 0) * Number(l.quantity),
          0,
        );
        shippingCost = ShippingService.computeCost(zone, subtotal, totalWeightKg);
      }
      const totalAmount = subtotal + taxAmount + shippingCost;

      // Vérifier montant minimum B2B
      const tier = sellerOrg.tier;
      if (dto.channel === 'b2b' && tier?.minOrderValue && tier.minOrderValue > totalAmount) {
        throw ApiError.badRequest(
          `Montant minimum B2B requis : ${tier.minOrderValue} XAF`,
        );
      }

      // E3.1 — Limite de crédit B2B : encours + nouvelle commande <= creditLimit
      // (l'encours = commandes au crédit non annulées/non remboursées)
      // (buyereUser/buyerOrg déjà chargés pour les règles org_type)
      if (dto.channel === 'b2b' && buyerOrg) {
        const creditLimit = Number(buyerOrg.creditLimit ?? 0);
        if (creditLimit > 0) {
          const outstandingRaw = await manager.getRepository(Order)
            .createQueryBuilder('o')
            .innerJoin('o.payment', 'p')
            .select('COALESCE(SUM(o.total_amount), 0)', 'total')
            .where('o.status NOT IN (:...excluded)', { excluded: ['cancelled', 'refunded'] })
            .andWhere('p.method = :credit AND p.status != :failed', { credit: 'credit', failed: 'failed' })
            .andWhere('o.buyer_id = :buyerId', { buyerId })
            .getRawOne<{ total: string }>();
          const outstanding = Number(outstandingRaw?.total ?? 0);
          if (outstanding + totalAmount > creditLimit) {
            throw ApiError.badRequest(
              `Limite de crédit dépassée : encours ${outstanding.toLocaleString('fr-FR')} XAF + commande ` +
              `${totalAmount.toLocaleString('fr-FR')} XAF > limite ${creditLimit.toLocaleString('fr-FR')} XAF`,
            );
          }
          // Alerte à 80 % de la limite
          if (outstanding + totalAmount >= creditLimit * 0.8) {
            logger.warn(
              `Alerte crédit : org ${buyerOrgId} à ${Math.round((outstanding + totalAmount) / creditLimit * 100)}% de sa limite`,
            );
          }
        }
      }

      // 3. Créer la commande
      const order = manager.create(Order, {
        orderNumber:      generateOrderNumber(),
        buyer:            { id: buyerId },
        sellerOrg:        { id: sellerOrgId },
        channel:          dto.channel,
        status:           'draft',
        subtotal,
        taxAmount,
        shippingCost,
        discountAmount:   0,
        totalAmount,
        currency:         dto.currency,
        billingAddress:   { id: dto.billingAddressId },
        shippingAddress:  { id: dto.shippingAddressId },
        notes:            dto.notes,
        lines:            lines as OrderLine[],
      });
      const savedOrder = await manager.save(Order, order);

      // F2 — vider le panier serveur de l'acheteur si la commande vient du panier
      if (dto.fromCart) {
        await manager.createQueryBuilder()
          .delete()
          .from('cart_items', 'ci')
          .where('ci.cart_id IN (SELECT c.id FROM carts c WHERE c.user_id = :uid)', { uid: buyerId })
          .execute();
      }

      // F3 — mouvements d'audit 'reservation' (entrepôt indéterminé par la
      // règle multi-entrepôts : traçage au niveau variante)
      for (const item of dto.lines) {
        await recordStockMovement(manager, {
          variantId: item.variantId,
          reason:    'reservation',
          qtyDelta:  Math.trunc(Number(item.quantity)),
          userId:    buyerId,
          orderId:   savedOrder.id,
          note:      'Réservation à la création de commande',
        });
      }

      // E6f — événements funnel 'purchase' (fire-and-forget, hors transaction)
      const purchasedProductIds = [...new Set(
        lines.map(l => (l.variant as any)?.product?.id).filter(Boolean),
      )] as string[];
      for (const pid of purchasedProductIds) {
        AnalyticsService.trackEvent(pid, 'purchase', buyerId).catch(() => undefined);
      }

      // E3.2 — Seuil d'approbation B2B : si le total dépasse le seuil du vendeur,
      // créer une demande d'approbation et armer le timeout 48 h.
      if (dto.channel === 'b2b' && sellerOrg.approvalThreshold != null && totalAmount > Number(sellerOrg.approvalThreshold)) {
        const approval = await manager.save(OrderApproval, manager.create(OrderApproval, {
          order:          { id: savedOrder.id },
          thresholdAmount: Number(sellerOrg.approvalThreshold),
          reason:         `Approbation requise : ${totalAmount.toLocaleString('fr-FR')} XAF > seuil ${Number(sellerOrg.approvalThreshold).toLocaleString('fr-FR')} XAF`,
        }));
        Jobs.ordersQueue().add('approval-timeout', { approvalId: approval.id }, { delay: 48 * 3600 * 1000 })
          .catch(e => logger.warn('Job approval-timeout non planifié:', e.message));
      }

      return savedOrder;
    });
  },

  async findAll(query: OrderQuery, currentUser: { id: string; orgId: string | null; roles: string[] }) {
    const qb = orderRepo()
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.lines', 'l')
      .leftJoinAndSelect('l.variant', 'v')
      .leftJoinAndSelect('v.product', 'p')
      .leftJoinAndSelect('o.payment', 'pay')
      .leftJoinAndSelect('o.buyer', 'b');

    // Super admin voit tout; sinon filtrer par organisation ou user
    const isSuperAdmin = currentUser.roles.includes('super_admin');
    if (!isSuperAdmin) {
      if (currentUser.orgId) {
        qb.where('(o.buyer.id = :uid OR o.sellerOrg.id = :orgId)', {
          uid: currentUser.id,
          orgId: currentUser.orgId,
        });
      } else {
        qb.where('o.buyer.id = :uid', { uid: currentUser.id });
      }
    }

    if (query.status)    qb.andWhere('o.status = :status',     { status: query.status });
    if (query.channel)   qb.andWhere('o.channel = :channel',   { channel: query.channel });
    if (query.buyerId)   qb.andWhere('o.buyer.id = :buyerId',  { buyerId: query.buyerId });
    if (query.sellerOrgId) qb.andWhere('o.sellerOrg.id = :sid',{ sid: query.sellerOrgId });
    if (query.startDate) qb.andWhere('o.orderedAt >= :sd',     { sd: query.startDate });
    if (query.endDate)   qb.andWhere('o.orderedAt <= :ed',     { ed: query.endDate });
    if (query.minAmount) qb.andWhere('o.totalAmount >= :min',  { min: query.minAmount });

    qb.orderBy('o.orderedAt', 'DESC');
    return paginate(qb, query.page, query.limit);
  },

  async findById(
    id: string,
    ctx?: { callerId: string; callerOrgId?: string | null; isAdmin?: boolean },
  ): Promise<Order> {
    const order = await orderRepo().findOne({
      where: { id },
      relations: [
        'lines', 'lines.variant', 'lines.variant.product',
        'payment', 'shipments',
        'buyer', 'sellerOrg',
        'billingAddress', 'shippingAddress',
      ],
    });
    if (!order) throw ApiError.notFound('Commande');

    // Contrôle d'accès — super_admin voit tout, sinon vérifier ownership
    if (ctx && !ctx.isAdmin) {
      const isBuyer     = (order.buyer as any)?.id === ctx.callerId;
      const isSellerOrg = ctx.callerOrgId && (order.sellerOrg as any)?.id === ctx.callerOrgId;
      if (!isBuyer && !isSellerOrg) throw ApiError.forbidden();
    }
    return order;
  },

  async updateStatus(
    id: string,
    status: OrderStatus,
    note?: string,
    ctx?: { callerId: string; callerOrgId?: string | null; isAdmin?: boolean },
  ): Promise<Order> {
    const order = await this.findById(id, ctx);

    // ENUM-1 : 'refunded' uniquement par super_admin
    if (status === 'refunded' && !ctx?.isAdmin) {
      throw ApiError.forbidden("Seul un administrateur peut marquer une commande comme remboursée");
    }

    // Transitions autorisées (machine à états partagée, voir ORDER_TRANSITIONS)
    if (!canOrderTransition(order.status, status)) {
      throw ApiError.badRequest(`Transition ${order.status} → ${status} non autorisée`);
    }

    // Si annulation : libérer le stock réservé
    if (status === 'cancelled') {
      await AppDataSource.transaction(async manager => {
        for (const line of order.lines) {
          await manager
            .createQueryBuilder()
            .update(StockLevel)
            // FIX SÉCURITÉ : paramètre typé integer
            .set({ qtyReserved: () => 'qty_reserved - :decr' })
            .setParameter('decr', Math.trunc(Number(line.quantity)))
            .where('variantId = :vid', { vid: line.variant.id })
            .execute();
          // F3 — mouvement 'release' symétrique de la réservation
          await recordStockMovement(manager, {
            variantId: line.variant.id,
            reason:    'release',
            qtyDelta:  -Math.trunc(Number(line.quantity)),
            userId:    ctx?.callerId ?? null,
            orderId:   order.id,
            note:      'Libération à l\'annulation',
          });
        }
        order.status = status;
        await manager.save(Order, order);
      });
    } else {
      order.status = status;
      await orderRepo().save(order);
    }

    // E2 — notification push + in-app à l'acheteur à chaque transition
    const buyer = order.buyer as { id?: string; email?: string } | undefined;
    if (buyer?.id) {
      const labels: Record<string, string> = {
        confirmed:  'Commande confirmée ✅',
        processing: 'Commande en préparation 📦',
        shipped:    'Commande expédiée 🚚',
        delivered:  'Commande livrée 🎉',
        cancelled:  'Commande annulée ❌',
        refunded:   'Commande remboursée 💰',
      };
      const title = labels[status] ?? `Commande mise à jour : ${status}`;
      notifyUser(buyer.id, title, `Votre commande ${order.orderNumber} — ${title}`, { type: 'order_status', orderId: order.id })
        .catch(() => undefined);
      Jobs.notify({
        userId: buyer.id,
        type:   'order_status',
        title,
        body:   `Votre commande ${order.orderNumber} — ${title}`,
        payload: { orderId: order.id, status },
      }).catch(() => undefined);

      // E1 — email d'expédition avec suivi
      if (status === 'shipped' && buyer.email) {
        Jobs.sendEmail({
          to:       buyer.email,
          subject:  `[AutoParts] Commande ${order.orderNumber} expédiée`,
          template: 'order-shipped',
          context:  { orderNumber: order.orderNumber, orderId: order.id },
        }).catch(e => logger.warn('Email order-shipped non envoyé:', e.message));
      }
    }

    return order;
  },

  async confirm(id: string, callerId: string): Promise<Order> {
    return this.updateStatus(id, 'confirmed');
  },

  async getStats(orgId: string) {
    const qb = orderRepo()
      .createQueryBuilder('o')
      .where('o.sellerOrg.id = :orgId', { orgId })
      .andWhere('o.status NOT IN (:...excluded)', { excluded: ['cancelled', 'refunded'] });

    const [totals, byChannel, byStatus] = await Promise.all([
      qb.select([
        'COUNT(o.id) as count',
        'SUM(o.totalAmount) as revenue',
        'AVG(o.totalAmount) as avgOrder',
      ]).getRawOne<{ count: string; revenue: string; avgOrder: string }>(),

      qb.select(['o.channel', 'COUNT(o.id) as count', 'SUM(o.totalAmount) as revenue'])
        .groupBy('o.channel').getRawMany(),

      orderRepo()
        .createQueryBuilder('o')
        .where('o.sellerOrg.id = :orgId', { orgId })
        .select(['o.status', 'COUNT(o.id) as count'])
        .groupBy('o.status').getRawMany(),
    ]);

    return { totals, byChannel, byStatus };
  },
};

// ─── Contrôleur ──────────────────────────────────────────────────

const Ctrl = {
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await OrdersService.findAll(req.query as any, req.user!);
      res.json(ApiResponse.paginated(result));
    } catch (e) { next(e); }
  },

  getOne: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isAdmin = req.user!.roles.some(r => ['super_admin', 'org_admin'].includes(r));
      const order   = await OrdersService.findById(req.params.id, {
        callerId:    req.user!.id,
        callerOrgId: req.user!.orgId,
        isAdmin,
      });
      res.json(ApiResponse.success(order));
    } catch (e) { next(e); }
  },

  create: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const order = await OrdersService.create(req.user!.id, req.body);
      res.status(201).json(ApiResponse.created(order, 'Commande créée'));
    } catch (e) { next(e); }
  },

  updateStatus: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isAdmin = req.user!.roles.includes('super_admin');
      const order   = await OrdersService.updateStatus(
        req.params.id,
        req.body.status,
        req.body.note,
        { callerId: req.user!.id, callerOrgId: req.user!.orgId, isAdmin },
      );
      res.json(ApiResponse.success(order, 'Statut mis à jour'));
    } catch (e) { next(e); }
  },

  confirm: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const order = await OrdersService.confirm(req.params.id, req.user!.id);
      res.json(ApiResponse.success(order, 'Commande confirmée'));
    } catch (e) { next(e); }
  },

  stats: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await OrdersService.getStats(req.user!.orgId!);
      res.json(ApiResponse.success(stats));
    } catch (e) { next(e); }
  },
};

// ─── Routes ──────────────────────────────────────────────────────


// ─── Service Approbation B2B (ord-5) ─────────────────────────

const B2B_APPROVAL_THRESHOLD = 500_000; // XAF — commandes >500k nécessitent une approbation

export const OrderApprovalService = {
  async requestApproval(orderId: string) {
    const order = await AppDataSource.getRepository(Order).findOne({ where: { id: orderId }, relations: ['sellerOrg'] });
    if (!order) throw ApiError.notFound('Commande');
    if (order.channel !== 'b2b') return null;
    if (order.totalAmount <= B2B_APPROVAL_THRESHOLD) return null;

    return AppDataSource.getRepository(OrderApproval).save({
      order:           { id: orderId },
      status:          'pending',
      thresholdAmount: B2B_APPROVAL_THRESHOLD,
    });
  },

  async decide(approvalId: string, approverId: string, approved: boolean, reason?: string) {
    const approval = await AppDataSource.getRepository(OrderApproval).findOne({
      where: { id: approvalId }, relations: ['order'],
    });
    if (!approval) throw ApiError.notFound("Demande d'approbation");
    if (approval.status !== 'pending') throw ApiError.badRequest('Déjà traité');

    approval.status     = approved ? 'approved' : 'rejected';
    approval.approver   = { id: approverId } as any;
    approval.reason     = reason;
    approval.decidedAt  = new Date();

    const saved = await AppDataSource.getRepository(OrderApproval).save(approval);

    // Mettre à jour le statut de la commande
    const newStatus = approved ? 'confirmed' : 'cancelled';
    await AppDataSource.getRepository(Order).update(approval.order.id, { status: newStatus });

    return saved;
  },

  async pending(orgId: string) {
    return AppDataSource.getRepository(OrderApproval)
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.order','o').leftJoinAndSelect('o.buyer','b')
      .where('a.status = :s AND o.sellerOrg.id = :orgId', { s: 'pending', orgId })
      .orderBy('a.createdAt','DESC')
      .getMany();
  },
};

export const ordersRouter = Router();
ordersRouter.use(authenticate);

ordersRouter.get('/',     validate(OrderQuerySchema, 'query'), Ctrl.list);
ordersRouter.get('/stats', authorize('org_admin', 'super_admin', 'accountant'), Ctrl.stats);
ordersRouter.get('/:id',  Ctrl.getOne);

ordersRouter.post('/',
  authorize('buyer', 'org_admin'),
  validate(CreateOrderSchema),
  Ctrl.create,
);
ordersRouter.patch('/:id/status',
  authorize('seller', 'org_admin', 'super_admin', 'logistics'),
  validate(UpdateOrderStatusSchema),
  Ctrl.updateStatus,
);
ordersRouter.post('/:id/confirm',
  authorize('buyer', 'org_admin'),
  Ctrl.confirm,
);

// Routes approbation B2B (ord-5)
ordersRouter.get('/approvals/pending', authorize('org_admin','super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(ApiResponse.success(await OrderApprovalService.pending(req.user!.orgId!))); } catch(e){next(e);}
});
ordersRouter.post('/approvals/:id/approve', validateParams('id'), authorize('org_admin','super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(ApiResponse.success(await OrderApprovalService.decide(req.params.id, req.user!.id, true, req.body.reason), 'Commande approuvée')); } catch(e){next(e);}
});
ordersRouter.post('/approvals/:id/reject', validateParams('id'), authorize('org_admin','super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(ApiResponse.success(await OrderApprovalService.decide(req.params.id, req.user!.id, false, req.body.reason), 'Commande rejetée')); } catch(e){next(e);}
});
