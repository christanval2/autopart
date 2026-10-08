/**
 * Module Voice Order — LiveKit + Groq
 *
 * Flux :
 * 1. Client → POST /voice-order/session     → room + token LiveKit
 *    Le backend crée AUSSI le dispatch vers l'agent worker (voice-agent/agent.py,
 *    agent_name 'autoparts-voice-agent') via AgentDispatchClient — l'agent rejoint
 *    la room automatiquement, sans serveur HTTP intermédiaire.
 * 2. Client rejoint la room ; l'agent lit userId + authToken depuis room.metadata
 * 3. Client parle → Groq Whisper transcrit → LLaMA 3.3 + tool calling
 * 4. Agent → POST /voice-order/order (Bearer authToken de l'utilisateur)
 *    → le backend résout vendeur/adresses, crée la commande et initie MoMo
 */

import { Router, Request, Response, NextFunction } from 'express';
import { AccessToken, RoomServiceClient, AgentDispatchClient } from 'livekit-server-sdk';
import jwt                 from 'jsonwebtoken';
import { z }               from 'zod';
import { AppDataSource }   from '../../config/database';
import { User }            from '../../entities/User';
import { Address }         from '../../entities/Address';
import { StockLevel }      from '../../entities/StockLevel';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { authenticate, validate } from '../../middlewares';
import { env }             from '../../config/env';
import { logger }          from '../../shared/utils/logger';
import { v4 as uuidv4 }   from 'uuid';
import { OrdersService }   from '../orders';
import { PaymentsService } from '../payments';

export const VOICE_AGENT_NAME = 'autoparts-voice-agent';

// ─── Config LiveKit ───────────────────────────────────────────
function getLKConfig() {
  if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET || !env.LIVEKIT_URL) {
    throw ApiError.badRequest('LiveKit non configuré (LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL requis)');
  }
  return {
    apiKey:    env.LIVEKIT_API_KEY,
    apiSecret: env.LIVEKIT_API_SECRET,
    url:       env.LIVEKIT_URL,
  };
}

// ─── Génération du token LiveKit ──────────────────────────────
async function createToken(params: {
  roomName:    string;
  identity:    string;
  displayName: string;
  isAgent?:    boolean;
  metadata?:   Record<string, unknown>;
}): Promise<string> {
  const cfg   = getLKConfig();
  const token = new AccessToken(cfg.apiKey, cfg.apiSecret, {
    identity: params.identity,
    name:     params.displayName,
    ttl:      '30m',
    ...(params.metadata ? { metadata: JSON.stringify(params.metadata) } : {}),
  });

  token.addGrant({
    room:              params.roomName,
    roomJoin:          true,
    canPublish:        !params.isAgent,  // Le client publie son audio
    canSubscribe:      true,             // Tous reçoivent l'audio
    canPublishData:    true,             // Pour envoyer des messages texte
    roomCreate:        params.isAgent,   // L'agent crée la room si besoin
    roomRecord:        params.isAgent,
  });

  return token.toJwt();
}

/** JWT utilisateur court (15 min) confié à l'agent via room.metadata. */
function mintUserVoiceToken(user: User): string {
  return jwt.sign(
    { sub: user.id, orgId: user.orgId ?? null, roles: user.roles, email: user.email },
    env.JWT_ACCESS_SECRET,
    { issuer: 'autoparts-api', audience: 'autoparts-client', expiresIn: '15m' },
  );
}

// ─── Service ──────────────────────────────────────────────────
export const VoiceOrderService = {

  /** Créer une session de commande vocale */
  async createSession(userId: string): Promise<{
    roomName: string;
    token:    string;
    agentUrl: string;
    sessionId: string;
    agentDispatched: boolean;
  }> {
    const user = await AppDataSource.getRepository(User).findOneBy({ id: userId });
    if (!user) throw ApiError.notFound('Utilisateur');

    const sessionId = uuidv4();
    const roomName  = `voice-order-${sessionId}`;

    // Token pour le client — les métadonnées portent userId + un JWT court
    // que l'agent utilisera pour passer la commande au nom du client.
    const token = await createToken({
      roomName,
      identity:    `customer-${userId}`,
      displayName: `${user.firstName} ${user.lastName}`,
      metadata:    { userId, authToken: mintUserVoiceToken(user) },
    });

    // Dispatch de l'agent worker (voice-agent/agent.py) vers la room.
    // C'est le mécanisme officiel : plus de serveur HTTP intermédiaire.
    let agentDispatched = false;
    try {
      const cfg = getLKConfig();
      const dispatch = new AgentDispatchClient(cfg.url, cfg.apiKey, cfg.apiSecret);
      await dispatch.createDispatch(roomName, VOICE_AGENT_NAME);
      agentDispatched = true;
    } catch (e) {
      logger.warn('Dispatch agent vocal échoué (worker voice-agent déployé ?):', (e as Error).message);
    }

    logger.info(`Session vocale créée: ${roomName} pour user ${userId} (dispatch: ${agentDispatched})`);

    return {
      roomName,
      token,
      agentUrl: env.LIVEKIT_URL!,
      sessionId,
      agentDispatched,
    };
  },

  /** Token pour l'agent vocal (généré côté agent Python) */
  async createAgentToken(roomName: string, sessionId: string): Promise<string> {
    return createToken({
      roomName,
      identity:    `autoparts-agent-${sessionId}`,
      displayName: 'AutoBot Vocal',
      isAgent:     true,
    });
  },

  /** Supprimer une room après fin de session */
  async closeSession(roomName: string): Promise<void> {
    const cfg = getLKConfig();
    const svc = new RoomServiceClient(cfg.url, cfg.apiKey, cfg.apiSecret);
    await svc.deleteRoom(roomName).catch(e => logger.warn('closeSession:', e.message));
  },
};

// ─── Routes ──────────────────────────────────────────────────
export const voiceOrderRouter = Router();

/**
 * POST /voice-order/session
 * Crée une room LiveKit + token client, et crée le dispatch vers l'agent
 * worker (voir VOICE_AGENT_NAME). La réponse indique honnêtement si
 * l'agent a bien été dispatché.
 */
voiceOrderRouter.post('/session',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await VoiceOrderService.createSession(req.user!.id);
      res.status(201).json(ApiResponse.success(session,
        session.agentDispatched
          ? 'Session vocale créée — AutoBot va vous rejoindre dans quelques secondes'
          : 'Session vocale créée, mais l\'agent vocal n\'a pas pu être joint (worker voice-agent non déployé ?)'));
    } catch(e) { next(e); }
  },
);

// ─── Commande vocale (appelée par l'agent avec le JWT de l'utilisateur) ───

const VoiceOrderSchema = z.object({
  lines: z.array(z.object({
    variantId: z.string().uuid(),
    quantity:  z.number().int().positive().max(1000),
  })).min(1).max(20),
  paymentMethod: z.enum(['mtn_momo', 'orange_money']),
  phone:         z.string().regex(/^\+?[0-9]{8,15}$/),
  notes:         z.string().max(500).optional(),
});

/**
 * POST /voice-order/order
 * Crée la commande passée par voie vocale puis initie le paiement Mobile
 * Money. Résout côté backend ce que l'agent ne peut pas connaître :
 * - le vendeur (organisation détentrice du stock de chaque variante)
 * - les adresses de facturation/livraison par défaut du client
 * Les lignes sont groupées par vendeur (une commande par organisation).
 */
voiceOrderRouter.post('/order',
  authenticate,
  validate(VoiceOrderSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const buyerId = req.user!.id;

      // 1. Adresse par défaut du client (exigée pour la facturation/livraison)
      const address = await AppDataSource.getRepository(Address).findOne({
        where: { user: { id: buyerId } as any, isDefault: true },
      });
      if (!address) {
        throw ApiError.badRequest('Enregistrez une adresse de livraison par défaut avant de commander par voix');
      }

      // 2. Vendeur par variante = organisation détentrice du stock
      const rows = await AppDataSource.getRepository(StockLevel)
        .createQueryBuilder('sl')
        .innerJoin('sl.warehouse', 'wh')
        .select('sl.variant_id', 'variantId')
        .addSelect('MIN(wh.org_id)', 'orgId')
        .where('sl.variant_id IN (:...vids)', { vids: req.body.lines.map((l: any) => l.variantId) })
        .groupBy('sl.variant_id')
        .getRawMany<{ variantId: string; orgId: string }>();
      const sellerOf = new Map(rows.map(r => [r.variantId, r.orgId]));
      if (sellerOf.size < req.body.lines.length) {
        throw ApiError.badRequest('Certaines pièces ne sont disponibles chez aucun vendeur');
      }

      // 3. Grouper les lignes par vendeur → une commande par organisation
      const bySeller = new Map<string, Array<{ variantId: string; quantity: number }>>();
      for (const line of req.body.lines) {
        const orgId = sellerOf.get(line.variantId)!;
        if (!bySeller.has(orgId)) bySeller.set(orgId, []);
        bySeller.get(orgId)!.push({ variantId: line.variantId, quantity: line.quantity });
      }

      const provider = req.body.paymentMethod === 'mtn_momo' ? 'mtn' : 'orange';
      const created = [];
      for (const [sellerOrgId, lines] of bySeller) {
        const order = await OrdersService.create(buyerId, {
          sellerOrgId,
          channel:      'b2c',
          billingAddressId:  address.id,
          shippingAddressId: address.id,
          lines:       lines.map(l => ({ variantId: l.variantId, quantity: l.quantity })),
          notes:       req.body.notes ?? 'Commande passée par appel vocal AutoBot',
          currency:    'XAF',
        });

        const payment = await PaymentsService.initiate({
          orderId: order.id, method: 'mobile_money',
          phone: req.body.phone, provider,
        });
        created.push({
          orderNumber: order.orderNumber,
          orderId:     order.id,
          totalAmount: Number(order.totalAmount),
          paymentId:   payment.id,
        });
      }

      res.status(201).json(ApiResponse.created({
        orders: created,
        total:  created.reduce((s, o) => s + o.totalAmount, 0),
      }, `Commande confirmée — validez le paiement sur ${req.body.phone}`));
    } catch(e) { next(e); }
  },
);

/**
 * POST /voice-order/agent-token
 * Endpoint interne appelé par l'agent Python pour obtenir son token.
 * Protégé par une clé secrète partagée.
 */
voiceOrderRouter.post('/agent-token',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { roomName, sessionId, agentSecret } = req.body;
      if (agentSecret !== env.VOICE_AGENT_SECRET) {
        return next(ApiError.forbidden());
      }
      const token = await VoiceOrderService.createAgentToken(roomName, sessionId);
      res.json(ApiResponse.success({ token }));
    } catch(e) { next(e); }
  },
);

/**
 * DELETE /voice-order/session/:roomName
 * Ferme la session LiveKit.
 */
voiceOrderRouter.delete('/session/:roomName',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await VoiceOrderService.closeSession(req.params.roomName);
      res.json(ApiResponse.noContent());
    } catch(e) { next(e); }
  },
);

/**
 * GET /voice-order/status
 * Vérifie la configuration LiveKit.
 */
voiceOrderRouter.get('/status',
  async (_req: Request, res: Response) => {
    res.json(ApiResponse.success({
      configured: !!(env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET && env.LIVEKIT_URL),
      livekitUrl:  env.LIVEKIT_URL ?? null,
      agentName:   VOICE_AGENT_NAME,
    }));
  },
);
