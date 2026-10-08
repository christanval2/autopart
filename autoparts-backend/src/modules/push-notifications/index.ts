import { AppDataSource } from '../../config/database';
import { User }          from '../../entities/User';
import { logger }        from '../../shared/utils/logger';

interface PushMsg { to:string; title:string; body:string; data?:Record<string,unknown>; sound?:'default'|null; priority?:'high'|'normal'; }
const EXPO_URL = 'https://exp.host/--/api/v2/push/send';

export async function sendPushNotifications(msgs: PushMsg[]): Promise<void> {
  if (!msgs.length) return;
  for (let i=0;i<msgs.length;i+=100) {
    try {
      await fetch(EXPO_URL,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(msgs.slice(i,i+100)) });
    } catch(e){ logger.error('Expo push error:',e); }
  }
}

export async function notifyUser(userId:string, title:string, body:string, data?:Record<string,unknown>): Promise<void> {
  try {
    const user = await AppDataSource.getRepository(User).findOneBy({ id: userId });
    const token = user?.expoPushToken;
    if (!token) return;
    if (!token.startsWith('ExponentPushToken[')) return;
    await sendPushNotifications([{ to:token, title, body, data, sound:'default', priority:'high' }]);
  } catch(e){ logger.error('notifyUser:',e); }
}

export const PushTemplates = {
  orderDelivered: (n:string) => ({ title:'📦 Livraison effectuée', body:`Commande #${n} livrée. Laissez un avis !`, data:{ type:'order_delivered', orderNumber:n } }),
  orderShipped:   (n:string,tr:string) => ({ title:'🚚 Commande expédiée', body:`#${n} en route ! Suivi: ${tr}`, data:{ type:'order_shipped' } }),
  paymentReceived:(a:string,n:string) => ({ title:'💰 Paiement reçu', body:`${a} reçu pour la commande #${n}.`, data:{ type:'payment_received' } }),
  loyaltyEarned:  (p:number,b:number) => ({ title:'🎁 Points crédités', body:`+${p} pts ! Total: ${b} pts`, data:{ type:'loyalty_earned' } }),
  newMessage:     (s:string) => ({ title:'💬 Nouveau message', body:`${s} vous a envoyé un message.`, data:{ type:'new_message' } }),
};

// ═══════════════════════════════════════════════════════════════
//  Routeur d'enregistrement du token Expo (monté sur /notifications)
//  POST /notifications/push-token { token }
// ═══════════════════════════════════════════════════════════════

import { Router, Request, Response, NextFunction } from 'express';
import { z }                       from 'zod';
import { ApiResponse, ApiError }   from '../../shared/utils/response';
import { validate, authenticate }  from '../../middlewares';

const PushTokenSchema = z.object({
  // Token Expo (ExponentPushToken[…]) émis par expo-notifications
  token: z.string().min(10).max(255),
});

export const pushRouter = Router();

pushRouter.use(authenticate);

pushRouter.post('/push-token',
  validate(PushTokenSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = (req.body as z.infer<typeof PushTokenSchema>).token;
      if (!token.startsWith('ExponentPushToken[')) {
        throw ApiError.badRequest('Token Expo invalide (attendu : ExponentPushToken[…])');
      }
      await AppDataSource.getRepository(User).update(req.user!.id, { expoPushToken: token });
      res.json(ApiResponse.success({ registered: true }, 'Token push enregistré'));
    } catch (e) { next(e); }
  },
);
