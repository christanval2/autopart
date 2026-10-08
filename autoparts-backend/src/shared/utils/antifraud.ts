import { AppDataSource } from '../../config/database';
import { Order }         from '../../entities/Order';
import { Payment }       from '../../entities/Payment';
import { redis }         from '../../config/redis';
import { logger }        from './logger';

interface FraudCheckResult {
  score:      number;   // 0-100 (0 = sûr, 100 = fraude probable)
  blocked:    boolean;
  reasons:    string[];
}

export const antiFraud = {
  /**
   * Vérification anti-fraude d'une tentative de commande/paiement.
   * Score composite basé sur plusieurs signaux.
   */
  async checkOrder(
    userId: string,
    ip: string,
    amount: number,
    method: string,
  ): Promise<FraudCheckResult> {
    const reasons: string[] = [];
    let score = 0;

    // Signal 1 : trop de commandes échouées récentes (30 dernières minutes)
    const failedKey  = `fraud:failed:${userId}`;
    const failCount  = parseInt(await redis.get(failedKey) ?? '0');
    if (failCount >= 3) { score += 40; reasons.push('Trop de tentatives échouées récentes'); }
    else if (failCount >= 1) { score += 10; }

    // Signal 2 : même IP avec beaucoup de tentatives
    const ipKey      = `fraud:ip:${ip}`;
    const ipCount    = parseInt(await redis.get(ipKey) ?? '0');
    await redis.incr(ipKey);
    await redis.expire(ipKey, 900); // 15 minutes
    if (ipCount >= 10) { score += 30; reasons.push('Trop de tentatives depuis cette IP'); }
    else if (ipCount >= 5) { score += 15; }

    // Signal 3 : montant inhabituel (>3x la moyenne des commandes de l'user)
    try {
      const avgResult = await AppDataSource.getRepository(Order)
        .createQueryBuilder('o')
        .select('AVG(o.totalAmount)', 'avg')
        .where('o.buyer.id = :uid AND o.status NOT IN (:...excl)', { uid: userId, excl: ['cancelled','refunded'] })
        .getRawOne<{ avg: string }>();
      const avg = parseFloat(avgResult?.avg ?? '0');
      if (avg > 0 && amount > avg * 5) {
        score += 20; reasons.push('Montant inhabituellement élevé');
      }
    } catch { /* non bloquant */ }

    // Signal 4 : multiples paiements échoués sur le même jour
    try {
      const todayFailed = await AppDataSource.getRepository(Payment)
        .createQueryBuilder('p')
        .innerJoin('p.order','o')
        .where("o.buyer.id = :uid AND p.status = 'failed' AND p.created_at > NOW() - INTERVAL '24 hours'", { uid: userId })
        .getCount();
      if (todayFailed >= 5) { score += 30; reasons.push('5+ paiements échoués aujourd\'hui'); }
      else if (todayFailed >= 2) { score += 10; }
    } catch { /* non bloquant */ }

    // Signal 5 : méthode de paiement inhabituelle combinée à gros montant
    if (method === 'mobile_money' && amount > 2_000_000) {
      score += 10; reasons.push('Gros montant Mobile Money');
    }

    const blocked = score >= 60;

    if (score > 0) {
      logger.warn(`AntiFragraud: user=${userId} ip=${ip} score=${score} blocked=${blocked}`, { reasons });
    }

    return { score: Math.min(score, 100), blocked, reasons };
  },

  /** Enregistrer un paiement échoué pour l'historique de fraude */
  async recordFailedPayment(userId: string, ip: string): Promise<void> {
    const key = `fraud:failed:${userId}`;
    await redis.incr(key);
    await redis.expire(key, 1800); // 30 minutes

    const ipKey = `fraud:ip:${ip}`;
    await redis.incr(ipKey);
    await redis.expire(ipKey, 900);
  },

  /** Réinitialiser les compteurs après un paiement réussi */
  async recordSuccess(userId: string, ip: string): Promise<void> {
    await redis.del(`fraud:failed:${userId}`);
  },
};
