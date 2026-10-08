// ═══════════════════════════════════════════════════════════════
//  NOTIFICATIONS MODULE — In-app + WebSocket (Socket.io)
// ═══════════════════════════════════════════════════════════════

import { Router, Request, Response, NextFunction } from 'express';
import { z }                   from 'zod';
import { Server as SocketServer, Socket } from 'socket.io';
import jwt                     from 'jsonwebtoken';
import { AppDataSource }       from '../../config/database';
import { Notification }        from '../../entities/Notification';
import { User }                from '../../entities/User';
import { redis }               from '../../config/redis';
import { env }                 from '../../config/env';
import { ApiResponse }         from '../../shared/utils/response';
import { paginate }            from '../../shared/utils/helpers';
import { validate, authenticate } from '../../middlewares';
import { logger }              from '../../shared/utils/logger';

// ─── Schémas Zod ─────────────────────────────────────────────────

const NotifQuerySchema = z.object({
  page:    z.coerce.number().int().positive().default(1),
  limit:   z.coerce.number().int().min(1).max(50).default(20),
  unread:  z.coerce.boolean().optional(),
  type:    z.enum(['order_update','stock_alert','payment','promo','system']).optional(),
});

// ─── Repository helper ────────────────────────────────────────────

const notifRepo = () => AppDataSource.getRepository(Notification);

// ─── Service ─────────────────────────────────────────────────────

export const NotificationsService = {

  async findAll(userId: string, query: z.infer<typeof NotifQuerySchema>) {
    const qb = notifRepo()
      .createQueryBuilder('n')
      .where('n.user.id = :userId', { userId })
      .orderBy('n.createdAt', 'DESC');

    if (query.unread !== undefined) qb.andWhere('n.isRead = :r', { r: !query.unread });
    if (query.type)                 qb.andWhere('n.type = :t',   { t: query.type });

    return paginate(qb, query.page, query.limit);
  },

  async unreadCount(userId: string): Promise<number> {
    return notifRepo().countBy({ user: { id: userId }, isRead: false });
  },

  async markRead(id: string, userId: string): Promise<void> {
    await notifRepo().update(
      { id, user: { id: userId } },
      { isRead: true },
    );
  },

  async markAllRead(userId: string): Promise<void> {
    await notifRepo()
      .createQueryBuilder()
      .update()
      .set({ isRead: true })
      .where('userId = :userId AND isRead = false', { userId })
      .execute();
  },

  async create(data: {
    userId: string;
    type:   string;
    title:  string;
    body:   string;
    payload?: Record<string, unknown>;
  }): Promise<Notification> {
    const notif = notifRepo().create({
      user:    { id: data.userId },
      type:    data.type as any,
      title:   data.title,
      body:    data.body,
      payload: data.payload,
      isRead:  false,
    });
    return notifRepo().save(notif);
  },

  /** Diffuse vers l'utilisateur connecté via Redis pub/sub */
  async push(userId: string, notification: Notification): Promise<void> {
    await redis.publish(
      `notif:${userId}`,
      JSON.stringify(notification),
    );
  },
};

// ─── WebSocket setup ──────────────────────────────────────────────

/**
 * Initialise Socket.io sur le serveur HTTP Express.
 * Appeler depuis server.ts après app.listen().
 */
export function initWebSocket(server: any): SocketServer {
  const io = new SocketServer(server, {
    cors: {
      origin:      env.ALLOWED_ORIGINS.split(','),
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Middleware d'authentification Socket.io
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) return next(new Error('Authentification requise'));

    try {
      const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as { sub: string };
      (socket as any).userId = payload.sub;
      next();
    } catch {
      next(new Error('Token invalide'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = (socket as any).userId as string;
    logger.debug(`WebSocket connecté: user ${userId}`);

    // L'utilisateur rejoint sa room personnelle
    socket.join(`user:${userId}`);

    // Souscrire aux notifications Redis pour cet utilisateur
    const subscriber = redis.duplicate();
    subscriber.subscribe(`notif:${userId}`, (err) => {
      if (err) logger.error('Redis subscribe error:', err);
    });

    subscriber.on('message', (_channel: string, message: string) => {
      socket.emit('notification', JSON.parse(message));
    });

    socket.on('mark-read', async (notifId: string) => {
      await NotificationsService.markRead(notifId, userId);
      socket.emit('notification-read', { id: notifId });
    });

    socket.on('disconnect', () => {
      subscriber.unsubscribe();
      subscriber.quit();
      logger.debug(`WebSocket déconnecté: user ${userId}`);
    });
  });

  // Subscriber global pour les événements order/stock
  const globalSub = redis.duplicate();
  globalSub.subscribe('stock:low', 'order:status-changed');

  globalSub.on('message', async (channel: string, message: string) => {
    const data = JSON.parse(message);

    if (channel === 'order:status-changed') {
      // Notifier le buyer
      io.to(`user:${data.buyerId}`).emit('order-update', data);
    }

    if (channel === 'stock:low') {
      // Notifier les admins de l'org concernée (room org:XXX)
      io.to(`org:${data.orgId}`).emit('stock-alert', data);
    }
  });

  return io;
}

// ─── Contrôleur REST ─────────────────────────────────────────────

const Ctrl = {
  list: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await NotificationsService.findAll(req.user!.id, req.query as any);
      res.json(ApiResponse.paginated(result));
    } catch(e){next(e);}
  },
  unreadCount: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const count = await NotificationsService.unreadCount(req.user!.id);
      res.json(ApiResponse.success({ count }));
    } catch(e){next(e);}
  },
  markRead: async (req: Request, res: Response, next: NextFunction) => {
    try {
      await NotificationsService.markRead(req.params.id, req.user!.id);
      res.json(ApiResponse.noContent());
    } catch(e){next(e);}
  },
  markAllRead: async (req: Request, res: Response, next: NextFunction) => {
    try {
      await NotificationsService.markAllRead(req.user!.id);
      res.json(ApiResponse.noContent());
    } catch(e){next(e);}
  },
};

// ─── Routes ──────────────────────────────────────────────────────

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

// ── E2 : enregistrement du token push Expo (mobile) ──────────────
const PushTokenSchema = z.object({
  token: z.string().regex(/^ExponentPushToken\[[^\]]+\]$/, 'Token Expo invalide'),
});

notificationsRouter.post('/push-token', validate(PushTokenSchema), async (req, res, next) => {
  try {
    await AppDataSource.getRepository(User)
      .update(req.user!.id, { expoPushToken: req.body.token });
    res.json(ApiResponse.success(null, 'Token push enregistré'));
  } catch (e) { next(e); }
});

notificationsRouter.delete('/push-token', async (req, res, next) => {
  try {
    await AppDataSource.getRepository(User)
      .update(req.user!.id, { expoPushToken: null });
    res.json(ApiResponse.noContent());
  } catch (e) { next(e); }
});

notificationsRouter.get('/',             validate(NotifQuerySchema, 'query'), Ctrl.list);
notificationsRouter.get('/unread-count',                                      Ctrl.unreadCount);
notificationsRouter.patch('/:id/read',                                        Ctrl.markRead);
notificationsRouter.patch('/read-all',                                        Ctrl.markAllRead);
