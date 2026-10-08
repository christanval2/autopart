import { Router, Request, Response, NextFunction } from 'express';
import { z }             from 'zod';
import { AppDataSource } from '../../config/database';
import { User }          from '../../entities/User';
import { Message }       from '../../entities/Message';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { paginate }      from '../../shared/utils/helpers';
import { validate, authenticate, validateParams } from '../../middlewares';

const SendSchema = z.object({
  // R-messages — destinataire par email (résolu serveur) ou par id
  recipientEmail: z.string().email().optional(),
  recipientId: z.string().uuid().optional(),
  subject:     z.string().max(200).trim().optional(),
  body:        z.string().min(1).max(5000).trim(),
  orderId:     z.string().uuid().optional(),
  attachments: z.array(z.string().url()).max(5).optional(),
});

const repo = () => AppDataSource.getRepository(Message);

export const MessagingService = {
  async inbox(userId: string, page = 1, limit = 20) {
    const qb = repo().createQueryBuilder('m')
      .leftJoinAndSelect('m.sender','s').leftJoinAndSelect('m.order','o')
      .where('m.recipient.id = :uid', { uid: userId })
      .orderBy('m.createdAt','DESC');
    return paginate(qb, page, limit);
  },
  async sent(userId: string, page = 1, limit = 20) {
    const qb = repo().createQueryBuilder('m')
      .leftJoinAndSelect('m.recipient','r').leftJoinAndSelect('m.order','o')
      .where('m.sender.id = :uid', { uid: userId })
      .orderBy('m.createdAt','DESC');
    return paginate(qb, page, limit);
  },
  async thread(userId: string, otherId: string, page = 1, limit = 50) {
    const qb = repo().createQueryBuilder('m')
      .leftJoinAndSelect('m.sender','s').leftJoinAndSelect('m.recipient','r')
      .where('(m.sender.id = :uid AND m.recipient.id = :other) OR (m.sender.id = :other AND m.recipient.id = :uid)', { uid: userId, other: otherId })
      .orderBy('m.createdAt','ASC');
    return paginate(qb, page, limit);
  },
  async send(senderId: string, dto: z.infer<typeof SendSchema> & { recipientEmail?: string }) {
    // R-messages — résolution du destinataire par email (formulaire client)
    let recipientId = dto.recipientId;
    if (!recipientId && dto.recipientEmail) {
      const found = await AppDataSource.getRepository(User)
        .createQueryBuilder('u')
        .where('LOWER(u.email) = :email', { email: dto.recipientEmail.toLowerCase() })
        .getOne();
      if (!found) throw ApiError.notFound('Aucun compte avec cet email');
      recipientId = found.id;
    }
    if (!recipientId) throw ApiError.badRequest('Destinataire requis');
    if (recipientId === senderId) throw ApiError.badRequest('Vous ne pouvez pas vous envoyer un message');
    dto.recipientId = recipientId;
    const msg = repo().create({
      sender:    { id: senderId }, recipient: { id: dto.recipientId },
      subject:   dto.subject,   body:       dto.body,
      order:     dto.orderId ? { id: dto.orderId } : undefined,
      attachments: dto.attachments,
    });
    return repo().save(msg);
  },
  async markRead(id: string, userId: string) {
    const msg = await repo().findOne({ where: { id, recipient: { id: userId } } });
    if (!msg) throw ApiError.notFound('Message');
    msg.isRead = true;
    return repo().save(msg);
  },
  async unreadCount(userId: string) {
    return repo().count({ where: { recipient: { id: userId }, isRead: false } });
  },
};

export const messagingRouter = Router();
messagingRouter.use(authenticate);
messagingRouter.get('/inbox',          async (req,res,next) => { try { res.json(ApiResponse.paginated(await MessagingService.inbox(req.user!.id, +req.query.page!||1))); } catch(e){next(e);} });
messagingRouter.get('/sent',           async (req,res,next) => { try { res.json(ApiResponse.paginated(await MessagingService.sent(req.user!.id, +req.query.page!||1))); } catch(e){next(e);} });
// R-messages — contacts : utilisateurs avec qui on a déjà échangé
messagingRouter.get('/contacts', async (req,res,next) => {
  try {
    const rows = await repo().createQueryBuilder('m')
      .select('CASE WHEN m.sender_id = :uid THEN m.recipient_id ELSE m.sender_id END', 'userId')
      .addSelect('MAX(m.createdAt)', 'lastAt')
      .where('m.sender_id = :uid OR m.recipient_id = :uid', { uid: req.user!.id })
      .groupBy('CASE WHEN m.sender_id = :uid THEN m.recipient_id ELSE m.sender_id END')
      .getRawMany();
    const ids = rows.map(r => r.userId);
    const users = ids.length ? await AppDataSource.getRepository(User)
      .createQueryBuilder('u')
      .whereInIds(ids)
      .select(['u.id','u.firstName','u.lastName','u.email'])
      .getMany() : [];
    const lastBy = Object.fromEntries(rows.map(r => [r.userId, r.lastAt]));
    res.json(ApiResponse.success(users.map(u => ({
      id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email,
      lastAt: lastBy[u.id],
    })).sort((a,b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''))));
  } catch(e){next(e);}
});
messagingRouter.get('/unread-count',   async (req,res,next) => { try { res.json(ApiResponse.success({ count: await MessagingService.unreadCount(req.user!.id) })); } catch(e){next(e);} });
messagingRouter.get('/thread/:userId', async (req,res,next) => { try { res.json(ApiResponse.paginated(await MessagingService.thread(req.user!.id, req.params.userId, +req.query.page!||1))); } catch(e){next(e);} });
messagingRouter.post('/',              validate(SendSchema), async (req,res,next) => { try { res.status(201).json(ApiResponse.created(await MessagingService.send(req.user!.id, req.body))); } catch(e){next(e);} });
messagingRouter.patch('/:id/read',     validateParams('id'), async (req,res,next) => { try { res.json(ApiResponse.success(await MessagingService.markRead(req.params.id, req.user!.id))); } catch(e){next(e);} });
