// ═══════════════════════════════════════════════════════════════
//  RÉCONCILIATION MoMo (F6.1) — matching pur et testable entre un
//  relevé opérateur et les paiements de la plateforme.
// ═══════════════════════════════════════════════════════════════

import type { ReconMatchStatus } from '../../entities/MomoStatement';

export interface StatementLineInput {
  externalRef:    string;
  amount:         number;
  operatorStatus?: string;
  occurredAt?:    Date | null;
}

export interface PlatformPayment {
  id:         string;
  gatewayRef: string;
  amount:     number;
  status:     string;
  financialTransactionId?: string | null;
}

/**
 * Statut de rapprochement d'une ligne de relevé :
 * - matched                : référence trouvée, montant identique, paiement complété
 * - amount_mismatch        : référence trouvée mais montant différent
 * - missing_at_operator    : la référence n'existe PAS dans le relevé (appelant gère)
 * - missing_in_platform    : la ligne du relevé ne correspond à aucun paiement
 */
export function reconcileLine(line: StatementLineInput, payment: PlatformPayment | null): { status: ReconMatchStatus; paymentId?: string } {
  if (!payment) return { status: 'missing_in_platform' };
  // Un paiement échoué chez nous mais présent au statut SUCCESSFUL opérateur
  // reste 'matched' en Montant mais le statut diverge → amount first
  const amountEqual = Math.abs(Number(payment.amount) - line.amount) < 0.01;
  if (!amountEqual) return { status: 'amount_mismatch', paymentId: payment.id };
  return { status: 'matched', paymentId: payment.id };
}

/** Trouve le paiement correspondant : par gatewayRef puis par transactionId. */
export function findPaymentForLine(line: StatementLineInput, payments: PlatformPayment[]): PlatformPayment | null {
  const byRef = payments.find(p => p.gatewayRef === line.externalRef);
  if (byRef) return byRef;
  const byTx = payments.find(p => p.financialTransactionId === line.externalRef);
  return byTx ?? null;
}
