import { Router, Request, Response, NextFunction } from 'express';
import { z }                from 'zod';
import { AppDataSource }    from '../../config/database';
import { Quote }            from '../../entities/Quote';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { paginate }         from '../../shared/utils/helpers';
import { validate, authenticate, authorize, validateParams } from '../../middlewares';

const CreateQuoteSchema = z.object({
  // Flux acheteur : sellerOrgId fourni (demande de devis à un vendeur).
  // Flux vendeur : absent → org de l'appelant (le vendeur crée un devis
  // pour un client depuis /b2b/devis).
  sellerOrgId: z.string().uuid().optional(),
  validUntil:  z.coerce.date().optional(), // défaut : +30 jours
  lines: z.array(z.object({
    variantId:  z.string().uuid(),
    quantity:   z.number().int().positive(),
    unitPrice:  z.number().positive(),
  })).min(1),
  discountPct: z.number().min(0).max(100).default(0),
  notes:       z.string().max(500).trim().optional(),
  currency:    z.string().length(3).default('XAF'),
});

const repo = () => AppDataSource.getRepository(Quote);

function genQuoteNumber(): string {
  const d = new Date();
  return `QUO-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}-${Math.floor(Math.random()*90000+10000)}`;
}

export const QuotesService = {
  async list(buyerId: string, page = 1, limit = 20) {
    const qb = repo().createQueryBuilder('q')
      .leftJoinAndSelect('q.sellerOrg','org').where('q.buyer.id = :buyerId', { buyerId })
      .orderBy('q.createdAt','DESC');
    return paginate(qb, page, limit);
  },
  async listForOrg(orgId: string, page = 1, limit = 20) {
    const qb = repo().createQueryBuilder('q')
      .leftJoinAndSelect('q.buyer','b').where('q.sellerOrg.id = :orgId', { orgId })
      .orderBy('q.createdAt','DESC');
    return paginate(qb, page, limit);
  },
  async create(caller: { id: string; orgId?: string | null }, dto: z.infer<typeof CreateQuoteSchema>) {
    // Flux vendeur : devis créé pour sa propre organisation
    const sellerOrgId = dto.sellerOrgId ?? caller.orgId;
    if (!sellerOrgId) throw ApiError.forbidden('sellerOrgId requis (ou compte organisation)');
    const validUntil = dto.validUntil ?? new Date(Date.now() + 30 * 864e5);
    const subtotal = dto.lines.reduce((s,l)=>s+l.unitPrice*l.quantity,0);
    const total    = subtotal * (1 - dto.discountPct/100);
    return repo().save(repo().create({
      quoteNumber: genQuoteNumber(), buyer: { id: caller.id }, sellerOrg: { id: sellerOrgId },
      validUntil, lines: dto.lines, discountPct: dto.discountPct,
      subtotal, totalAmount: total, currency: dto.currency, notes: dto.notes, status: 'draft',
    }));
  },
  async findById(id: string) {
    const q = await repo().findOne({ where: { id }, relations: ['buyer','sellerOrg'] });
    if (!q) throw ApiError.notFound('Devis'); return q;
  },
  async changeStatus(id: string, status: Quote['status']) {
    const q = await repo().findOneByOrFail({ id });
    if (q.status === 'expired') throw ApiError.badRequest('Devis expiré');
    if (new Date() > new Date(q.validUntil)) { await repo().update(id,{ status:'expired' }); throw ApiError.badRequest('Devis expiré'); }
    q.status = status; return repo().save(q);
  },
};

export const quotesRouter = Router();
quotesRouter.use(authenticate);
quotesRouter.get('/',    async (req,res,next) => { try { res.json(ApiResponse.paginated(await QuotesService.list(req.user!.id, +req.query.page!||1))); } catch(e){next(e);} });
quotesRouter.get('/org', authorize('seller','org_admin'), async (req,res,next) => { try { res.json(ApiResponse.paginated(await QuotesService.listForOrg(req.user!.orgId!))); } catch(e){next(e);} });
quotesRouter.post('/',   validate(CreateQuoteSchema), async (req,res,next) => { try { res.status(201).json(ApiResponse.created(await QuotesService.create({ id: req.user!.id, orgId: req.user!.orgId ?? null },req.body))); } catch(e){next(e);} });
quotesRouter.get('/:id', validateParams('id'), async (req,res,next) => { try { res.json(ApiResponse.success(await QuotesService.findById(req.params.id))); } catch(e){next(e);} });
quotesRouter.post('/:id/send',   validateParams('id'), authorize('seller','org_admin'), async (req,res,next) => { try { res.json(ApiResponse.success(await QuotesService.changeStatus(req.params.id,'sent'))); } catch(e){next(e);} });
quotesRouter.post('/:id/accept', validateParams('id'), async (req,res,next) => { try { res.json(ApiResponse.success(await QuotesService.changeStatus(req.params.id,'accepted'))); } catch(e){next(e);} });
quotesRouter.post('/:id/reject', validateParams('id'), async (req,res,next) => { try { res.json(ApiResponse.success(await QuotesService.changeStatus(req.params.id,'rejected'))); } catch(e){next(e);} });
