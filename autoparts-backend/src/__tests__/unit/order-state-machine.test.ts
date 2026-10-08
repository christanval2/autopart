// ═══════════════════════════════════════════════════════════════
//  TEST MACHINE À ÉTATS — contre le CODE DE PRODUCTION
//  (ORDER_TRANSITIONS / canOrderTransition du module orders)
// ═══════════════════════════════════════════════════════════════

import { ORDER_TRANSITIONS, canOrderTransition } from '../../modules/orders';

const ALL_STATUSES = Object.keys(ORDER_TRANSITIONS) as Array<keyof typeof ORDER_TRANSITIONS>;

describe('ORDER_TRANSITIONS (code de production)', () => {
  it('tous les statuts ont une entrée dans la table', () => {
    for (const status of ALL_STATUSES) {
      expect(Array.isArray(ORDER_TRANSITIONS[status])).toBe(true);
    }
  });

  describe('Transitions valides', () => {
    it('draft → confirmed', () => expect(canOrderTransition('draft', 'confirmed')).toBe(true));
    it('draft → cancelled', () => expect(canOrderTransition('draft', 'cancelled')).toBe(true));
    it('confirmed → processing', () => expect(canOrderTransition('confirmed', 'processing')).toBe(true));
    it('processing → shipped', () => expect(canOrderTransition('processing', 'shipped')).toBe(true));
    it('shipped → delivered', () => expect(canOrderTransition('shipped', 'delivered')).toBe(true));
    it('delivered → refunded', () => expect(canOrderTransition('delivered', 'refunded')).toBe(true));
  });

  describe('Transitions invalides', () => {
    it('refunded → confirmed impossible', () => expect(canOrderTransition('refunded', 'confirmed')).toBe(false));
    it('cancelled → processing impossible', () => expect(canOrderTransition('cancelled', 'processing')).toBe(false));
    it('draft → delivered saut interdit', () => expect(canOrderTransition('draft', 'delivered')).toBe(false));
    it('delivered → shipped (retour arrière) interdit', () => expect(canOrderTransition('delivered', 'shipped')).toBe(false));
    it('shipped → cancelled interdit (colis déjà parti)', () => expect(canOrderTransition('shipped', 'cancelled')).toBe(false));
  });

  describe('Statuts terminaux', () => {
    it('refunded est terminal', () => expect(ORDER_TRANSITIONS.refunded).toHaveLength(0));
    it('cancelled est terminal', () => expect(ORDER_TRANSITIONS.cancelled).toHaveLength(0));
  });

  describe('Cohérence du graphe', () => {
    it('aucune transition ne pointe vers un statut inconnu', () => {
      for (const [from, targets] of Object.entries(ORDER_TRANSITIONS)) {
        for (const to of targets) {
          expect(ALL_STATUSES).toContain(to);
          expect([from, to]).not.toContain('pending_payment'); // statut supprimé de l'enum
        }
      }
    });

    it('aucune auto-transition', () => {
      for (const status of ALL_STATUSES) {
        expect(canOrderTransition(status, status)).toBe(false);
      }
    });
  });
});
