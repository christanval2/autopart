import { Router, Request, Response, NextFunction } from 'express';
import { z }                from 'zod';
import { AppDataSource }    from '../../config/database';
import { Address }          from '../../entities/Address';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { validate, authenticate } from '../../middlewares';

const CreateAddressSchema = z.object({
  label:       z.string().max(50).optional(),
  street:      z.string().min(5).max(500),
  city:        z.string().min(2).max(100),
  postalCode:  z.string().max(20).optional(),
  countryCode: z.string().length(2).default('CM'),
  isDefault:   z.boolean().default(false),
});

const addrRepo = () => AppDataSource.getRepository(Address);

export const AddressesService = {
  async list(userId: string) {
    return addrRepo().find({ where: { user: { id: userId } }, order: { isDefault: 'DESC' } });
  },
  async create(userId: string, dto: z.infer<typeof CreateAddressSchema>) {
    // Si isDefault, retirer le flag des autres adresses
    if (dto.isDefault) {
      await addrRepo().update({ user: { id: userId } }, { isDefault: false });
    }
    const addr = addrRepo().create({ ...dto, user: { id: userId } });
    return addrRepo().save(addr);
  },
  async update(id: string, userId: string, dto: Partial<z.infer<typeof CreateAddressSchema>>) {
    const addr = await addrRepo().findOne({ where: { id, user: { id: userId } } });
    if (!addr) throw ApiError.notFound('Adresse');
    if (dto.isDefault) {
      await addrRepo().update({ user: { id: userId } }, { isDefault: false });
    }
    Object.assign(addr, dto);
    return addrRepo().save(addr);
  },
  async delete(id: string, userId: string) {
    const addr = await addrRepo().findOne({ where: { id, user: { id: userId } } });
    if (!addr) throw ApiError.notFound('Adresse');
    await addrRepo().remove(addr);
  },
};

const Ctrl = {
  list:   async (req: Request, res: Response, next: NextFunction) => { try { res.json(ApiResponse.success(await AddressesService.list(req.user!.id))); } catch(e){next(e);} },
  create: async (req: Request, res: Response, next: NextFunction) => { try { res.status(201).json(ApiResponse.created(await AddressesService.create(req.user!.id, req.body))); } catch(e){next(e);} },
  update: async (req: Request, res: Response, next: NextFunction) => { try { res.json(ApiResponse.success(await AddressesService.update(req.params.id, req.user!.id, req.body), 'Adresse mise à jour')); } catch(e){next(e);} },
  delete: async (req: Request, res: Response, next: NextFunction) => { try { await AddressesService.delete(req.params.id, req.user!.id); res.json(ApiResponse.noContent()); } catch(e){next(e);} },
};

export const addressesRouter = Router();
addressesRouter.use(authenticate);
addressesRouter.get('/',       Ctrl.list);
addressesRouter.post('/',      validate(CreateAddressSchema), Ctrl.create);
addressesRouter.patch('/:id',  validate(CreateAddressSchema.partial()), Ctrl.update);
addressesRouter.delete('/:id', Ctrl.delete);
