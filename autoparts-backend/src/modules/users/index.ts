import { Router, Request, Response, NextFunction } from 'express';
import { z }                from 'zod';
import jwt                  from 'jsonwebtoken';
import bcrypt               from 'bcryptjs';
import { AppDataSource }    from '../../config/database';
import { env }              from '../../config/env';
import { User }             from '../../entities/User';
import { Order }            from '../../entities/Order';
import { Review }           from '../../entities/Review';
import { Address }          from '../../entities/Address';
import { ConsentLog }       from '../../entities/ConsentLog';
import { AuditLog }         from '../../entities/AuditLog';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { paginate, sanitizeDeep } from '../../shared/utils/helpers';
import { validate, validateParams, authenticate, authorize } from '../../middlewares';
import { sanitizeUserPhone, phoneFields } from '../../shared/utils/phone';

const UpdateProfileSchema = z.object({
  firstName: z.string().min(2).max(100).optional(),
  lastName:  z.string().min(2).max(100).optional(),
  phone:     z.string().regex(/^\+?[0-9]{8,15}$/).optional(),
});

const UsersQuerySchema = z.object({
  page:     z.coerce.number().int().positive().default(1),
  limit:    z.coerce.number().int().min(1).max(100).default(20),
  search:   z.string().optional(),
  orgId:    z.string().uuid().optional(),
  role:     z.string().optional(),
  verified: z.coerce.boolean().optional(),
});

const UpdateRolesSchema = z.object({
  roles: z.array(z.enum(['super_admin','org_admin','seller','buyer','logistics','accountant'])).min(1),
});

const userRepo = () => AppDataSource.getRepository(User);
const sanitize = (u: User) => { const { passwordHash: _, ...safe } = u as any; return sanitizeUserPhone(safe); };

export const UsersService = {
  async findAll(query: z.infer<typeof UsersQuerySchema>) {
    const qb = userRepo()
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.org', 'o');
    if (query.search) qb.andWhere('(u.email ILIKE :s OR u.firstName ILIKE :s OR u.lastName ILIKE :s)', { s: `%${query.search}%` });
    if (query.orgId)  qb.andWhere('u.orgId = :orgId', { orgId: query.orgId });
    if (query.verified !== undefined) qb.andWhere('u.isVerified = :v', { v: query.verified });
    if (query.role)   qb.andWhere('u.roles LIKE :role', { role: `%${query.role}%` });
    qb.orderBy('u.createdAt', 'DESC');
    const result = await paginate(qb, query.page, query.limit);
    return { ...result, data: result.data.map(sanitize) };
  },
  async findById(id: string) {
    const user = await userRepo().findOne({ where: { id }, relations: ['org'] });
    if (!user) throw ApiError.notFound('Utilisateur');
    return sanitize(user);
  },
  async updateProfile(id: string, dto: z.infer<typeof UpdateProfileSchema>) {
    const { phone, ...rest } = dto;
    const patch: Record<string, unknown> = { ...rest, ...phoneFields(phone) };
    await userRepo().update(id, patch as any);
    return this.findById(id);
  },
  async updateRoles(
    id: string,
    roles: string[],
    callerRoles: string[],
  ) {
    // PRIVESC : seul un super_admin peut attribuer le rôle super_admin
    const isCallerAdmin = callerRoles.includes('super_admin');
    if (!isCallerAdmin && roles.includes('super_admin')) {
      throw ApiError.forbidden("Attribution du rôle super_admin réservée aux super_admin");
    }
    // org_admin ne peut gérer que les rôles dans son périmètre
    const ALLOWED_FOR_ORG_ADMIN = ['org_admin','seller','buyer','logistics','accountant'];
    if (!isCallerAdmin) {
      const forbidden = roles.filter(r => !ALLOWED_FOR_ORG_ADMIN.includes(r));
      if (forbidden.length > 0) {
        throw ApiError.forbidden(`Rôle(s) non autorisé(s) : ${forbidden.join(', ')}`);
      }
    }
    const user = await userRepo().findOneByOrFail({ id });
    user.roles = roles as any;
    return sanitize(await userRepo().save(user));
  },
  /**
   * R4 — création d'un compte par le super_admin : mot de passe temporaire
   * généré, compte vérifié, flag mustChangePassword pour forcer le changement.
   */
  async createUser(dto: {
    email: string; firstName: string; lastName: string;
    roles: string[]; orgId?: string; phone?: string;
  }) {
    const exists = await userRepo().findOneBy({ email: dto.email });
    if (exists) throw ApiError.conflict('Email déjà utilisé');

    const tempPassword = `AP-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const user = userRepo().create({
      email:        dto.email,
      firstName:    dto.firstName,
      lastName:     dto.lastName,
      passwordHash,
      roles:        dto.roles as any,
      orgId:        dto.orgId,
      phoneEnc:     undefined,
      accountType:  dto.orgId ? 'pro' : 'individual',
      isVerified:   true,               // créé par un admin : pas d'OTP
      isActive:     true,
      mustChangePassword: true,         // forcé au premier login
    });
    const saved = await userRepo().save(user);

    return { user: saved, tempPassword };
  },

  async setActive(id: string, isActive: boolean) {
    await userRepo().update(id, { isActive });
  },

  async anonymize(id: string) {
    await userRepo().update(id, {
      email: `deleted_${id}@deleted.cm`,
      firstName: 'Supprimé', lastName: 'Supprimé',
      ...phoneFields(null), isVerified: false,
    } as any);
  },
};

const Ctrl = {
  me:         async (req: Request, res: Response, next: NextFunction) => { try { res.json(ApiResponse.success(await UsersService.findById(req.user!.id))); } catch(e){next(e);} },
  getOne:     async (req: Request, res: Response, next: NextFunction) => { try { res.json(ApiResponse.success(await UsersService.findById(req.params.id))); } catch(e){next(e);} },
  list:       async (req: Request, res: Response, next: NextFunction) => { try { res.json(ApiResponse.paginated(await UsersService.findAll(req.query as any))); } catch(e){next(e);} },
  updateMe:   async (req: Request, res: Response, next: NextFunction) => { try { res.json(ApiResponse.success(await UsersService.updateProfile(req.user!.id, req.body), 'Profil mis à jour')); } catch(e){next(e);} },
  updateRoles: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await UsersService.updateRoles(
        req.params.id,
        req.body.roles,
        req.user!.roles,
      );
      res.json(ApiResponse.success(result));
    } catch(e) { next(e); }
  },
  deleteMe:   async (req: Request, res: Response, next: NextFunction) => { try { await UsersService.anonymize(req.user!.id); res.json(ApiResponse.noContent()); } catch(e){next(e);} },
  deleteOne:  async (req: Request, res: Response, next: NextFunction) => { try { await UsersService.anonymize(req.params.id); res.json(ApiResponse.noContent()); } catch(e){next(e);} },
};

export const usersRouter = Router();
usersRouter.use(authenticate);
usersRouter.get('/me',    Ctrl.me);
usersRouter.patch('/me',  validate(UpdateProfileSchema), Ctrl.updateMe);
usersRouter.delete('/me', Ctrl.deleteMe);

// ── E6d : RGPD — export de mes données + journal de consentement ──
const ConsentSchema = z.object({
  type:     z.enum(['cgv', 'cookies', 'marketing_email']),
  version:  z.string().max(20).default('1.0'),
  accepted: z.boolean().default(true),
});

usersRouter.get('/me/export', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const uid = req.user!.id;
    const [profile, addresses, orders, reviews, consents] = await Promise.all([
      userRepo().findOneByOrFail({ id: uid }),
      AppDataSource.getRepository(Address).find({ where: { user: { id: uid } as any } }),
      AppDataSource.getRepository(Order).find({
        where: { buyer: { id: uid } as any },
        relations: ['lines'],
        order: { createdAt: 'DESC' } as any,
      }),
      AppDataSource.getRepository(Review).find({ where: { reviewer: { id: uid } as any } }),
      AppDataSource.getRepository(ConsentLog).find({ where: { user: { id: uid } as any } }),
    ]);

    const { passwordHash: _ph, ...safeProfile } = profile as any;
    res.setHeader('Content-Disposition', `attachment; filename="autoparts-mes-donnees-${uid.slice(0,8)}.json"`);
    res.json(ApiResponse.success({
      exportedAt: new Date().toISOString(),
      profile:    safeProfile,
      addresses,
      orders,
      reviews,
      consents,
    }));
  } catch (e) { next(e); }
});

usersRouter.post('/me/consent', validate(ConsentSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const log = AppDataSource.getRepository(ConsentLog).create({
      user:     { id: req.user!.id } as any,
      type:     req.body.type,
      version:  req.body.version,
      accepted: req.body.accepted,
      ip:       req.ip,
    });
    await AppDataSource.getRepository(ConsentLog).save(log);
    res.status(201).json(ApiResponse.created(null, 'Consentement enregistré'));
  } catch (e) { next(e); }
});

usersRouter.get('/',      authorize('super_admin'), validate(UsersQuerySchema, 'query'), Ctrl.list);

// ── R4 : création d'utilisateur par le super_admin ──
const CreateUserSchema = z.object({
  email:     z.string().email(),
  firstName: z.string().min(2).max(100),
  lastName:  z.string().min(2).max(100),
  roles:     z.array(z.enum(['org_admin','seller','buyer','logistics','accountant'])).min(1),
  orgId:     z.string().uuid().optional(),
  phone:     z.string().regex(/^\+?[0-9]{8,15}$/).optional(),
});

usersRouter.post('/',
  authorize('super_admin'),
  validate(CreateUserSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { user, tempPassword } = await UsersService.createUser(req.body);
      // Email d'invitation (template existant)
      const { Jobs } = await import('../../jobs/queues');
      Jobs.sendEmail({
        to:       user.email,
        subject:  '[AutoParts] Votre compte a été créé',
        template: 'invitation',
        context:  {
          orgName: 'AutoParts Marketplace',
          link:    `connexion : ${process.env.APP_URL ?? 'http://localhost:3000'}/login — mot de passe temporaire : ${tempPassword}`,
        },
      }).catch(() => undefined);

      res.status(201).json(ApiResponse.created({
        user: sanitize(user),
        tempPassword,   // affiché UNE fois à l'admin
      }, 'Utilisateur créé — mot de passe temporaire à communiquer'));
    } catch (e) { next(e); }
  },
);

// R4 — désactivation / réactivation (préférable à la suppression)
const SetActiveSchema = z.object({ isActive: z.boolean() });
usersRouter.patch('/:id/active',
  authorize('super_admin'),
  validateParams('id'),
  validate(SetActiveSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.params.id === req.user!.id) {
        return next(ApiError.badRequest('Vous ne pouvez pas désactiver votre propre compte'));
      }
      await UsersService.setActive(req.params.id, req.body.isActive);
      res.json(ApiResponse.success(null, req.body.isActive ? 'Compte activé' : 'Compte désactivé'));
    } catch (e) { next(e); }
  },
);
usersRouter.get('/:id',   authorize('super_admin','org_admin'), Ctrl.getOne);
usersRouter.patch('/:id/roles',  authorize('super_admin','org_admin'), validate(UpdateRolesSchema), Ctrl.updateRoles);
usersRouter.delete('/:id',       authorize('super_admin'), Ctrl.deleteOne);

// ── F1b : impersonation super_admin ─────────────────────────────
// Émet un access token court au nom de l'utilisateur ciblé. Chaque usage
// est journalisé dans AuditLog ; le refresh est interdit (token à usage
// unique de 15 min, révocable via /auth/logout).
usersRouter.post('/:id/impersonate',
  authorize('super_admin'),
  validateParams('id'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const target = await userRepo().findOneByOrFail({ id: req.params.id });
      if (target.roles?.includes('super_admin')) {
        throw ApiError.forbidden('Impersonation d\'un super_admin interdite');
      }

      const accessToken = jwt.sign(
        {
          sub:           target.id,
          orgId:         target.orgId ?? null,
          roles:         target.roles,
          email:         target.email,
          impersonatorId: req.user!.id,
        },
        env.JWT_ACCESS_SECRET,
        {
          issuer: 'autoparts-api', audience: 'autoparts-client', expiresIn: '15m',
        } as jwt.SignOptions,
      );

      await AppDataSource.getRepository(AuditLog).save(
        AppDataSource.getRepository(AuditLog).create({
          actor:      { id: req.user!.id } as any,
          actorEmail: req.user!.email,
          action:     'IMPERSONATE',
          entity:     'User',
          entityId:   target.id,
          ipAddress:  req.ip,
          userAgent:  req.headers['user-agent'],
          metadata:   { impersonatedEmail: target.email },
        }),
      );

      res.json(ApiResponse.success({
        accessToken,
        impersonated: { id: target.id, email: target.email },
        expiresIn:    '15m',
        warning:      'Session d\'impersonation journalisée — usage exclusivement support/diagnostic',
      }));
    } catch (e) { next(e); }
  },
);

usersRouter.get('/me/notification-prefs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const u = await userRepo().findOneByOrFail({ id: req.user!.id });
    res.json(ApiResponse.success({ smsOptOut: u.smsOptOut, marketingOptOut: u.marketingOptOut }));
  } catch (e) { next(e); }
});

// F5.3 — préférences de notification (opt-out SMS/marketing)
const NotificationPrefsSchema = z.object({
  smsOptOut:       z.boolean().optional(),
  marketingOptOut: z.boolean().optional(),
});
usersRouter.patch('/me/notification-prefs', validate(NotificationPrefsSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await userRepo().update(req.user!.id, req.body);
    res.json(ApiResponse.success(null, 'Préférences mises à jour'));
  } catch (e) { next(e); }
});
