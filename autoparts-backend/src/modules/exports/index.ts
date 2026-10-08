import { Router, Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../../config/database';
import { Order }         from '../../entities/Order';
import { Payment }       from '../../entities/Payment';
import { StockLevel }    from '../../entities/StockLevel';
import { authenticate, authorize } from '../../middlewares';
import { z }             from 'zod';
import { validate }      from '../../middlewares';

const Q = z.object({ startDate: z.coerce.date().optional(), endDate: z.coerce.date().optional(), orgId: z.string().uuid().optional(), format: z.enum(['csv','json']).default('csv') });

function toCSV(rows: Record<string,unknown>[]): string {
  if (!rows.length) return '';
  const h = Object.keys(rows[0]);
  const esc = (v: unknown) => { const s = String(v??'').replace(/"/g,'""'); return (s.includes(',')||s.includes('\n')||s.includes('"')) ? `"${s}"` : s; };
  return [h.join(','), ...rows.map(r => h.map(k => esc(r[k])).join(','))].join('\r\n');
}

function sendExport(res: Response, name: string, data: unknown[], fmt: 'csv'|'json') {
  if (fmt === 'json') { res.setHeader('Content-Type','application/json'); res.setHeader('Content-Disposition',`attachment; filename="${name}.json"`); return res.json({ data, total: data.length }); }
  const csv = toCSV(data as Record<string,unknown>[]);
  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.setHeader('Content-Disposition',`attachment; filename="${name}.csv"`);
  return res.send('\uFEFF' + csv);
}

export const ExportsService = {
  async orders(orgId?: string, start?: Date, end?: Date) {
    const qb = AppDataSource.getRepository(Order).createQueryBuilder('o').leftJoin('o.buyer','b').leftJoin('o.sellerOrg','org')
      .select(['o.orderNumber AS "Numéro"','o.channel AS "Canal"','o.status AS "Statut"','b.email AS "Email"','org.name AS "Organisation"','o.subtotal AS "HT (XAF)"','o.taxAmount AS "TVA (XAF)"','o.totalAmount AS "TTC (XAF)"','o.orderedAt AS "Date"'])
      .where('o.status NOT IN (:...e)',{ e: ['draft'] });
    if (orgId) qb.andWhere('o.sellerOrg.id = :orgId',{ orgId });
    if (start) qb.andWhere('o.orderedAt >= :s',{ s: start });
    if (end)   qb.andWhere('o.orderedAt <= :e',{ e: end });
    return qb.orderBy('o.orderedAt','DESC').getRawMany();
  },
  async payments(start?: Date, end?: Date) {
    const qb = AppDataSource.getRepository(Payment).createQueryBuilder('p').leftJoin('p.order','o').leftJoin('o.buyer','b')
      .select(['o.orderNumber AS "Commande"','p.method AS "Mode"','p.status AS "Statut"','p.amount AS "Montant (XAF)"','b.email AS "Email"','p.paidAt AS "Date"'])
      .where('p.status != :s',{ s: 'pending' });
    if (start) qb.andWhere('p.paidAt >= :s',{ s: start });
    if (end)   qb.andWhere('p.paidAt <= :e',{ e: end });
    return qb.orderBy('p.paidAt','DESC').getRawMany();
  },
  async stock() {
    return AppDataSource.getRepository(StockLevel).createQueryBuilder('sl')
      .leftJoin('sl.variant','v').leftJoin('v.product','p').leftJoin('sl.warehouse','wh').leftJoin('p.brand','br')
      .select(['p.name AS "Produit"','v.variantSku AS "SKU"','br.name AS "Marque"','wh.name AS "Entrepôt"','sl.qtyOnHand AS "Stock total"','sl.qtyReserved AS "Réservé"','(sl.qty_on_hand - sl.qty_reserved) AS "Disponible"','v.reorderPoint AS "Seuil réappro"'])
      .where('p.isActive = true').orderBy('p.name','ASC').getRawMany();
  },
};

export const exportsRouter = Router();
exportsRouter.use(authenticate, authorize('super_admin','org_admin','accountant'));
exportsRouter.get('/orders',   validate(Q,'query'), async (req: Request, res: Response, next: NextFunction) => { try { const {startDate,endDate,orgId,format}=Q.parse(req.query); const isAdmin=req.user!.roles.includes('super_admin'); sendExport(res,`commandes_${new Date().toISOString().slice(0,10)}`, await ExportsService.orders(isAdmin?orgId:req.user!.orgId??undefined,startDate,endDate),format); } catch(e){next(e);} });
exportsRouter.get('/payments', validate(Q,'query'), async (req: Request, res: Response, next: NextFunction) => { try { const {startDate,endDate,format}=Q.parse(req.query); sendExport(res,`paiements_${new Date().toISOString().slice(0,10)}`,await ExportsService.payments(startDate,endDate),format); } catch(e){next(e);} });
exportsRouter.get('/stock',    async (req: Request, res: Response, next: NextFunction) => { try { sendExport(res,`stock_${new Date().toISOString().slice(0,10)}`,await ExportsService.stock(),(req.query.format as 'csv'|'json')||'csv'); } catch(e){next(e);} });
