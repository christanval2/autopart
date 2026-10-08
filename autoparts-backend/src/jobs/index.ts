// ═══════════════════════════════════════════════════════════════
//  JOBS — BullMQ Workers (Email + StockAlert + Invoice)
// ═══════════════════════════════════════════════════════════════

import { Worker, Job, Queue } from 'bullmq';
import nodemailer                          from 'nodemailer';
import { redis }                           from '../config/redis';
import { env }                             from '../config/env';
import { logger }                          from '../shared/utils/logger';
import { RecurringOrder }  from '../entities/RecurringOrder';
import { AppDataSource }                   from '../config/database';
import { Notification }                    from '../entities/Notification';
import { Payment }                         from '../entities/Payment';
import { Order, OrderStatus }              from '../entities/Order';
import { OrderApproval }                   from '../entities/OrderApproval';
import { StockLevel }                      from '../entities/StockLevel';
import { OrderLine }                       from '../entities/OrderLine';
import { recordStockMovement }             from '../shared/utils/stock-log';
import { notifyUser }                      from '../modules/push-notifications';
import { queues, Jobs, EmailJobData, StockAlertJobData, InvoiceJobData, NotifJobData } from './queues';

const connection = { connection: redis };

// ─── Mailer ───────────────────────────────────────────────────────

const transporter = nodemailer.createTransport({
  host:   env.SMTP_HOST ?? 'smtp.gmail.com',
  port:   env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth:   env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
});

// Templates email simples (en prod: utiliser Handlebars ou MJML)
const emailTemplates: Record<EmailJobData['template'], (ctx: Record<string, unknown>) => string> = {
  'order-confirmed': (ctx) => `
    <h2>Commande confirmée ✅</h2>
    <p>Votre commande <strong>${ctx.orderNumber}</strong> d'un montant de <strong>${ctx.totalAmount} ${ctx.currency}</strong> a été confirmée.</p>
    <p>Suivez votre commande sur <a href="${env.APP_URL}/orders/${ctx.orderId}">votre espace client</a>.</p>
  `,
  'password-reset': (ctx) => `
    <h2>Réinitialisation du mot de passe</h2>
    <p>Cliquez sur le lien suivant (valable 1h) :</p>
    <a href="${env.APP_URL}/reset-password?token=${ctx.token}">Réinitialiser mon mot de passe</a>
  `,
  'verify-email': (ctx) => `
    <h2>Vérification de votre email</h2>
    <p>Votre code de vérification est : <strong style="font-size:24px;letter-spacing:4px">${ctx.otp}</strong></p>
    <p>Ce code expire dans 10 minutes.</p>
  `,
  'low-stock': (ctx) => `
    <h2>⚠️ Alerte stock bas</h2>
    <p>Le produit <strong>${ctx.sku}</strong> n'a plus que <strong>${ctx.available}</strong> unité(s) disponible(s) (seuil : ${ctx.threshold}).</p>
    <a href="${env.APP_URL}/stock">Gérer mon stock</a>
  `,
  'order-shipped': (ctx) => `
    <h2>Commande expédiée 🚚</h2>
    <p>Votre commande <strong>${ctx.orderNumber}</strong> a été expédiée.</p>
    <p>Numéro de suivi : <strong>${ctx.trackingNumber ?? '—'}</strong> (transporteur : ${ctx.carrier ?? '—'}).</p>
    <p><a href="${env.APP_URL}/orders/${ctx.orderId}">Suivre ma commande</a></p>
  `,
  'bank-transfer-instructions': (ctx) => `
    <h2>Instructions de virement bancaire</h2>
    <p>Pour la commande <strong>${ctx.orderNumber}</strong> d'un montant de <strong>${ctx.amount} XAF</strong>.</p>
    <p>
      <strong>Banque :</strong> ${ctx.bankName ?? '—'}<br/>
      <strong>RIB / IBAN :</strong> ${ctx.rib ?? '—'}<br/>
      <strong>Référence à indiquer :</strong> ${ctx.reference}<br/>
      <strong>Bénéficiaire :</strong> AutoParts Marketplace SARL
    </p>
    <p>Cette commande sera automatiquement annulée si le règlement n'est pas confirmé sous ${ctx.expiresInHours ?? 72} h.</p>
  `,
  'invitation': (ctx) => `
    <h2>Invitation à rejoindre ${ctx.orgName}</h2>
    <p>Vous avez été invité à rejoindre l'organisation <strong>${ctx.orgName}</strong> sur AutoParts Marketplace.</p>
    <p><a href="${ctx.link}">Accepter l'invitation</a> (valable 7 jours)</p>
    <p>Si vous n'avez pas encore de compte, créez-en un avec cet email puis rouvrez ce lien.</p>
  `,
  'invoice': (ctx) => `
    <h2>Facture commande ${ctx.orderNumber}</h2>
    <p>Votre facture est disponible en téléchargement.</p>
  `,
  // Campagnes newsletter : HTML fourni (pixel/clic/désinscription déjà injectés)
  'custom': (ctx) => String(ctx.html ?? ''),
};

// ─── Workers ──────────────────────────────────────────────────────

// Email worker
export const emailWorker = new Worker<EmailJobData>(
  'email',
  async (job: Job<EmailJobData>) => {
    const { to, subject, template, context } = job.data;
    const html = emailTemplates[template](context);

    await transporter.sendMail({
      from:    env.EMAIL_FROM,
      to,
      subject,
      html,
    });

    logger.info(`Email envoyé: ${template} → ${to}`);
  },
  {
    ...connection,
    concurrency: 5,
  },
);

// Stock alert worker
export const stockWorker = new Worker<StockAlertJobData>(
  'stock',
  async (job: Job<StockAlertJobData>) => {
    const { sku, available, threshold, orgId } = job.data;

    // Notifier les org_admins de l'organisation concernée
    const admins = await AppDataSource.getRepository('User')
      .createQueryBuilder('u')
      .where('u.org_id = :orgId', { orgId })
      .andWhere('u.roles LIKE :role', { role: '%org_admin%' })
      .getMany();

    for (const admin of admins as Array<{ email: string }>) {
      await queues.email().add('low-stock', {
        to:       admin.email,
        subject:  `[AutoParts] Alerte stock bas — ${sku}`,
        template: 'low-stock',
        context:  { sku, available, threshold },
      });
    }

    logger.warn(`Stock bas: ${sku} — ${available}/${threshold}`);
  },
  connection,
);

// Invoice worker
export const invoiceWorker = new Worker<InvoiceJobData>(
  'invoice',
  async (job: Job<InvoiceJobData>) => {
    const { orderId } = job.data;
    // TODO: générer PDF avec PDFKit ou Puppeteer
    // et uploader sur S3
    logger.info(`Facture générée pour commande ${orderId}`);
  },
  connection,
);

// Notification worker (push / in-app)
export const notifWorker = new Worker<NotifJobData>(
  'notif',
  async (job: Job<NotifJobData>) => {
    const notifRepo = AppDataSource.getRepository(Notification);
    await notifRepo.save(notifRepo.create({
      user:    { id: job.data.userId },
      type:    job.data.type as any,
      title:   job.data.title,
      body:    job.data.body,
      payload: job.data.payload,
      isRead:  false,
    }));
    // TODO: WebSocket push via Socket.io
  },
  connection,
);

// ─── Event listeners (logs) ───────────────────────────────────────

[emailWorker, stockWorker, invoiceWorker, notifWorker].forEach(worker => {
  worker.on('completed', job => logger.debug(`Job [${job.queueName}:${job.id}] terminé`));
  worker.on('failed',    (job, err) => logger.error(`Job [${job?.queueName}:${job?.id}] échoué:`, err.message));
});

// ══ Worker expiration paiements (virement non confirmé après 72 h) ══
new Worker(
  'payments',
  async (job: Job) => {
    if (job.name !== 'expire') return;
    const { paymentId } = job.data as { paymentId: string };
    const paymentRepo = AppDataSource.getRepository(Payment);
    const payment = await paymentRepo.findOne({
      where: { id: paymentId },
      relations: ['order'],
    });
    if (!payment || payment.status === 'completed' || payment.status === 'refunded') return;

    // Annuler paiement + commande, libérer le stock réservé
    await paymentRepo.update(payment.id, { status: 'failed' });
    const order = payment.order as Order;
    if (order && !['cancelled', 'refunded', 'delivered'].includes(order.status)) {
      await AppDataSource.getRepository(Order).update(order.id, { status: 'cancelled' });
      await releaseReservedStock(order.id);
      logger.warn(`Paiement ${paymentId} expiré — commande ${order.id} annulée`);
    }
  },
  connection,
);

// ══ Worker timeout d'approbation B2B (48 h sans décision) ══
new Worker(
  'orders',
  async (job: Job) => {
    if (job.name !== 'approval-timeout') return;
    const { approvalId } = job.data as { approvalId: string };
    const approvalRepo = AppDataSource.getRepository(OrderApproval);
    const approval = await approvalRepo.findOne({
      where: { id: approvalId },
      relations: ['order'],
    });
    if (!approval || approval.status !== 'pending') return;

    approval.status = 'rejected';
    approval.reason = 'Rejet automatique : délai d\'approbation de 48 h dépassé';
    await approvalRepo.save(approval);

    const order = approval.order as Order;
    if (order && !['cancelled', 'refunded', 'delivered'].includes(order.status)) {
      await AppDataSource.getRepository(Order).update(order.id, { status: 'cancelled' });
      await releaseReservedStock(order.id);
      logger.warn(`Approbation ${approvalId} expirée — commande ${order.id} annulée`);
    }
  },
  connection,
);

/** Libère le stock réservé des lignes d'une commande annulée (miroir de OrdersService). */
async function releaseReservedStock(orderId: string): Promise<void> {
  await AppDataSource.transaction(async manager => {
    const lines = await manager.getRepository(OrderLine)
      .createQueryBuilder('l')
      .where('l.order_id = :orderId', { orderId })
      .getMany();
    for (const line of lines) {
      await manager.createQueryBuilder()
        .update(StockLevel)
        .set({ qtyReserved: () => 'qty_reserved - :decr' })
        .setParameter('decr', Math.trunc(Number(line.quantity)))
        .where('variant_id = :vid', { vid: (line.variant as any)?.id ?? (line as any).variantId })
        .execute();
      // F3 — mouvement 'release' symétrique
      await recordStockMovement(manager, {
        variantId: (line.variant as any)?.id ?? (line as any).variantId,
        reason:    'release',
        qtyDelta:  -Math.trunc(Number(line.quantity)),
        orderId,
        note:      'Libération automatique (worker)',
      });
    }
  });
}

// ══ Cron E6 : taux de change quotidien + purge AuditLog > 90 j (RGPD) ══
import { refreshFxRates } from '../shared/utils/fx';
import { AuditLog }       from '../entities/AuditLog';

async function dailyMaintenance(): Promise<void> {
  await refreshFxRates();
  const purged = await AppDataSource.getRepository(AuditLog)
    .createQueryBuilder()
    .delete()
    .where('created_at < :cutoff', { cutoff: new Date(Date.now() - 90 * 24 * 3600 * 1000) })
    .execute();
  if (purged.affected) logger.info(`RGPD : ${purged.affected} logs d'audit purgés (>90 j)`);
}
setInterval(() => { dailyMaintenance().catch(e => logger.warn('Maintenance quotidienne:', e.message)); }, 24 * 3600 * 1000);
dailyMaintenance().catch(() => undefined); // premier run au démarrage

// ══ F5.4 — alertes wishlist (baisse de prix / retour en stock) ══
async function wishlistAlerts(): Promise<void> {
  const items = await AppDataSource.getRepository('Wishlist').find({ relations: ['product', 'user'] }) as any[];
  let sent = 0;
  for (const item of items) {
    const product = item.product;
    if (!product) continue;
    const currentPrice = product.priceOverride ?? product.basePrice;
    const stockRow = await AppDataSource.getRepository(StockLevel)
      .createQueryBuilder('sl')
      .select('SUM(sl.qty_on_hand - sl.qty_reserved)', 'available')
      .where('sl.variant_id IN (SELECT id FROM product_variants WHERE product_id = :pid)', { pid: product.id })
      .getRawOne<{ available: string }>();
    const inStock = parseInt(stockRow?.available ?? '0', 10) > 0;

    const priceDropped = item.priceAtAdd != null && currentPrice < Number(item.priceAtAdd) * 0.95;
    const backInStock  = !item.wasInStock && inStock;
    if (!priceDropped && !backInStock) continue;

    const reason = priceDropped ? `baisse de prix : ${item.priceAtAdd} → ${currentPrice} XAF` : 'de retour en stock';
    await notifyUser(item.user?.id, '❤️ Wishlist', `${product.name} est ${reason}`, { type: 'wishlist_alert', productId: product.id }).catch(() => undefined);
    await Jobs.notify({
      userId: item.user?.id, type: 'wishlist_alert',
      title: 'Votre wishlist a bougé ❤️',
      body: `${product.name} — ${reason}`,
      payload: { productId: product.id },
    }).catch(() => undefined);

    // Mettre à jour le snapshot pour ne pas re-notifier au prochain run
    await AppDataSource.getRepository('Wishlist').update(item.id, { priceAtAdd: currentPrice, wasInStock: inStock });
    sent++;
  }
  if (sent) logger.info(`Wishlist : ${sent} alerte(s) envoyée(s)`);
}
setInterval(() => { wishlistAlerts().catch(e => logger.warn('Wishlist alerts:', e.message)); }, 24 * 3600 * 1000);

// ══ F5.1 — relance messagerie : message sans réponse depuis > 24 h ══
async function messageReminders(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000);
  const pending = await AppDataSource.getRepository('Message')
    .createQueryBuilder('m')
    .where('m.reminder_sent_at IS NULL')
    .andWhere('m.created_at < :cutoff', { cutoff })
    .andWhere(`NOT EXISTS (
      SELECT 1 FROM messages r
      WHERE r.sender_id = m.recipient_id
        AND r.recipient_id = m.sender_id
        AND r.created_at > m.created_at
    )`)
    .getMany() as any[];
  for (const m of pending) {
    const sender = m.sender as any;
    const recipientId = (m.recipient as any)?.id;
    if (!recipientId) continue;
    await notifyUser(recipientId, '💬 Message sans réponse', `Le message de ${sender?.firstName ?? 'un utilisateur'} attend une réponse depuis 24 h`, { type: 'message_reminder', messageId: m.id }).catch(() => undefined);
    await Jobs.notify({
      userId: recipientId, type: 'message_reminder',
      title: '💬 Réponse attendue',
      body:   `Le message de ${sender?.firstName ?? 'un utilisateur'} attend une réponse depuis 24 h`,
      payload: { messageId: m.id },
    }).catch(() => undefined);
    await AppDataSource.getRepository('Message').update(m.id, { reminder_sent_at: new Date() });
  }
}
setInterval(() => { messageReminders().catch(e => logger.warn('Message reminders:', e.message)); }, 3600 * 1000);

// ══ F5.5 — alerte fin de contrat de prix (30 j avant, une seule fois) ══
async function contractExpiryAlerts(): Promise<void> {
  const cutoff = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  const contracts = await AppDataSource.getRepository('PriceContract')
    .createQueryBuilder('c')
    .leftJoinAndSelect('c.buyerOrg', 'b')
    .leftJoinAndSelect('c.sellerOrg', 's')
    .where('c.expiry_notified_at IS NULL')
    .andWhere('c.valid_until <= :cutoff', { cutoff })
    .andWhere('c.valid_until > :now', { now: new Date() })
    .andWhere('c.is_active = true')
    .getMany() as any[];

  for (const c of contracts) {
    const daysLeft = Math.max(0, Math.ceil((new Date(c.validUntil).getTime() - Date.now()) / (24 * 3600 * 1000)));
    for (const org of [c.buyerOrg, c.sellerOrg]) {
      if (!org) continue;
      const admins = await AppDataSource.getRepository('User')
        .createQueryBuilder('u')
        .where('u.org_id = :orgId', { orgId: org.id })
        .andWhere('u.roles LIKE :role', { role: '%org_admin%' })
        .getMany() as any[];
      for (const admin of admins) {
        await Jobs.sendEmail({
          to:       admin.email,
          subject:  `[AutoParts] Contrat de prix arrivant à échéance (J-${daysLeft})`,
          template: 'custom',
          context:  { html: `<h2>Contrat de prix — échéance dans ${daysLeft} jour(s)</h2>
            <p>Le contrat sur la variante <strong>${c.variantId}</strong> (${Number(c.contractedPrice).toLocaleString('fr-FR')} XAF)
            arrive à échéance le <strong>${new Date(c.validUntil).toLocaleDateString('fr-FR')}</strong>.</p>
            <p>Pensez à le renouveler pour conserver vos conditions négociées.</p>` },
        }).catch(() => undefined);
      }
    }
    await AppDataSource.getRepository('PriceContract').update(c.id, { expiry_notified_at: new Date() });
  }
}
setInterval(() => { contractExpiryAlerts().catch(e => logger.warn('Contract expiry:', e.message)); }, 24 * 3600 * 1000);

// ══ F4.2 — score de performance vendeur (quotidien) ══
import { computeSellerScore } from '../shared/utils/seller-score';

async function computeSellerScores(): Promise<void> {
  const orgRepo = AppDataSource.getRepository('Organization');
  const orgs = await orgRepo.find() as any[];
  for (const org of orgs) {
    const [totals, shipped, rated] = await Promise.all([
      AppDataSource.getRepository(Order).createQueryBuilder('o')
        .select('COUNT(*)', 'total')
        .addSelect(`SUM(CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END)`, 'cancelled')
        .where('o.seller_org_id = :orgId AND o.ordered_at > :since', { orgId: org.id, since: new Date(Date.now() - 180 * 24 * 3600 * 1000) })
        .getRawOne(),
      AppDataSource.getRepository(Order).createQueryBuilder('o')
        .select('COUNT(*)', 'total')
        .where("o.seller_org_id = :orgId AND o.status IN ('confirmed','processing','shipped','delivered')", { orgId: org.id })
        .getRawOne(),
      AppDataSource.getRepository('Review').createQueryBuilder('r')
        .select('AVG(r.rating)', 'avgRating')
        .where(`r.product_id IN (
          SELECT v.product_id FROM stock_levels sl
          JOIN product_variants v ON v.id = sl.variant_id
          JOIN warehouses w ON w.id = sl.warehouse_id
          WHERE w.org_id = :orgId
        )`, { orgId: org.id })
        .getRawOne(),
    ]);

    const total = Number(totals?.total ?? 0);
    // Org sans activité récente : pas de score (badge null)
    if (total < 5) continue;

    const cancelRate     = Number(totals?.cancelled ?? 0) / total;
    const notCancelled   = total - Number(totals?.cancelled ?? 0);
    const fulfillment    = notCancelled > 0 ? Math.min(1, Number(shipped?.total ?? 0) / notCancelled) : 0;
    const avgRating      = rated?.avgRating != null ? Number(rated.avgRating) : 3;

    const score = computeSellerScore({ cancelRate, fulfillmentRate: fulfillment, avgRating });
    await orgRepo.update(org.id, { performance_score: score, performance_computed_at: new Date() });
  }
  logger.info('Scores vendeurs recalculés');
}
setInterval(() => { computeSellerScores().catch(e => logger.warn('Seller scores:', e.message)); }, 24 * 3600 * 1000);
computeSellerScores().catch(() => undefined);

// ══ F1c — archivage légal annuel (commandes > 3 ans) ══
// ⚠️ setInterval est limité à 2^31-1 ms (~24,8 jours) : au-delà Node tronque
// à 1 ms → boucle infinie. Cadence 24 h ; la génération est idempotente.
import { generateAnnualArchive } from '../shared/utils/archive';
async function runAnnualArchive(): Promise<void> {
  const year = new Date().getUTCFullYear() - 3;
  const m = await generateAnnualArchive(year);
  logger.info(`Archive légale ${m.year} vérifiée/générée (${m.orderCount} commandes)`);
}
setTimeout(() => { runAnnualArchive().catch(e => logger.warn('Archive:', e.message)); }, 60_000); // premier passage 1 min après le boot
setInterval(() => { runAnnualArchive().catch(e => logger.warn('Archive:', e.message)); }, 24 * 3600 * 1000);

// ══ Worker commandes récurrentes (ord-6) ═════════════════════
const recurringQueue = new Queue('recurring-orders', { connection: redis });

new Worker('recurring-orders', async (job: Job) => {
  const { recurringOrderId } = job.data;
  const ro = await AppDataSource.getRepository(RecurringOrder).findOne({
    where: { id: recurringOrderId, isActive: true },
    relations: ['buyer','sellerOrg'],
  });
  if (!ro) return;

  try {
    // Créer la commande depuis le template
    const template = ro.template as any;
    await AppDataSource.getRepository('Order').save({
      buyer:             { id: (ro.buyer as any).id },
      sellerOrg:         { id: (ro.sellerOrg as any).id },
      channel:           template.channel ?? 'b2b',
      status:            'draft',
      subtotal:          template.subtotal ?? 0,
      taxAmount:         template.taxAmount ?? 0,
      shippingCost:      0,
      discountAmount:    0,
      totalAmount:       template.totalAmount ?? 0,
      currency:          template.currency ?? 'XAF',
      orderNumber:       `REC-${Date.now()}`,
      notes:             `Commande récurrente : ${ro.name}`,
      lines:             template.lines ?? [],
    });

    // Mettre à jour la prochaine exécution
    const next = new Date(ro.nextRunAt);
    const freq: Record<string, number> = { daily: 1, weekly: 7, biweekly: 14, monthly: 30 };
    next.setDate(next.getDate() + (freq[ro.frequency] ?? 30));

    await AppDataSource.getRepository(RecurringOrder).update(recurringOrderId, {
      nextRunAt:  next,
      lastRunAt:  new Date(),
      runsCount:  (ro.runsCount ?? 0) + 1,
    });
  } catch (err) {
    logger.error(`Erreur commande récurrente ${recurringOrderId}:`, err);
  }
}, { connection: redis });

// Cron : vérifier les commandes récurrentes à exécuter (toutes les heures)
async function processRecurringOrders() {
  const due = await AppDataSource.getRepository(RecurringOrder).find({
    where: { isActive: true },
  });
  const now = new Date();
  for (const ro of due) {
    if (new Date(ro.nextRunAt) <= now) {
      await recurringQueue.add('execute', { recurringOrderId: ro.id }, { delay: 0 });
    }
  }
}

// Déclencher toutes les heures
setInterval(processRecurringOrders, 60 * 60 * 1000);


// ══ F6.2 — prévisions de stock hebdomadaires (moyenne mobile) ══
import { StockForecast } from '../entities/StockForecast';
import { computeForecast } from '../shared/utils/forecast';
import { ProductVariant } from '../entities/ProductVariant';

async function computeStockForecasts(): Promise<void> {
  const cutoff = new Date(Date.now() - 180 * 24 * 3600 * 1000);

  // Ventes quotidiennes par variante (commandes non annulées/remboursées)
  const rows = await AppDataSource.getRepository(OrderLine)
    .createQueryBuilder('l')
    .innerJoin('l.order', 'o')
    .select("l.variant_id", 'variantId')
    .addSelect("TO_CHAR(o.ordered_at, 'YYYY-MM-DD')", 'day')
    .addSelect('SUM(l.quantity)', 'qty')
    .where('o.ordered_at >= :cutoff', { cutoff })
    .andWhere("o.status NOT IN ('cancelled','refunded','draft')")
    .groupBy("l.variant_id")
    .addGroupBy("TO_CHAR(o.ordered_at, 'YYYY-MM-DD')")
    .getRawMany<{ variantId: string; day: string; qty: string }>();

  // Regrouper par variante → série journalière complète (trous = 0)
  const byVariant = new Map<string, number[]>();
  const START = Date.now() - 180 * 24 * 3600 * 1000;
  for (const r of rows) {
    if (!byVariant.has(r.variantId)) {
      byVariant.set(r.variantId, new Array(180).fill(0));
    }
    const dayIndex = Math.min(179, Math.max(0, Math.floor((new Date(r.day).getTime() - START) / (24 * 3600 * 1000))));
    byVariant.get(r.variantId)![dayIndex] += Number(r.qty);
  }

  const forecastRepo = AppDataSource.getRepository(StockForecast);
  for (const [variantId, series] of byVariant) {
    // Stock + org vendeuse via le premier StockLevel de la variante
    const sl = await AppDataSource.getRepository(StockLevel)
      .createQueryBuilder('sl')
      .innerJoin('sl.warehouse', 'wh')
      .where('sl.variant_id = :vid', { vid: variantId })
      .select(['sl.qty_on_hand AS onhand', 'sl.qty_reserved AS reserved', 'wh.org_id AS orgid'])
      .getRawOne<{ onhand: string; reserved: string; orgid: string }>();
    if (!sl?.orgid) continue;

    const variant = await AppDataSource.getRepository(ProductVariant).findOneBy({ id: variantId });
    const available = Number(sl.onhand ?? 0) - Number(sl.reserved ?? 0);

    const f = computeForecast(series, variant?.reorderPoint ?? 5, available, 30);
    await forecastRepo.save(forecastRepo.create({
      variantId,
      orgId: sl.orgid,
      horizonDays: 30,
      avgDailySales: f.avgDailySales,
      forecastQty: f.forecastQty,
      availableQty: available,
      reorderPoint: variant?.reorderPoint ?? 5,
      recommendedReorderQty: f.recommendedReorderQty,
      method: 'moving_average',
    }));
  }
  logger.info(`Prévisions stock recalculées (${byVariant.size} variantes)`);
}
setInterval(() => { computeStockForecasts().catch(e => logger.warn('Forecasts:', e.message)); }, 7 * 24 * 3600 * 1000);
computeStockForecasts().catch(() => undefined);
