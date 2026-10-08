import { Router, Request, Response, NextFunction } from 'express';
import { z }                from 'zod';
import crypto               from 'crypto';
import { AppDataSource }    from '../../config/database';
import { TwoFactorAuth }    from '../../entities/TwoFactorAuth';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { validate, authenticate } from '../../middlewares';
import { hashSHA256 }       from '../../shared/utils/helpers';

// ─── TOTP implémentation native (sans lib) ────────────────────
function generateSecret(): string {
  return crypto.randomBytes(20).toString('hex').toUpperCase();
}

function hotp(secret: string, counter: number): string {
  const key = Buffer.from(secret, 'hex');
  const msg = Buffer.alloc(8);
  msg.writeBigInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = hmac[19] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

function totp(secret: string, windowSec = 30): string {
  const counter = Math.floor(Date.now() / 1000 / windowSec);
  return hotp(secret, counter);
}

function verifyTotp(secret: string, token: string, drift = 1): boolean {
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (let d = -drift; d <= drift; d++) {
    const expected = hotp(secret, counter + d);
    const a = Buffer.from(expected);
    const b = Buffer.from(token.padStart(6, '0'));
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return false;
}

// ─── Service ─────────────────────────────────────────────────
const repo = () => AppDataSource.getRepository(TwoFactorAuth);

export const TwoFAService = {
  async setup(userId: string) {
    const secret    = generateSecret();
    const existing  = await repo().findOneBy({ userId });
    if (existing) {
      existing.secret    = secret;
      existing.isEnabled = false;
      await repo().save(existing);
    } else {
      await repo().save(repo().create({ user: { id: userId }, userId, secret, isEnabled: false }));
    }
    // URI TOTP standard (compatible Google Authenticator)
    const uri = `otpauth://totp/AutoParts:${userId}?secret=${Buffer.from(secret).toString('base64')}&issuer=AutoParts&digits=6&period=30`;
    return { secret, uri, qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(uri)}` };
  },

  async enable(userId: string, token: string) {
    const tfa = await repo().findOneBy({ userId });
    if (!tfa || tfa.isEnabled) throw ApiError.badRequest('2FA non configuré ou déjà actif');
    if (!verifyTotp(tfa.secret, token)) throw ApiError.badRequest('Code invalide');
    // Générer 8 codes de backup
    const backupCodes = Array.from({ length: 8 }, () => crypto.randomBytes(4).toString('hex'));
    tfa.isEnabled   = true;
    tfa.backupCodes = backupCodes.map(c => hashSHA256(c));
    await repo().save(tfa);
    return { backupCodes };
  },

  async disable(userId: string, token: string) {
    const tfa = await repo().findOneBy({ userId });
    if (!tfa?.isEnabled) throw ApiError.badRequest('2FA non actif');
    if (!verifyTotp(tfa.secret, token)) throw ApiError.badRequest('Code invalide');
    tfa.isEnabled   = false;
    tfa.backupCodes = undefined;
    await repo().save(tfa);
  },

  async verify(userId: string, token: string): Promise<boolean> {
    const tfa = await repo().findOneBy({ userId });
    if (!tfa?.isEnabled) return true; // 2FA pas activé → passer
    if (verifyTotp(tfa.secret, token)) return true;
    // Vérifier codes backup
    if (tfa.backupCodes) {
      const hashed = hashSHA256(token);
      const idx    = tfa.backupCodes.indexOf(hashed);
      if (idx >= 0) {
        tfa.backupCodes.splice(idx, 1);
        await repo().save(tfa);
        return true;
      }
    }
    return false;
  },

  async getStatus(userId: string) {
    const tfa = await repo().findOneBy({ userId });
    return { isEnabled: tfa?.isEnabled ?? false, backupCodesCount: tfa?.backupCodes?.length ?? 0 };
  },
};

// ─── Routes ──────────────────────────────────────────────────
const VerifySchema = z.object({ token: z.string().length(6).regex(/^\d{6}$/) });

export const twofaRouter = Router();
twofaRouter.use(authenticate);

twofaRouter.get('/status',  async (req, res, next) => { try { res.json(ApiResponse.success(await TwoFAService.getStatus(req.user!.id))); } catch(e){next(e);} });
twofaRouter.post('/setup',  async (req, res, next) => { try { res.json(ApiResponse.success(await TwoFAService.setup(req.user!.id))); } catch(e){next(e);} });
twofaRouter.post('/enable', validate(VerifySchema), async (req, res, next) => { try { res.json(ApiResponse.success(await TwoFAService.enable(req.user!.id, req.body.token), '2FA activé avec succès')); } catch(e){next(e);} });
twofaRouter.post('/disable',validate(VerifySchema), async (req, res, next) => { try { await TwoFAService.disable(req.user!.id, req.body.token); res.json(ApiResponse.noContent()); } catch(e){next(e);} });
