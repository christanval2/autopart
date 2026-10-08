// ═══════════════════════════════════════════════════════════════
//  STOCK MOVEMENTS (F3) — journal d'audit avant/après.
//  À appeler DANS la transaction qui mute le stock, sinon l'audit
//  n'est pas fiable. qtyBefore/qtyAfter optionnels quand la logique
//  métier ne peut pas les déterminer (ex: réservation multi-entrepôts).
// ═══════════════════════════════════════════════════════════════

import { EntityManager } from 'typeorm';
import { StockMovement, StockMovementReason } from '../../entities/StockMovement';

export interface MovementInput {
  variantId:    string;
  warehouseId?: string | null;
  reason:       StockMovementReason;
  qtyDelta:     number;   // signé : +entrée / −sortie
  qtyBefore?:   number | null;
  qtyAfter?:    number | null;
  userId?:      string | null;
  orderId?:     string | null;
  note?:        string | null;
}

export function recordStockMovement(manager: EntityManager, m: MovementInput): Promise<unknown> {
  const repo = manager.getRepository(StockMovement);
  return repo.save(repo.create({
    variantId:   m.variantId,
    warehouseId: m.warehouseId ?? undefined,
    reason:      m.reason,
    qtyDelta:    Math.trunc(m.qtyDelta),
    qtyBefore:   m.qtyBefore != null ? Math.trunc(m.qtyBefore) : null,
    qtyAfter:    m.qtyAfter != null ? Math.trunc(m.qtyAfter) : null,
    userId:      m.userId ?? undefined,
    orderId:     m.orderId ?? undefined,
    note:        m.note ?? undefined,
  }));
}
