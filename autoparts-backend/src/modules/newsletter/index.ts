import { Router, Request, Response, NextFunction } from 'express';
import { z }             from 'zod';
import { randomUUID }    from 'crypto';
import { AppDataSource } from '../../config/database';
import { User }          from '../../entities/User';
import { Campaign, CampaignRecipient } from '../../entities/Campaign';
import { ApiResponse, ApiError }   from '../../shared/utils/response';
import { validate, authenticate, authorize } from '../../middlewares';
import { Queue }         from 'bullmq';
import { redis }         from '../../config/redis';
import { Jobs }          from '../../jobs/queues';
import { env }           from '../../config/env';

const CampaignSchema = z.object({
  subject:     z.string().min(3).max(200).trim(),
  body:        z.string().min(10).max(10000).trim(),
  audience:    z.enum(['all','buyers','sellers','pro']).default('all'),
  scheduledAt: z.coerce.date().optional(),
});

// Queue créée paresseusement : une instanciation au chargement du module
// ouvrirait une connexion Redis dès l'import (blocage en tests, reconnexions
// infinies si Redis est down au démarrage).
let newsletterQueue: Queue | null = null;
function getNewsletterQueue(): Queue {
  if (!newsletterQueue) newsletterQueue = new Queue('newsletter', { connection: redis });
  return newsletterQueue;
}

export const NewsletterService = {
  /**
   * F5.2 — envoi de campagne avec suivi d'ouverture/clic et désinscription.
   * Persiste Campaign + CampaignRecipient (token unique par destinataire),
   * envoie via la queue email (worker réel) un HTML personnalisé :
   * pixel d'ouverture + liens réécrits via /campaigns/track/click.
   * Exclut les utilisateurs en opt-out marketing (RGPD).
   */
  async send(dto: z.infer<typeof CampaignSchema>) {
    const userRepo = AppDataSource.getRepository(User);
    const baseQb = () => userRepo.createQueryBuilder('u').where('u.isVerified = true').andWhere('u.marketing_opt_out = false');
    let users: User[];
    switch (dto.audience) {
      case 'buyers':  users = await baseQb().andWhere("u.roles LIKE '%buyer%'").getMany(); break;
      case 'sellers': users = await baseQb().andWhere("u.roles LIKE '%seller%'").getMany(); break;
      case 'pro':     users = await baseQb().andWhere('u.account_type = :t', { t: 'pro' }).getMany(); break;
      default:        users = await baseQb().getMany(); break;
    }

    // Persister la campagne AVANT l'envoi (traçabilité + stats)
    const campaign = await AppDataSource.getRepository(Campaign).save(
      AppDataSource.getRepository(Campaign).create({
        subject: dto.subject, body: dto.body, audience: dto.audience,
        status: 'sending', sentAt: dto.scheduledAt ?? new Date(),
      }),
    );

    const delay = dto.scheduledAt ? Math.max(0, dto.scheduledAt.getTime() - Date.now()) : 0;
    const batchSize = 50;

    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      for (const u of batch) {
        const token = randomUUID().replace(/-/g, '');
        const recipient = AppDataSource.getRepository(CampaignRecipient).create({
          campaign: { id: campaign.id } as any,
          user:     { id: u.id } as any,
          email:    u.email,
          token,
        });
        await AppDataSource.getRepository(CampaignRecipient).save(recipient);

        // HTML par destinataire : pixel + liens trackés + désinscription
        const html = buildTrackedHtml(dto.body, token);
        Jobs.sendEmail({
          to:       u.email,
          subject:  dto.subject,
          template: 'custom',
          context:  { html, firstName: u.firstName },
        }).catch(() => undefined);
      }
      // Espacer les batchs pour ne pas saturer le SMTP
      if (i + batchSize < users.length) {
        await new Promise(r => setTimeout(r, Math.min(2000, delay || 2000)));
      }
    }

    await AppDataSource.getRepository(Campaign).update(campaign.id, { status: 'sent' });
    return { campaignId: campaign.id, scheduledAt: dto.scheduledAt ?? new Date(), recipientCount: users.length };
  },

  /** Stats d'une campagne : ouverture / clic / désinscription (F5.2). */
  async campaignStats(campaignId: string) {
    const campaign = await AppDataSource.getRepository(Campaign).findOneByOrFail({ id: campaignId });
    const total = await AppDataSource.getRepository(CampaignRecipient).count({ where: { campaign: { id: campaignId } } });
    const opened = await AppDataSource.getRepository(CampaignRecipient)
      .createQueryBuilder('r').where('r.campaign_id = :cid AND r.opened_at IS NOT NULL', { cid: campaignId }).getCount();
    const clicked = await AppDataSource.getRepository(CampaignRecipient)
      .createQueryBuilder('r').where('r.campaign_id = :cid AND r.clicked_at IS NOT NULL', { cid: campaignId }).getCount();
    const unsubscribed = await AppDataSource.getRepository(CampaignRecipient)
      .createQueryBuilder('r').where('r.campaign_id = :cid AND r.unsubscribed_at IS NOT NULL', { cid: campaignId }).getCount();
    return {
      campaign: { id: campaign.id, subject: campaign.subject, sentAt: campaign.sentAt },
      total,
      opened, openRate: total ? Math.round(opened / total * 1000) / 10 : 0,
      clicked, clickRate: total ? Math.round(clicked / total * 1000) / 10 : 0,
      unsubscribed,
    };
  },

  async stats() {
    const queue = getNewsletterQueue();
    const [waiting, completed, failed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
    ]);
    return { waiting, completed, failed };
  },
};

/** Injecte pixel d'ouverture + réécriture des liens + lien désinscription. */
function buildTrackedHtml(body: string, token: string): string {
  const base = env.APP_URL;
  let html = body;
  // Réécrit les liens http(s) pour tracer les clics (302 transparent)
  html = html.replace(/href="(https?:\/\/[^"]+)"/g, (_m, url: string) => {
    if (url.startsWith(base)) return `href="${url}"`; // ne pas tracer nos propres liens
    return `href="${base}/campaigns/track/click/${token}?url=${encodeURIComponent(url)}"`;
  });
  const pixel = `<img src="${base}/campaigns/track/open/${token}" width="1" height="1" alt="" style="display:none" />`;
  const unsub = `<p style="font-size:11px;color:#888;text-align:center;margin-top:24px">
    <a href="${base}/campaigns/unsubscribe/${token}">Se désinscrire de ces emails</a></p>`;
  return html + pixel + unsub;
}

export const newsletterRouter = Router();
newsletterRouter.use(authenticate, authorize('super_admin'));
newsletterRouter.get('/stats',     async (req: Request, res: Response, next: NextFunction) => { try { res.json(ApiResponse.success(await NewsletterService.stats())); } catch(e){next(e);} });
newsletterRouter.post('/campaign', validate(CampaignSchema), async (req: Request, res: Response, next: NextFunction) => { try { res.json(ApiResponse.success(await NewsletterService.send(req.body), 'Campagne programmée')); } catch(e){next(e);} });
newsletterRouter.get('/campaigns/:id/stats', async (req: Request, res: Response, next: NextFunction) => { try { res.json(ApiResponse.success(await NewsletterService.campaignStats(req.params.id))); } catch(e){next(e);} });

// ── F5.2 : tracking public (pixel, clic, désinscription) ───────
// AVANT authenticate : appelé par le client mail de l'utilisateur.

// Pixel 1×1 — enregistre l'ouverture
newsletterRouter.get('/campaigns/track/open/:token', async (req: Request, res: Response) => {
  await AppDataSource.getRepository(CampaignRecipient).update(
    { token: req.params.token },
    { openedAt: new Date() },
  ).catch(() => undefined);
  // GIF transparent 1x1
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store');
  res.send(gif);
});

// Clic : enregistre puis redirige (302) — URL http(s) uniquement (anti open-redirect)
newsletterRouter.get('/campaigns/track/click/:token', async (req: Request, res: Response) => {
  const url = String(req.query.url ?? '');
  if (/^https?:\/\//i.test(url)) {
    await AppDataSource.getRepository(CampaignRecipient).update(
      { token: req.params.token },
      { clickedAt: new Date() },
    ).catch(() => undefined);
    return res.redirect(302, url);
  }
  res.status(400).send('URL invalide');
});

// Désinscription 1 clic (RGPD) : opt-out marketing sur le compte lié
newsletterRouter.get('/campaigns/unsubscribe/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const recipient = await AppDataSource.getRepository(CampaignRecipient).findOne({
      where: { token: req.params.token },
      relations: ['user'],
    });
    if (!recipient) throw ApiError.notFound('Lien de désinscription invalide');

    if (recipient.user) {
      await AppDataSource.getRepository(User).update((recipient.user as any).id, { marketingOptOut: true });
    }
    await AppDataSource.getRepository(CampaignRecipient).update(
      { id: recipient.id },
      { unsubscribedAt: new Date() },
    );
    res.send('<html><body style="font-family:sans-serif;text-align:center;padding-top:60px"><h2>Vous êtes désinscrit(e) ✅</h2><p>Vous ne recevrez plus d\'emails marketing.</p></body></html>');
  } catch (e) { next(e); }
});
