import { Router, Request, Response, NextFunction } from 'express';
import { z }             from 'zod';
import { AppDataSource } from '../../config/database';
import { Bundle }        from '../../entities/Bundle';
import { BundleItem }    from '../../entities/BundleItem';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { validate, authenticate, authorize, validateParams } from '../../middlewares';

const CreateBundleSchema = z.object({
  name:        z.string().min(3).max(255).trim(),
  description: z.string().max(1000).trim().optional(),
  bundlePrice: z.number().positive(),
  currency:    z.string().length(3).default('XAF'),
  items: z.array(z.object({
    variantId: z.string().uuid(),
    quantity:  z.number().int().positive().default(1),
  })).min(2, 'Un kit nécessite au moins 2 produits'),
});

const repo = () => AppDataSource.getRepository(Bundle);

export const BundlesService = {
  async list(activeOnly = true) {
    return repo().find({
      where: activeOnly ? { isActive: true } : {},
      relations: ['items','items.variant','items.variant.product'],
      order: { createdAt: 'DESC' },
    });
  },
  async findById(id: string) {
    const b = await repo().findOne({ where: { id }, relations: ['items','items.variant','items.variant.product'] });
    if (!b) throw ApiError.notFound('Bundle');
    return b;
  },
  async create(dto: z.infer<typeof CreateBundleSchema>) {
    const bundle = repo().create({
      name: dto.name, description: dto.description,
      bundlePrice: dto.bundlePrice, currency: dto.currency, isActive: true,
      items: dto.items.map(i => ({ variant: { id: i.variantId }, quantity: i.quantity })) as any,
    });
    return repo().save(bundle);
  },
  async toggle(id: string) {
    const b = await repo().findOneByOrFail({ id });
    b.isActive = !b.isActive;
    return repo().save(b);
  },
};

export const bundlesRouter = Router();
bundlesRouter.get('/',    async (req,res,next) => { try { res.json(ApiResponse.success(await BundlesService.list())); } catch(e){next(e);} });
bundlesRouter.get('/:id', validateParams('id'), async (req,res,next) => { try { res.json(ApiResponse.success(await BundlesService.findById(req.params.id))); } catch(e){next(e);} });
bundlesRouter.use(authenticate);
bundlesRouter.post('/',           authorize('super_admin','org_admin','seller'), validate(CreateBundleSchema), async (req,res,next) => { try { res.status(201).json(ApiResponse.created(await BundlesService.create(req.body))); } catch(e){next(e);} });
bundlesRouter.patch('/:id/toggle', validateParams('id'), authorize('super_admin','org_admin'), async (req,res,next) => { try { res.json(ApiResponse.success(await BundlesService.toggle(req.params.id))); } catch(e){next(e);} });
