import { Router, Request, Response, NextFunction } from 'express';
import { z }                from 'zod';
import { AppDataSource }    from '../../config/database';
import { RecurringOrder }   from '../../entities/RecurringOrder';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { validate, authenticate, validateParams } from '../../middlewares';

const CreateRecurringSchema = z.object({
  sellerOrgId:        z.string().uuid(),
  name:               z.string().min(3).max(150).trim(),
  frequency:          z.enum(['daily','weekly','biweekly','monthly']),
  billingAddressId:   z.string().uuid().optional(),
  shippingAddressId:  z.string().uuid().optional(),
  template: z.object({
    channel:    z.enum(['b2b','b2c','marketplace']).default('b2b'),
    lines:      z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().positive() })).min(1),
    currency:   z.string().length(3).default('XAF'),
    notes:      z.string().max(500).optional(),
  }),
  firstRunAt: z.coerce.date().default(() => new Date()),
});

const repo = () => AppDataSource.getRepository(RecurringOrder);

export const recurringOrdersRouter = Router();
recurringOrdersRouter.use(authenticate);

recurringOrdersRouter.get('/', async (req,res,next) => {
  try {
    const orders = await repo().find({ where: { buyer: { id: req.user!.id } }, order: { createdAt: 'DESC' } });
    res.json(ApiResponse.success(orders));
  } catch(e){next(e);}
});

recurringOrdersRouter.post('/', validate(CreateRecurringSchema), async (req,res,next) => {
  try {
    const dto = req.body;
    const ro  = repo().create({
      buyer:     { id: req.user!.id },
      sellerOrg: { id: dto.sellerOrgId },
      name:      dto.name, frequency: dto.frequency,
      template:  dto.template, nextRunAt: dto.firstRunAt,
      billingAddressId: dto.billingAddressId, shippingAddressId: dto.shippingAddressId,
      isActive: true, runsCount: 0,
    });
    res.status(201).json(ApiResponse.created(await repo().save(ro)));
  } catch(e){next(e);}
});

recurringOrdersRouter.patch('/:id/toggle', validateParams('id'), async (req,res,next) => {
  try {
    const ro = await repo().findOne({ where: { id: req.params.id, buyer: { id: req.user!.id } } });
    if (!ro) return next(ApiError.notFound('Commande récurrente'));
    ro.isActive = !ro.isActive;
    res.json(ApiResponse.success(await repo().save(ro)));
  } catch(e){next(e);}
});

recurringOrdersRouter.delete('/:id', validateParams('id'), async (req,res,next) => {
  try {
    const ro = await repo().findOne({ where: { id: req.params.id, buyer: { id: req.user!.id } } });
    if (!ro) return next(ApiError.notFound('Commande récurrente'));
    await repo().remove(ro);
    res.json(ApiResponse.noContent());
  } catch(e){next(e);}
});
