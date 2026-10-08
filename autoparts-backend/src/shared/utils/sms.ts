import { env }    from '../../config/env';
import { logger } from './logger';

interface SmsProvider {
  send(to: string, body: string): Promise<boolean>;
}

/**
 * Implémentation stub SMS — remplacer par Vonage/Twilio/Africa's Talking
 * selon disponibilité au Cameroun.
 *
 * Africa's Talking est recommandé pour le Cameroun.
 * npm install africastalking
 */
class AfricasTalkingProvider implements SmsProvider {
  async send(to: string, body: string): Promise<boolean> {
    try {
      if (!env.SMS_API_KEY || !env.SMS_USERNAME) {
        logger.warn('SMS non configuré — SMS non envoyé à ' + to);
        return false;
      }
      // Dynamique pour éviter de casser si la lib n'est pas installée
      const AT = await import('africastalking').then(m => m.default || m).catch(() => null);
      if (!AT) { logger.warn('africastalking non installé'); return false; }

      const client = AT({ apiKey: env.SMS_API_KEY, username: env.SMS_USERNAME });
      await client.SMS.send({ to: [to], message: body, from: 'AutoParts' });
      logger.info(`SMS envoyé à ${to}`);
      return true;
    } catch (err) {
      logger.error('Erreur envoi SMS:', err);
      return false;
    }
  }
}

const provider = new AfricasTalkingProvider();

export const smsService = {
  async sendOrderConfirmation(phone: string, orderNumber: string, total: string) {
    return provider.send(phone, `AutoParts: Votre commande #${orderNumber} de ${total} XAF est confirmée. Merci !`);
  },
  async sendPaymentReceived(phone: string, amount: string, orderNumber: string) {
    return provider.send(phone, `AutoParts: Paiement de ${amount} XAF reçu pour la commande #${orderNumber}. Merci !`);
  },
  async sendShipmentUpdate(phone: string, orderNumber: string, status: string) {
    return provider.send(phone, `AutoParts: Votre commande #${orderNumber} - Statut livraison: ${status}`);
  },
  async sendOTP(phone: string, code: string) {
    return provider.send(phone, `AutoParts: Votre code de vérification est ${code}. Valable 5 minutes.`);
  },
  async send(phone: string, message: string) {
    return provider.send(phone, message);
  },
};

// ── F5.3 — envoi SMS à un utilisateur avec respect de l'opt-out ──
// Les messages critiques (OTP 2FA) contournent toujours l'opt-out.
import { AppDataSource } from '../../config/database';
import { decryptPhone }  from './phone';

export const smsUserService = {
  async sendToUser(userId: string, message: string, opts?: { critical?: boolean }): Promise<boolean> {
    const user = await AppDataSource.getRepository('User').findOneBy({ id: userId }) as { smsOptOut?: boolean; phoneEnc?: string | null } | null;
    if (!user) return false;
    if (user.smsOptOut && !opts?.critical) return false; // opt-out respecté
    const phone = decryptPhone(user.phoneEnc);
    if (!phone) return false;
    return provider.send(phone, message);
  },
};
