import { Router, Request, Response, NextFunction } from 'express';
import { z }             from 'zod';
import { AppDataSource } from '../../config/database';
import { ProductQA }     from '../../entities/ProductQA';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { paginate }      from '../../shared/utils/helpers';
import { validate, authenticate, authorize, validateParams } from '../../middlewares';

const AskSchema    = z.object({ productId: z.string().uuid(), question: z.string().min(10).max(1000).trim() });
const AnswerSchema = z.object({ answer: z.string().min(5).max(2000).trim() });

const repo = () => AppDataSource.getRepository(ProductQA);

export const QAService = {
  async listForProduct(productId: string, page = 1, limit = 20) {
    const qb = repo().createQueryBuilder('qa')
      .leftJoinAndSelect('qa.asker','a').leftJoinAndSelect('qa.answerer','ans')
      .where('qa.product.id = :pid AND qa.isPublic = true', { pid: productId })
      .orderBy('qa.createdAt','DESC');
    return paginate(qb, page, limit);
  },
  /**
   * G6g — file du vendeur : questions sans réponse sur les produits stockés
   * par son organisation (product → variantes → stock → entrepôt → org).
   */
  async pendingForOrg(orgId: string, page = 1, limit = 20) {
    const qb = repo().createQueryBuilder('qa')
      .leftJoinAndSelect('qa.asker', 'a')
      .leftJoinAndSelect('qa.product', 'p')
      .where('qa.answer IS NULL')
      .andWhere(`qa.product_id IN (
        SELECT v.product_id FROM stock_levels sl
        JOIN product_variants v ON v.id = sl.variant_id
        JOIN warehouses w ON w.id = sl.warehouse_id
        WHERE w.org_id = :orgId
      )`, { orgId })
      .orderBy('qa.createdAt', 'ASC');
    return paginate(qb, page, limit);
  },
  async ask(askerId: string, dto: z.infer<typeof AskSchema>) {
    return repo().save(repo().create({ asker: { id: askerId }, product: { id: dto.productId }, question: dto.question, isPublic: true }));
  },
  async answer(id: string, answererId: string, dto: z.infer<typeof AnswerSchema>) {
    const qa = await repo().findOneByOrFail({ id });
    if (qa.answer) throw ApiError.conflict('Cette question a déjà une réponse');
    qa.answerer    = { id: answererId } as any;
    qa.answer      = dto.answer;
    qa.answeredAt  = new Date();
    return repo().save(qa);
  },
  async toggleVisibility(id: string) {
    const qa = await repo().findOneByOrFail({ id });
    qa.isPublic = !qa.isPublic;
    return repo().save(qa);
  },
};

export const qaRouter = Router();
qaRouter.get('/product/:productId', async (req,res,next) => { try { res.json(ApiResponse.paginated(await QAService.listForProduct(req.params.productId, +req.query.page!||1))); } catch(e){next(e);} });
qaRouter.use(authenticate);
// G6g — file d'attente des questions pour les produits du vendeur
qaRouter.get('/pending', authorize('seller','org_admin','super_admin'), async (req,res,next) => {
  try { res.json(ApiResponse.paginated(await QAService.pendingForOrg(req.user!.orgId!, +req.query.page!||1))); } catch(e){next(e);}
});
qaRouter.post('/',            validate(AskSchema), async (req,res,next) => { try { res.status(201).json(ApiResponse.created(await QAService.ask(req.user!.id, req.body))); } catch(e){next(e);} });
qaRouter.post('/:id/answer',  validateParams('id'), authorize('super_admin','org_admin','seller'), validate(AnswerSchema), async (req,res,next) => { try { res.json(ApiResponse.success(await QAService.answer(req.params.id, req.user!.id, req.body))); } catch(e){next(e);} });
qaRouter.patch('/:id/toggle', validateParams('id'), authorize('super_admin'), async (req,res,next) => { try { res.json(ApiResponse.success(await QAService.toggleVisibility(req.params.id))); } catch(e){next(e);} });
