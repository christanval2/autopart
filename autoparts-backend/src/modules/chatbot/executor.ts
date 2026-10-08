/**
 * Exécution des appels d'outils — fait de vraies requêtes vers les services backend.
 */

import { AppDataSource }      from '../../config/database';
import { Product }            from '../../entities/Product';
import { Order }              from '../../entities/Order';
import { Shipment }           from '../../entities/Shipment';
import { Promotion }          from '../../entities/Promotion';
import { SearchService }      from '../search';
import { loadViewerCtx }      from '../../shared/tier-pricing';
import { RecommendationsService } from '../recommendations';
import { LoyaltyService }     from '../loyalty';
import { escapeLike }         from '../../shared/utils/helpers';

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  userId?: string,
): Promise<unknown> {

  switch (toolName) {

    case 'search_products': {
      const q = escapeLike(String(args.query ?? '').slice(0, 100));
      const results = await SearchService.search({
        q, page: 1, limit: Math.min(Number(args.limit) || 5, 5),
        ...(args.condition ? { condition: args.condition as string } : {}),
        ...(args.minPrice  ? { minPrice:  Number(args.minPrice) } : {}),
        ...(args.maxPrice  ? { maxPrice:  Number(args.maxPrice) } : {}),
      } as any, await loadViewerCtx(null));
      return (results.data ?? []).map((p: any) => ({
        id:        p.productId ?? p.id,
        name:      p.name,
        price:     Number(p.basePrice ?? p.price ?? 0),
        currency:  p.currency ?? 'XAF',
        condition: p.condition,
        brand:     p.brandName ?? p.brand?.name,
        oemRef:    p.oemReference,
        inStock:   (p.totalStock ?? 0) > 0,
      }));
    }

    case 'search_by_vehicle': {
      const results = await SearchService.searchByVehicle({
        make:       String(args.make),
        model:      String(args.model),
        year:       args.year ? Number(args.year) : 2000,
        engineCode: args.engineCode ? String(args.engineCode) : undefined,
      } as any, await loadViewerCtx(null));
      const data = (results.data ?? []) as any[];
      const filtered = args.partType
        ? data.filter((p: any) =>
            p.name?.toLowerCase().includes(String(args.partType).toLowerCase()) ||
            p.category?.name?.toLowerCase().includes(String(args.partType).toLowerCase()),
          )
        : data;
      return filtered.slice(0, 5).map((p: any) => ({
        id: p.id, name: p.name, price: Number(p.basePrice ?? 0),
        currency: p.currency ?? 'XAF', brand: p.brand?.name, condition: p.condition,
      }));
    }

    case 'get_order_status': {
      const orderNumber = String(args.orderNumber ?? '').trim();
      const order = await AppDataSource.getRepository(Order).findOne({
        where: { orderNumber },
        relations: ['payment','shipments'],
      });
      if (!order) return { error: `Commande ${orderNumber} introuvable` };
      return {
        orderNumber:   order.orderNumber,
        status:        order.status,
        totalAmount:   Number(order.totalAmount),
        currency:      order.currency,
        paymentStatus: order.payment?.status ?? 'inconnu',
        shippingStatus:order.shipments?.[0]?.status ?? 'pas expédié',
        trackingNumber:order.shipments?.[0]?.trackingNumber ?? null,
        orderedAt:     order.orderedAt,
      };
    }

    case 'track_shipment': {
      const tn = String(args.trackingNumber ?? '').trim();
      const shipment = await AppDataSource.getRepository(Shipment).findOne({
        where: { trackingNumber: tn },
      });
      if (!shipment) return { error: `Colis ${tn} introuvable` };
      return {
        trackingNumber: shipment.trackingNumber,
        status:         shipment.status,
        carrier:        shipment.carrier,
        shippedAt:      shipment.shippedAt,
        deliveredAt:    shipment.deliveredAt,
        estimatedDelivery: (shipment as any).estimatedDelivery,
      };
    }

    case 'check_promotions': {
      const now   = new Date();
      const promos = await AppDataSource.getRepository(Promotion).find({
        where: { isActive: true },
      });
      const active = promos.filter(p =>
        new Date(p.validFrom) <= now && new Date(p.validUntil) >= now,
      );
      return active.map(p => ({
        code:          p.code,
        name:          p.name,
        type:          p.type,
        discountValue: Number(p.discountValue),
        minOrder:      Number(p.minOrderAmount),
        validUntil:    p.validUntil,
      }));
    }

    case 'get_product_details': {
      const product = await AppDataSource.getRepository(Product).findOne({
        where: { id: String(args.productId) },
        relations: ['brand','category','images','variants','compatibilities'],
      });
      if (!product) return { error: 'Produit introuvable' };
      return {
        id:             product.id,
        name:           product.name,
        description:    product.description,
        basePrice:      Number(product.basePrice),
        currency:       product.currency,
        condition:      product.condition,
        brand:          product.brand?.name,
        category:       product.category?.name,
        oemReference:   product.oemReference,
        variants:       product.variants?.length ?? 0,
        compatibilities:product.compatibilities?.slice(0, 5).map(c =>
          `${c.make} ${c.model} ${c.yearFrom}${c.yearTo ? '-'+c.yearTo : '+'}`,
        ),
        avgRating:      (product as any).avgRating,
      };
    }

    case 'get_recommendations': {
      const type = String(args.type ?? 'popular');
      let results: unknown[];
      if (type === 'for-me' && userId) {
        results = await RecommendationsService.forUser(userId, 5);
      } else if (type === 'similar' && args.productId) {
        results = await RecommendationsService.similar(String(args.productId), 5);
      } else {
        results = await RecommendationsService.popular(5);
      }
      return (results as any[]).map(p => ({
        id: p.id, name: p.name, price: Number(p.basePrice), currency: p.currency,
        brand: p.brand?.name, condition: p.condition,
      }));
    }

    case 'get_loyalty_balance': {
      if (!userId) return { error: 'Vous devez être connecté pour consulter vos points' };
      return LoyaltyService.getBalance(userId);
    }

    default:
      return { error: `Outil inconnu: ${toolName}` };
  }
}
