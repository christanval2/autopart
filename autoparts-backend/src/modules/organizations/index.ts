// ═══════════════════════════════════════════════════════════════
//  ORGANIZATIONS MODULE
// ═══════════════════════════════════════════════════════════════

import { Router, Request, Response, NextFunction } from 'express';
import { z }                  from 'zod';
import crypto                 from 'crypto';
import { AppDataSource }      from '../../config/database';
import { Organization }       from '../../entities/Organization';
import { OrgTier }            from '../../entities/OrgTier';
import { OrgInvitation }      from '../../entities/OrgInvitation';
import { User }               from '../../entities/User';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { paginate }           from '../../shared/utils/helpers';
import { validate, authenticate, authorize, optionalAuthenticate } from '../../middlewares';
import { Jobs }               from '../../jobs/queues';
import { logger }             from '../../shared/utils/logger';
import { env }                from '../../config/env';
import { scoreToBadge }       from '../../shared/utils/seller-score';
import { CAN_SELL_BY_DEFAULT, DEFAULT_TIER_BY_ORG_TYPE } from '../../shared/org-rules';

// ─── Schémas Zod ─────────────────────────────────────────────────

export const CreateOrgSchema = z.object({
  name:        z.string().min(2).max(255),
  orgType:     z.enum(['importer', 'wholesaler', 'retailer', 'garage']),
  taxId:       z.string().max(50).optional(),
  countryCode: z.string().length(2),
  parentOrgId: z.string().uuid().optional(),
  creditLimit: z.number().min(0).default(0),
});

export const UpdateOrgSchema = CreateOrgSchema.partial().extend({
  tierId: z.string().uuid().optional(),
  // Règles org_type : activation vendeur (exception garage/retailer qui
  // revend). Réservé au super_admin — voir Ctrl.update / Ctrl.setCanSell.
  canSell: z.boolean().optional(),
});

export const CreateTierSchema = z.object({
  name:              z.string().min(2).max(50),
  discountRate:      z.number().min(0).max(100),
  minOrderQty:       z.number().int().min(1).default(1),
  minOrderValue:     z.number().min(0).default(0),
  canBuyWholesale:   z.boolean().default(false),
  canSell:           z.boolean().default(false),
});

export const OrgQuerySchema = z.object({
  page:      z.coerce.number().int().positive().default(1),
  limit:     z.coerce.number().int().min(1).max(100).default(20),
  orgType:   z.enum(['importer', 'wholesaler', 'retailer', 'garage']).optional(),
  verified:  z.coerce.boolean().optional(),
  search:    z.string().max(100).optional(),
});

// ─── Service ─────────────────────────────────────────────────────

const orgRepo  = () => AppDataSource.getRepository(Organization);
const tierRepo = () => AppDataSource.getRepository(OrgTier);
const userRepo = () => AppDataSource.getRepository(User);

export const OrgsService = {

  async findAll(query: z.infer<typeof OrgQuerySchema>) {
    const qb = orgRepo()
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.tier', 't');

    if (query.search) {
      qb.andWhere('(o.name ILIKE :s OR o.taxId ILIKE :s)', { s: `%${query.search}%` });
    }
    if (query.orgType  !== undefined) qb.andWhere('o.orgType = :type',    { type: query.orgType });
    if (query.verified !== undefined) qb.andWhere('o.isVerified = :v',    { v: query.verified });

    qb.orderBy('o.createdAt', 'DESC');
    return paginate(qb, query.page, query.limit);
  },

  async findById(id: string): Promise<Organization> {
    const org = await orgRepo().findOne({
      where: { id },
      relations: ['tier'],
    });
    if (!org) throw ApiError.notFound('Organisation');
    return org;
  },

  async create(dto: z.infer<typeof CreateOrgSchema>): Promise<Organization> {
    if (dto.taxId) {
      const exists = await orgRepo().findOneBy({ taxId: dto.taxId });
      if (exists) throw ApiError.conflict(`Tax ID ${dto.taxId} déjà enregistré`);
    }
    const org = orgRepo().create({ ...dto });
    // Règles org_type : le tier est la source de vérité des prix — org_type
    // fixe le tier PAR DÉFAUT à la création (importer→gros-export,
    // wholesaler→gros, retailer/garage→détail). Reste modifiable
    // indépendamment ensuite par un admin (assign-tier).
    if (!org.tier) {
      const defaultTier = await tierRepo().findOneBy({
        name: DEFAULT_TIER_BY_ORG_TYPE[org.orgType],
      });
      if (defaultTier) org.tier = defaultTier;
    }
    // can_sell dérivé du org_type (importer/wholesaler vendeurs,
    // retailer/garage acheteurs) — modifiable ensuite par un admin.
    org.canSell = CAN_SELL_BY_DEFAULT[org.orgType];
    return orgRepo().save(org);
  },

  async update(id: string, dto: z.infer<typeof UpdateOrgSchema>): Promise<Organization> {
    const org = await this.findById(id);
    if (dto.tierId) {
      const tier = await tierRepo().findOneBy({ id: dto.tierId });
      if (!tier) throw ApiError.notFound('Tier');
      org.tier = tier;
    }
    if (dto.canSell !== undefined) org.canSell = dto.canSell;
    // E2 — changement de org_type : ne PAS auto-modifier le tier ni les
    // prix existants ; les restrictions d'accès s'appliquent immédiatement
    // (visibilité/paiement par org_type) et l'admin corrige le tier à la main.
    // canSell est géré ci-dessus (réservé super_admin côté contrôleur).
    const { canSell: _canSell, ...rest } = dto;
    Object.assign(org, rest);
    return orgRepo().save(org);
  },

  async verify(id: string, adminId: string): Promise<Organization> {
    const org = await this.findById(id);
    if (org.isVerified) throw ApiError.conflict('Organisation déjà vérifiée');
    org.isVerified = true;
    return orgRepo().save(org);
  },

  async getMembers(orgId: string) {
    return userRepo().find({
      where: { org: { id: orgId } },
      select: ['id', 'email', 'firstName', 'lastName', 'roles', 'isVerified', 'lastLoginAt'],
    });
  },

  async updateMemberRole(orgId: string, userId: string, roles: string[]) {
    const user = await userRepo().findOneBy({ id: userId, org: { id: orgId } });
    if (!user) throw ApiError.notFound('Membre');
    user.roles = roles as any;
    return userRepo().save(user);
  },

  async setCreditLimit(orgId: string, limit: number): Promise<Organization> {
    await orgRepo().update(orgId, { creditLimit: limit });
    return this.findById(orgId);
  },

  /**
   * Règles org_type — toggle « peut vendre » : c'est ce flag qui gère
   * l'exception du garage/retailer activé vendeur par un admin.
   */
  async setCanSell(orgId: string, canSell: boolean): Promise<Organization> {
    const org = await this.findById(orgId);
    org.canSell = canSell;
    return orgRepo().save(org);
  },

  // ── Tiers ────────────────────────────────────────────────────

  async listTiers(): Promise<OrgTier[]> {
    return tierRepo().find({ order: { discountRate: 'ASC' } });
  },

  async createTier(dto: z.infer<typeof CreateTierSchema>): Promise<OrgTier> {
    const tier = tierRepo().create(dto);
    return tierRepo().save(tier);
  },

  async updateTier(id: string, dto: Partial<z.infer<typeof CreateTierSchema>>): Promise<OrgTier> {
    const tier = await tierRepo().findOneByOrFail({ id });
    Object.assign(tier, dto);
    return tierRepo().save(tier);
  },

  async assignTier(orgId: string, tierId: string): Promise<Organization> {
    const [org, tier] = await Promise.all([
      this.findById(orgId),
      tierRepo().findOneByOrFail({ id: tierId }),
    ]);
    org.tier = tier;
    return orgRepo().save(org);
  },
};

// ─── Contrôleur ──────────────────────────────────────────────────

const Ctrl = {
  list:    async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(ApiResponse.paginated(await OrgsService.findAll(req.query as any))); } catch(e){next(e);}
  },
  getOne:  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const org = await OrgsService.findById(req.params.id);
      // F4 — badge vendeur dynamique dérivé du score de performance
      res.json(ApiResponse.success({
        ...org,
        performanceScore: org.performanceScore != null ? Number(org.performanceScore) : null,
        sellerBadge:      scoreToBadge(org.performanceScore != null ? Number(org.performanceScore) : null),
      }));
    } catch(e){next(e);}
  },
  create:  async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(ApiResponse.created(await OrgsService.create(req.body))); } catch(e){next(e);}
  },
  update: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isSuperAdmin = req.user!.roles.includes('super_admin');
      const isAdmin = isSuperAdmin || req.user!.roles.includes('org_admin');
      // AUTHZ-1 : org_admin ne peut modifier que son propre org
      if (!isAdmin || (!isSuperAdmin && req.user!.orgId !== req.params.id)) {
        return next(ApiError.forbidden("Vous ne pouvez modifier que votre propre organisation"));
      }
      // Règles org_type : org_type et can_sell ne se modifient QUE par un
      // super_admin (sinon un org_admin pourrait s'auto-promouvoir vendeur
      // ou changer de type pour accéder à d'autres tiers de prix).
      const sensitive = ['canSell' as const, 'orgType' as const].filter(k => req.body[k] !== undefined);
      if (sensitive.length && !isSuperAdmin) {
        return next(ApiError.forbidden(
          `Champ(s) ${sensitive.join(', ')} réservé(s) aux administrateurs de la plateforme`,
        ));
      }
      res.json(ApiResponse.success(await OrgsService.update(req.params.id, req.body)));
    } catch(e) { next(e); }
  },
  setCanSell: async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user!.roles.includes('super_admin')) {
        return next(ApiError.forbidden('Activation vendeur réservée aux super_admin'));
      }
      const org = await OrgsService.setCanSell(req.params.id, req.body.canSell);
      res.json(ApiResponse.success(org, req.body.canSell
        ? 'Compte activé vendeur : ce compte pourra lister des produits à la vente'
        : 'Capacité de vente désactivée'));
    } catch(e) { next(e); }
  },
  verify:  async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(ApiResponse.success(await OrgsService.verify(req.params.id, req.user!.id), 'Organisation vérifiée')); } catch(e){next(e);}
  },
  members: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(ApiResponse.success(await OrgsService.getMembers(req.params.id))); } catch(e){next(e);}
  },
  updateMemberRole: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await OrgsService.updateMemberRole(req.params.id, req.params.userId, req.body.roles);
      res.json(ApiResponse.success(user));
    } catch(e){next(e);}
  },
  setCreditLimit: async (req: Request, res: Response, next: NextFunction) => {
    try {
      // AUTHZ-1 : seul super_admin peut modifier la limite de crédit
      if (!req.user!.roles.includes('super_admin')) {
        return next(ApiError.forbidden("Modification de crédit réservée aux super_admin"));
      }
      const org = await OrgsService.setCreditLimit(req.params.id, req.body.limit);
      res.json(ApiResponse.success(org, 'Limite de crédit mise à jour'));
    } catch(e) { next(e); }
  },
  listTiers:   async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(ApiResponse.success(await OrgsService.listTiers())); } catch(e){next(e);}
  },
  createTier:  async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(ApiResponse.created(await OrgsService.createTier(req.body))); } catch(e){next(e);}
  },
  assignTier: async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Seul super_admin peut changer le tier d'une org (impact commercial)
      if (!req.user!.roles.includes('super_admin')) {
        return next(ApiError.forbidden("Attribution de tier réservée aux super_admin"));
      }
      res.json(ApiResponse.success(await OrgsService.assignTier(req.params.id, req.body.tierId)));
    } catch(e) { next(e); }
  },
};

// ─── Routes ──────────────────────────────────────────────────────

export const orgsRouter = Router();

// ── E6b : acceptation d'invitation — AVANT authenticate (un invité
// sans compte doit pouvoir appeler cette route avec un simple token) ──
orgsRouter.post('/invitations/:token/accept',
  optionalAuthenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invRepo = AppDataSource.getRepository(OrgInvitation);
      const invitation = await invRepo.findOne({
        where: { token: req.params.token, status: 'pending' },
        relations: ['org'],
      });
      if (!invitation) throw ApiError.notFound('Invitation invalide ou déjà utilisée');
      if (invitation.expiresAt < new Date()) {
        invitation.status = 'expired';
        await invRepo.save(invitation);
        throw ApiError.badRequest('Invitation expirée');
      }

      if (!req.user) {
        return res.json(ApiResponse.success(
          { needsAccount: true, email: invitation.email, orgName: (invitation.org as any).name },
          'Créez un compte avec cet email puis réacceptez l\'invitation',
        ));
      }

      const userRepo = AppDataSource.getRepository(User);
      const user = await userRepo.findOneByOrFail({ id: req.user.id });
      user.orgId = (invitation.org as any).id;
      const roles = new Set([...(user.roles ?? []), invitation.role]);
      user.roles = [...roles] as any;
      await userRepo.update(user.id, user);

      invitation.status = 'accepted';
      await invRepo.save(invitation);

      res.json(ApiResponse.success(null, `Vous avez rejoint ${(invitation.org as any).name}`));
    } catch (e) { next(e); }
  },
);

orgsRouter.use(authenticate);

orgsRouter.get('/',       validate(OrgQuerySchema, 'query'),   Ctrl.list);
orgsRouter.get('/:id',                                          Ctrl.getOne);
orgsRouter.post('/',      validate(CreateOrgSchema),            Ctrl.create);
orgsRouter.patch('/:id',  authorize('org_admin','super_admin'), validate(UpdateOrgSchema), Ctrl.update);
orgsRouter.post('/:id/can-sell', authorize('super_admin'), validate(z.object({ canSell: z.boolean() })), Ctrl.setCanSell);
orgsRouter.post('/:id/verify',         authorize('super_admin'), Ctrl.verify);
orgsRouter.post('/:id/credit-limit',   authorize('super_admin'), Ctrl.setCreditLimit);
orgsRouter.get('/:id/members',                                   Ctrl.members);
orgsRouter.patch('/:id/members/:userId/roles', authorize('org_admin','super_admin'), Ctrl.updateMemberRole);
orgsRouter.post('/:id/assign-tier',    authorize('super_admin'), Ctrl.assignTier);

// Tiers (admin only)
orgsRouter.get('/tiers/list',     Ctrl.listTiers);
orgsRouter.post('/tiers',         authorize('super_admin'), validate(CreateTierSchema), Ctrl.createTier);

// ── E6b : invitations de membres ────────────────────────────────
const InviteSchema = z.object({
  email: z.string().email(),
  role:  z.enum(['org_admin','seller','buyer','logistics','accountant']),
});

orgsRouter.post('/:id/invitations',
  authorize('org_admin','super_admin'),
  validate(InviteSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // L'org_admin ne peut inviter que dans SA propre organisation
      if (!req.user!.roles.includes('super_admin') && req.user!.orgId !== req.params.id) {
        return next(ApiError.forbidden('Invitation réservée à votre organisation'));
      }
      const token = crypto.randomBytes(24).toString('hex');
      const invitation = AppDataSource.getRepository(OrgInvitation).create({
        org:       { id: req.params.id } as any,
        email:     req.body.email,
        role:      req.body.role,
        token,
        status:    'pending',
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      });
      const saved = await AppDataSource.getRepository(OrgInvitation).save(invitation);

      const org = await AppDataSource.getRepository(Organization).findOneByOrFail({ id: req.params.id });
      Jobs.sendEmail({
        to:       saved.email,
        subject:  `[AutoParts] Invitation à rejoindre ${org.name}`,
        template: 'invitation',
        context:  {
          orgName: org.name,
          link:    `${env.APP_URL}/organizations/invitations/${token}/accept`,
        },
      }).catch(e => logger.warn('Email invitation non envoyé:', e.message));

      res.status(201).json(ApiResponse.created(saved, 'Invitation envoyée (valable 7 jours)'));
    } catch (e) { next(e); }
  },
);


// ── F4.1 : KYB — documents légaux + revue admin ────────────────
import multer from 'multer';
import { promises as fs } from 'fs';
import * as kybPath from 'path';
import { OrgDocument } from '../../entities/OrgDocument';

// Stockage PRIVÉ (jamais servi statiquement) — accès via route admin authentifiée
const KYB_DIR = kybPath.resolve('private_uploads', 'kyb');
const kybUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Document PDF ou image attendu'));
    }
  },
});

const KybUploadSchema = z.object({
  type: z.enum(['rccm', 'patente', 'statuts', 'id_card']),
});

// Upload d'un document KYB par l'organisation
orgsRouter.post('/:id/kyb/documents',
  authorize('org_admin', 'super_admin'),
  kybUpload.single('document'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user!.roles.includes('super_admin') && req.user!.orgId !== req.params.id) {
        return next(ApiError.forbidden('Documents réservés à votre organisation'));
      }
      if (!req.file) return next(ApiError.badRequest('Aucun document envoyé'));

      const { type } = KybUploadSchema.parse(req.body);
      await fs.mkdir(KYB_DIR, { recursive: true });
      const ext = kybPath.extname(req.file.originalname || '') || (req.file.mimetype === 'application/pdf' ? '.pdf' : '.bin');
      const fileName = `kyb_${req.params.id}_${Date.now()}${ext}`;
      await fs.writeFile(kybPath.join(KYB_DIR, fileName), req.file.buffer);

      const doc = await AppDataSource.getRepository(OrgDocument).save(
        AppDataSource.getRepository(OrgDocument).create({
          org:          { id: req.params.id } as any,
          type,
          fileUrl:      fileName,
          originalName: req.file.originalname?.slice(0, 255),
          uploadedBy:   req.user!.id,
          status:       'pending',
        }),
      );
      res.status(201).json(ApiResponse.created(doc, 'Document reçu — en cours de vérification'));
    } catch (e) { next(e); }
  },
);

// Documents KYB de MON organisation (wizard vendeur : statuts en direct)
orgsRouter.get('/:id/kyb/documents',
  authorize('org_admin', 'seller', 'super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user!.roles.includes('super_admin') && req.user!.orgId !== req.params.id) {
        return next(ApiError.forbidden('Documents réservés à votre organisation'));
      }
      const docs = await AppDataSource.getRepository(OrgDocument).find({
        where: { org: { id: req.params.id } as any },
        order: { createdAt: 'DESC' },
      });
      res.json(ApiResponse.success(docs));
    } catch (e) { next(e); }
  },
);

// File de révision admin
orgsRouter.get('/kyb/pending',
  authorize('super_admin'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const docs = await AppDataSource.getRepository(OrgDocument).find({
        where: { status: 'pending' },
        relations: ['org'],
        order: { createdAt: 'ASC' },
      });
      res.json(ApiResponse.success(docs));
    } catch (e) { next(e); }
  },
);

// Téléchargement sécurisé d'un document (super_admin uniquement)
orgsRouter.get('/kyb/:documentId/file',
  authorize('super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await AppDataSource.getRepository(OrgDocument).findOneByOrFail({ id: req.params.documentId });
      const filePath = kybPath.join(KYB_DIR, kybPath.basename(doc.fileUrl));
      res.setHeader('Content-Type', 'application/octet-stream');
      res.send(await fs.readFile(filePath));
    } catch (e) { next(e); }
  },
);

// Décision admin : approve → org vérifiée + email, reject → motif + email
const KybDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  reason:   z.string().max(300).trim().optional(),
});
orgsRouter.post('/kyb/:documentId/decide',
  authorize('super_admin'),
  validate(KybDecisionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const docRepo = AppDataSource.getRepository(OrgDocument);
      const doc = await docRepo.findOne({ where: { id: req.params.documentId }, relations: ['org'] });
      if (!doc) throw ApiError.notFound('Document');
      if (doc.status !== 'pending') throw ApiError.conflict('Document déjà traité');

      doc.status = req.body.decision === 'approve' ? 'approved' : 'rejected';
      doc.reviewedBy = req.user!.id;
      doc.reviewedAt = new Date();
      doc.rejectionReason = req.body.decision === 'reject' ? (req.body.reason ?? 'Non conforme') : undefined;
      await docRepo.save(doc);

      const org = doc.org as Organization;
      if (req.body.decision === 'approve') {
        await AppDataSource.getRepository(Organization).update(org.id, { isVerified: true });
      }

      // Notifier l'org_admin de la décision (E1)
      const admin = await AppDataSource.getRepository(User)
        .createQueryBuilder('u')
        .where('u.org_id = :orgId', { orgId: org.id })
        .andWhere('u.roles LIKE :role', { role: '%org_admin%' })
        .getOne();
      if (admin) {
        Jobs.sendEmail({
          to: admin.email,
          subject: req.body.decision === 'approve'
            ? '[AutoParts] Organisation vérifiée ✅'
            : '[AutoParts] Vérification KYB refusée',
          template: 'invitation',
          context: {
            orgName: org.name,
            link: req.body.decision === 'approve'
              ? `${env.APP_URL}/organizations/${org.id}`
              : `${env.APP_URL}/organizations/${org.id}/kyb`,
          },
        }).catch(e => logger.warn('Email KYB non envoyé:', e.message));
      }

      res.json(ApiResponse.success(doc, req.body.decision === 'approve' ? 'Organisation vérifiée' : 'Document rejeté'));
    } catch (e) { next(e); }
  },
);
