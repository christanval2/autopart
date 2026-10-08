import { Router, Request, Response, NextFunction } from 'express';
import { AppDataSource }  from '../../config/database';
import { AuditLog }       from '../../entities/AuditLog';
import { ApiResponse }    from '../../shared/utils/response';
import { paginate }       from '../../shared/utils/helpers';
import { authenticate, authorize } from '../../middlewares';

const repo = () => AppDataSource.getRepository(AuditLog);

export const AuditService = {
  async log(p: { actor?: { id: string; email?: string; roles?: string[] }; action: string; entity: string; entityId?: string; before?: Record<string,unknown>; after?: Record<string,unknown>; ipAddress?: string; userAgent?: string }): Promise<void> {
    try {
      await repo().save(repo().create({ actor: p.actor ? { id: p.actor.id } as any : undefined, actorEmail: p.actor?.email, actorRoles: p.actor?.roles, action: p.action, entity: p.entity, entityId: p.entityId, before: p.before, after: p.after, ipAddress: p.ipAddress, userAgent: p.userAgent }));
    } catch { /* non bloquant */ }
  },
  async list(f: { entity?: string; action?: string; startDate?: Date; endDate?: Date; page?: number; limit?: number }) {
    const qb = repo().createQueryBuilder('al').leftJoinAndSelect('al.actor','u').orderBy('al.createdAt','DESC');
    if (f.entity)    qb.andWhere('al.entity = :e',     { e: f.entity });
    if (f.action)    qb.andWhere('al.action LIKE :a',   { a: `%${f.action}%` });
    if (f.startDate) qb.andWhere('al.createdAt >= :s',  { s: f.startDate });
    if (f.endDate)   qb.andWhere('al.createdAt <= :end',{ end: f.endDate });
    return paginate(qb, f.page ?? 1, f.limit ?? 50);
  },
};

export function auditMiddleware(action: string, entity: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = (req as any).user;
    AuditService.log({ actor: user ? { id: user.id, email: user.email, roles: user.roles } : undefined, action, entity, entityId: req.params.id, after: req.body, ipAddress: req.ip, userAgent: req.headers['user-agent'] }).catch(() => {});
    next();
  };
}

export const auditRouter = Router();
auditRouter.use(authenticate, authorize('super_admin'));
auditRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(ApiResponse.paginated(await AuditService.list({ entity: req.query.entity as string, action: req.query.action as string, page: +req.query.page!||1, limit: +req.query.limit!||50 }))); } catch(e){next(e);}
});
