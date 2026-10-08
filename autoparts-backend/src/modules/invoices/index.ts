import { Router, Request, Response, NextFunction } from 'express';
import PDFDocument         from 'pdfkit';
import { z }               from 'zod';
import { AppDataSource }   from '../../config/database';
import { Order }           from '../../entities/Order';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { authenticate, authorize, validate, validateParams } from '../../middlewares';
import { getVatRate, setVatRate } from '../../shared/utils/tax';
import { Jobs }            from '../../jobs/queues';

const COMPANY = { name:'AutoParts Marketplace Cameroun', address:'Zone Industrielle Bassa, Douala', email:'contact@autoparts.cm', rccm:'RC/DLA/2024/B/1234', niu:'M012024000001234' };

async function getOrder(id:string, callerId:string, isAdmin:boolean): Promise<Order> {
  const order = await AppDataSource.getRepository(Order).findOne({ where:{ id }, relations:['buyer','sellerOrg','lines','lines.variant','lines.variant.product','billingAddress'] });
  if (!order) throw ApiError.notFound('Commande');
  if (!isAdmin) {
    if ((order.buyer as any)?.id !== callerId) throw ApiError.forbidden();
  }
  return order;
}

async function buildPDF(order: Order): Promise<Buffer> {
  const TVA = await getVatRate('CM'); // E6e : taux configuré en base (défaut 19,25 %)
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin:50, size:'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const fmt = (v:number) => new Intl.NumberFormat('fr-FR',{ style:'currency', currency:'XAF', minimumFractionDigits:0 }).format(v);
    const buyer   = order.buyer as any;
    const invNum  = `FAC-${order.orderNumber}`;

    // Header
    doc.rect(0,0,595,110).fill('#1d4ed8');
    doc.fillColor('#fff').fontSize(22).font('Helvetica-Bold').text('AutoParts',50,30);
    doc.fontSize(9).font('Helvetica').text(COMPANY.address,50,56).text(COMPANY.email,50,68).text(`RCCM: ${COMPANY.rccm} · NIU: ${COMPANY.niu}`,50,80);
    doc.fontSize(18).font('Helvetica-Bold').text('FACTURE',395,35);
    doc.fontSize(11).font('Helvetica').fillColor('#bfdbfe').text(invNum,395,58).text(new Date().toLocaleDateString('fr-FR'),395,72);

    doc.moveDown(6);

    // Infos acheteur
    const iy = 130;
    doc.fillColor('#6b7280').fontSize(8).font('Helvetica-Bold').text('FACTURER À',50,iy);
    doc.fillColor('#1f2937').fontSize(10).font('Helvetica-Bold').text(`${buyer?.firstName??''} ${buyer?.lastName??''}`,50,iy+14);
    doc.fontSize(9).font('Helvetica').text(buyer?.email??'',50,iy+26);

    // Lignes
    const tY = iy+65;
    doc.rect(50,tY,495,18).fill('#f3f4f6');
    doc.fillColor('#374151').font('Helvetica-Bold').fontSize(8).text('DESCRIPTION',55,tY+5).text('QTÉ',320,tY+5).text('P.U. HT',375,tY+5).text('TOTAL HT',470,tY+5);

    let rY = tY+22; let subHT = 0;
    for (const line of (order.lines??[]) as any[]) {
      const snap = line.productSnapshot as any??{};
      const name = snap.name ?? line.variant?.product?.name ?? 'Produit';
      const puHT = Math.round(line.unitPrice / (1+TVA));
      const tot  = puHT * line.quantity;
      subHT += tot;
      doc.fillColor('#1f2937').font('Helvetica').fontSize(8).text(name.slice(0,50),55,rY).text(String(line.quantity),320,rY).text(fmt(puHT),375,rY).text(fmt(tot),470,rY);
      rY += 16;
      doc.moveTo(50,rY-2).lineTo(545,rY-2).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
    }

    // Totaux
    const totY = rY+12;
    const taxAmt = Math.round(subHT*TVA);
    const total  = subHT+taxAmt+Math.round(order.shippingCost??0);
    doc.fillColor('#374151').font('Helvetica').fontSize(9)
       .text('Sous-total HT',360,totY).text(fmt(subHT),470,totY)
       .text('TVA (19,25%)',360,totY+16).text(fmt(taxAmt),470,totY+16);
    if (order.shippingCost>0) doc.text('Livraison',360,totY+32).text(fmt(Math.round(order.shippingCost)),470,totY+32);
    const finalY = totY+(order.shippingCost>0?48:32);
    doc.rect(345,finalY,200,24).fill('#1d4ed8');
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(11).text('TOTAL TTC',355,finalY+6).text(fmt(total),470,finalY+6);

    // Footer
    const fY = finalY+55;
    doc.moveTo(50,fY).lineTo(545,fY).strokeColor('#d1d5db').lineWidth(0.5).stroke();
    doc.fillColor('#9ca3af').font('Helvetica').fontSize(7)
       .text('TVA camerounaise 19,25% — Loi de Finances 2024. Document généré électroniquement.',50,fY+8,{ width:495, align:'center' })
       .text(`${COMPANY.name} — ${COMPANY.address} — RCCM: ${COMPANY.rccm}`,50,fY+20,{ width:495, align:'center' });

    doc.end();
  });
}

export const invoicesRouter = Router();
invoicesRouter.use(authenticate);

// E6e — TVA configurable (lecture pour tous, écriture super_admin)
invoicesRouter.get('/tax', async (_req: Request, res: Response) => {
  const rate = await getVatRate('CM');
  res.json(ApiResponse.success({ countryCode: 'CM', rate, percent: `${(rate * 100).toFixed(2)} %` }));
});
const TaxUpdateSchema = z.object({
  rate: z.number().min(0).max(1),
  exemptedCategoryIds: z.array(z.string().uuid()).default([]),
});
invoicesRouter.put('/tax', authorize('super_admin'), validate(TaxUpdateSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await setVatRate('CM', req.body.rate, req.body.exemptedCategoryIds);
    res.json(ApiResponse.success(config, 'TVA mise à jour'));
  } catch (e) { next(e); }
});

// E1 — envoi de la facture par email (lien de téléchargement)
invoicesRouter.post('/:orderId/email', validateParams('orderId'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const isAdmin = req.user!.roles.includes('super_admin');
    const order   = await getOrder(req.params.orderId, req.user!.id, isAdmin);
    const buyer   = order.buyer as any;
    if (!buyer?.email) return next(ApiError.notFound('Email acheteur'));
    Jobs.sendEmail({
      to:       buyer.email,
      subject:  `[AutoParts] Facture commande ${order.orderNumber}`,
      template: 'invoice',
      context:  { orderNumber: order.orderNumber, orderId: order.id },
    });
    res.json(ApiResponse.success(null, 'Facture envoyée par email'));
  } catch (e) { next(e); }
});

invoicesRouter.get('/:orderId/pdf', validateParams('orderId'), async (req:Request,res:Response,next:NextFunction) => {
  try {
    const isAdmin = req.user!.roles.includes('super_admin');
    const order   = await getOrder(req.params.orderId, req.user!.id, isAdmin);
    if (!['confirmed','processing','shipped','delivered'].includes(order.status)) return next(ApiError.badRequest('Facture disponible uniquement pour les commandes confirmées'));
    const pdf = await buildPDF(order);
    res.setHeader('Content-Type','application/pdf');
    res.setHeader('Content-Disposition',`attachment; filename="FAC-${order.orderNumber}.pdf"`);
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
  } catch(e){next(e);}
});

invoicesRouter.get('/:orderId/preview', validateParams('orderId'), async (req:Request,res:Response,next:NextFunction) => {
  try {
    const isAdmin = req.user!.roles.includes('super_admin');
    const order   = await getOrder(req.params.orderId, req.user!.id, isAdmin);
    const pdf     = await buildPDF(order);
    res.setHeader('Content-Type','application/pdf');
    res.setHeader('Content-Disposition','inline');
    res.send(pdf);
  } catch(e){next(e);}
});
