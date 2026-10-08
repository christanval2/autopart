import { EntityManager } from 'typeorm';
import { ApiError }      from './response';

/**
 * Réservation atomique de stock avec SELECT FOR UPDATE SKIP LOCKED.
 * Élimine les race conditions lors de commandes simultanées.
 */
export async function reserveStock(params: {
  manager: EntityManager; variantId: string; sellerOrgId: string; quantity: number;
}): Promise<{ stockLevelId: string; warehouseId: string }> {
  const qty = Math.trunc(Number(params.quantity));
  const rows = await params.manager.query(
    `SELECT sl.id, sl.warehouse_id
     FROM   stock_levels sl
     INNER JOIN warehouses wh ON wh.id = sl.warehouse_id
     WHERE  sl.variant_id = $1 AND wh.org_id = $2
       AND  (sl.qty_on_hand - sl.qty_reserved) >= $3
     ORDER BY sl.qty_on_hand DESC LIMIT 1
     FOR UPDATE SKIP LOCKED`,
    [params.variantId, params.sellerOrgId, qty],
  );
  if (!rows.length) {
    throw ApiError.badRequest(
      `Stock insuffisant pour ${qty} unité(s) demandée(s). Réessayez dans quelques secondes.`
    );
  }
  await params.manager.query(
    `UPDATE stock_levels SET qty_reserved = qty_reserved + $1 WHERE id = $2`,
    [qty, rows[0].id],
  );
  return { stockLevelId: rows[0].id, warehouseId: rows[0].warehouse_id };
}

export async function releaseStock(
  manager: EntityManager, stockLevelId: string, quantity: number,
): Promise<void> {
  await manager.query(
    `UPDATE stock_levels SET qty_reserved = GREATEST(0, qty_reserved - $1) WHERE id = $2`,
    [Math.trunc(Number(quantity)), stockLevelId],
  );
}
