// ═══════════════════════════════════════════════════════════════
//  AUTH MODULE  —  schema + service + controller + routes
// ═══════════════════════════════════════════════════════════════

import { Router, Request, Response, NextFunction } from 'express';
import { z }                from 'zod';
import bcrypt               from 'bcryptjs';
import jwt                  from 'jsonwebtoken';
import { SignOptions }      from 'jsonwebtoken';
import { AppDataSource }    from '../../config/database';
import { redis, CacheKeys, storeRefreshToken, revokeRefreshToken, revokeAllUserRefreshTokens } from '../../config/redis';
import { env }              from '../../config/env';
import { User }             from '../../entities/User';
import { Organization }     from '../../entities/Organization';
import { ConsentLog }       from '../../entities/ConsentLog';
import { TwoFactorAuth }    from '../../entities/TwoFactorAuth';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { logger }                from '../../shared/utils/logger';
import { generateOTP, generateRef, generateToken } from '../../shared/utils/helpers';
import { phoneFields } from '../../shared/utils/phone';
import { sanitizeUserPhone } from '../../shared/utils/phone';
import { validate, authenticate, authRateLimiter } from '../../middlewares';
import { TwoFAService }        from '../twofa';
import { googleAuthRouter }    from './google';
import { Jobs }                                       from '../../jobs/queues';
import type { UserRole }    from '../../shared/types';

// ─── Schémas Zod ─────────────────────────────────────────────────

export const RegisterSchema = z.object({
  email:        z.string().email('Email invalide'),
  phone:        z.string().regex(/^\+?[0-9]{8,15}$/, 'Téléphone invalide').optional(),
  password:     z.string().min(8, 'Minimum 8 caractères').max(72, 'Maximum 72 caractères')
                  .regex(/[A-Z]/, 'Au moins une majuscule')
                  .regex(/[0-9]/, 'Au moins un chiffre'),
  firstName:    z.string().min(2).max(60),
  lastName:     z.string().min(2).max(60),
  accountType:  z.enum(['individual', 'pro']).default('individual'),
  orgId:        z.string().uuid().optional(),
  // Inscription vendeur : création de l'organisation (non vérifiée) —
  // la vente n'est activée qu'après KYB (documents + validation admin).
  orgName:      z.string().min(2).max(200).trim().optional(),
  orgType:      z.enum(['importer', 'wholesaler', 'retailer', 'garage']).optional(),
});

export const LoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
  remember: z.boolean().default(false),
});

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const ResetPasswordSchema = z.object({
  token:    z.string().min(1),
  password: z.string().min(8).max(72)
              .regex(/[A-Z]/)
              .regex(/[0-9]/),
});

export const VerifyEmailSchema = z.object({
  token: z.string().length(6),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword:     z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
});

export type RegisterDto       = z.infer<typeof RegisterSchema>;
export type LoginDto          = z.infer<typeof LoginSchema>;
export type ResetPasswordDto  = z.infer<typeof ResetPasswordSchema>;

// ─── Service ─────────────────────────────────────────────────────

const userRepo = () => AppDataSource.getRepository(User);

export function signTokens(user: User) {
  const payload = {
    sub:   user.id,
    orgId: user.orgId ?? null,
    roles: user.roles,
    email: user.email,
  };

  const JWT_OPTIONS_BASE = {
    issuer:   'autoparts-api',
    audience: 'autoparts-client',
  };

  const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    ...JWT_OPTIONS_BASE,
    expiresIn: env.JWT_ACCESS_TTL,
  } as SignOptions);

  const refreshToken = jwt.sign(
    { sub: user.id },
    env.JWT_REFRESH_SECRET,
    { ...JWT_OPTIONS_BASE, expiresIn: env.JWT_REFRESH_TTL } as SignOptions,
  );

  return { accessToken, refreshToken };
}

export const AuthService = {

  async register(dto: RegisterDto) {
    const exists = await userRepo().findOneBy({ email: dto.email });
    if (exists) throw ApiError.conflict('Email déjà utilisé');

    // Inscription vendeur : l'org est créée immédiatement (non vérifiée) et
    // le compte devient org_admin — il pourra acheter tout de suite et
    // déposer ses documents KYB pour activer la vente.
    let createdOrgId: string | undefined = dto.orgId;
    if (dto.accountType === 'pro' && dto.orgName && !dto.orgId) {
      if (!dto.orgType) throw ApiError.badRequest('Type d\'organisation requis (importateur, grossiste, détaillant, garage)');
      const orgRepo = AppDataSource.getRepository(Organization);
      const org = orgRepo.create({
        name: dto.orgName,
        orgType: dto.orgType,
        countryCode: 'CM',
        isVerified: false,
        canSell: false,
      });
      const saved = await orgRepo.save(org);
      createdOrgId = saved.id;
    }

    const passwordHash = await bcrypt.hash(dto.password, env.BCRYPT_ROUNDS);
    const otp          = generateOTP(6);

    const user = userRepo().create({
      email:        dto.email,
      ...phoneFields(dto.phone),
      passwordHash,
      firstName:    dto.firstName,
      lastName:     dto.lastName,
      accountType:  dto.accountType,
      orgId:        createdOrgId,
      // Créateur de l'org pro → org_admin (gestion KYB, membres, produits)
      roles:        dto.accountType === 'pro' && createdOrgId ? ['buyer', 'org_admin'] : ['buyer'],
      isVerified:   false,
    });

    await userRepo().save(user);

    // Journaliser le consentement aux CGV (RGPD, E6d)
    await AppDataSource.getRepository(ConsentLog).save(
      AppDataSource.getRepository(ConsentLog).create({
        user: { id: user.id }, type: 'cgv', version: '1.0', accepted: true,
      }),
    );

    // Stocker OTP en Redis (10 min) et l'envoyer par email
    await redis.setex(`otp:verify:${user.id}`, 600, otp);
    Jobs.sendEmail({
      to:       user.email,
      subject:  '[AutoParts] Vérifiez votre email',
      template: 'verify-email',
      context:  { otp },
    }).catch(e => logger.warn('Email verify-email non envoyé:', e.message));

    const { accessToken, refreshToken } = signTokens(user);
    await storeRefreshToken(refreshToken, user.id, 30 * 24 * 3600);

    return { user: await sanitizeWithOrg(user), accessToken, refreshToken };
  },

  async login(dto: LoginDto) {
    const user = await userRepo().findOneBy({ email: dto.email });
    if (!user) throw ApiError.unauthorized('Email ou mot de passe incorrect');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw ApiError.unauthorized('Email ou mot de passe incorrect');

    if (!user.isVerified) throw ApiError.forbidden('Compte non vérifié. Consultez vos emails.');

    // G6a — 2FA activée : ne PAS émettre les tokens ici. Un jeton temporaire
    // (5 min, usage unique) est retourné ; il faut le code TOTP pour obtenir
    // la session complète via POST /auth/2fa/login-verify.
    const tfa = await AppDataSource.getRepository(TwoFactorAuth)
      .findOneBy({ userId: user.id, isEnabled: true });
    if (tfa) {
      const twoFAToken = generateToken(24);
      await redis.setex(`2fa:login:${twoFAToken}`, 300, user.id);
      return { requiresTwoFA: true, twoFAToken };
    }

    // Mettre à jour last_login
    await userRepo().update(user.id, { lastLoginAt: new Date() });

    const { accessToken, refreshToken } = signTokens(user);
    await storeRefreshToken(
      refreshToken,
      user.id,
      dto.remember ? 30 * 24 * 3600 : 24 * 3600,
    );

    return { user: await sanitizeWithOrg(user), accessToken, refreshToken };
  },

  async refresh(token: string) {
    const userId = await redis.get(CacheKeys.refreshToken(token));
    if (!userId) throw ApiError.unauthorized('Refresh token invalide ou expiré');

    let payload: { sub: string };
    try {
      payload = jwt.verify(token, env.JWT_REFRESH_SECRET, {
        issuer:   'autoparts-api',
        audience: 'autoparts-client',
      }) as { sub: string };
    } catch {
      throw ApiError.unauthorized('Refresh token invalide');
    }

    const user = await userRepo().findOneByOrFail({ id: payload.sub });

    // Rotation du refresh token (one-time use)
    await revokeRefreshToken(token);
    const { accessToken, refreshToken: newRefresh } = signTokens(user);
    await storeRefreshToken(newRefresh, user.id, 30 * 24 * 3600);

    return { accessToken, refreshToken: newRefresh };
  },

  async logout(accessToken: string, refreshToken?: string) {
    // Blacklister l'access token jusqu'à expiration
    const decoded = jwt.decode(accessToken) as { exp: number } | null;
    if (decoded?.exp) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) await redis.setex(`blacklist:${accessToken}`, ttl, '1');
    }
    if (refreshToken) await revokeRefreshToken(refreshToken);
  },

  /**
   * G6a — seconde étape du login 2FA : consomme le jeton temporaire,
   * vérifie le code TOTP, puis émet la session complète.
   */
  async verifyLogin2FA(twoFAToken: string, code: string) {
    const userId = await redis.get(`2fa:login:${twoFAToken}`);
    if (!userId) throw ApiError.unauthorized('Session 2FA expirée — reconnectez-vous');

    const tfa = await AppDataSource.getRepository(TwoFactorAuth)
      .findOneBy({ userId, isEnabled: true });
    if (!tfa) throw ApiError.badRequest('2FA non activée pour ce compte');

    const ok = await TwoFAService.verify(userId, code);
    if (!ok) throw ApiError.unauthorized('Code 2FA invalide');

    // Usage unique + rotation du lastLogin
    await redis.del(`2fa:login:${twoFAToken}`);
    const user = await userRepo().findOneByOrFail({ id: userId });
    await userRepo().update(user.id, { lastLoginAt: new Date() });

    const { accessToken, refreshToken } = signTokens(user);
    await storeRefreshToken(refreshToken, user.id, 30 * 24 * 3600);
    return { user: await sanitizeWithOrg(user), accessToken, refreshToken };
  },

  async verifyEmail(userId: string, otp: string) {
    const stored = await redis.get(`otp:verify:${userId}`);
    if (!stored || stored !== otp) throw ApiError.badRequest('Code OTP invalide ou expiré');

    await userRepo().update(userId, { isVerified: true });
    await redis.del(`otp:verify:${userId}`);
  },

  /** Renvoi du code de vérification email (OTP 6 chiffres, 10 min). */
  async resendVerificationOtp(userId: string) {
    const user = await userRepo().findOneByOrFail({ id: userId });
    if (user.isVerified) throw ApiError.badRequest('Cet email est déjà vérifié');

    const otp = generateOTP(6);
    await redis.setex(`otp:verify:${user.id}`, 600, otp);
    Jobs.sendEmail({
      to:       user.email,
      subject:  '[AutoParts] Votre nouveau code de vérification',
      template: 'verify-email',
      context:  { otp },
    }).catch(e => logger.warn('Email verify-email (resend) non envoyé:', e.message));

    return { resent: true };
  },

  async forgotPassword(email: string) {
    const user = await userRepo().findOneBy({ email });
    if (!user) return; // Ne pas révéler si l'email existe

    const token = generateRef('RST');
    await redis.setex(`reset:${token}`, 3600, user.id); // 1h
    Jobs.sendEmail({
      to:       user.email,
      subject:  '[AutoParts] Réinitialisation de votre mot de passe',
      template: 'password-reset',
      context:  { token },
    }).catch(e => logger.warn('Email password-reset non envoyé:', e.message));
  },

  async resetPassword(token: string, password: string) {
    const userId = await redis.get(`reset:${token}`);
    if (!userId) throw ApiError.badRequest('Token invalide ou expiré');

    const hash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
    await userRepo().update(userId, { passwordHash: hash });
    await redis.del(`reset:${token}`);
    // Invalider toutes les sessions de l'utilisateur (via l'index par user,
    // jamais un scan global de l'espace de clés Redis)
    await revokeAllUserRefreshTokens(userId);
  },

  async changePassword(userId: string, current: string, next: string) {
    const user = await userRepo().findOneByOrFail({ id: userId });
    const valid = await bcrypt.compare(current, user.passwordHash);
    if (!valid) throw ApiError.badRequest('Mot de passe actuel incorrect');

    const hash = await bcrypt.hash(next, env.BCRYPT_ROUNDS);
    await userRepo().update(userId, { passwordHash: hash });
  },
};

function sanitize(user: User) {
  const { passwordHash: _, ...safe } = user as any;
  return sanitizeUserPhone(safe as any);
}

/**
 * Règles org_type — expose à la session le résumé de l'organisation de
 * l'utilisateur (orgType, canSell, tier) : le frontend en a besoin pour
 * afficher les états vendeur/acheteur et le MOQ, sans jamais décider
 * des droits (le filtrage réel est backend).
 */
async function sanitizeWithOrg(user: User) {
  const safe = sanitize(user) as any;
  if (user.orgId) {
    const org = await AppDataSource.getRepository(Organization).findOne({
      where: { id: user.orgId },
      relations: ['tier'],
    });
    if (org) {
      safe.org = {
        id:          org.id,
        name:        org.name,
        orgType:     org.orgType,
        canSell:     org.canSell === true,
        isVerified:  org.isVerified,
        creditLimit: Number(org.creditLimit ?? 0),
        tier: org.tier
          ? { id: org.tier.id, name: org.tier.name, discountRate: Number(org.tier.discountRate) }
          : null,
      };
    }
  }
  return safe;
}

// ─── Contrôleur ──────────────────────────────────────────────────

const AuthController = {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.register(req.body as RegisterDto);
      res.status(201).json(ApiResponse.created(result, 'Compte créé. Vérifiez vos emails.'));
    } catch (e) { next(e); }
  },

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.login(req.body);
      res.json(ApiResponse.success(result, 'Connexion réussie'));
    } catch (e) { next(e); }
  },

  async verifyLogin2FA(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.verifyLogin2FA(req.body.twoFAToken, req.body.code);
      res.json(ApiResponse.success(result, 'Connexion réussie'));
    } catch (e) { next(e); }
  },

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await AuthService.refresh(req.body.refreshToken);
      res.json(ApiResponse.success(result));
    } catch (e) { next(e); }
  },

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) {
        return next(ApiError.unauthorized('Token manquant'));
      }
      await AuthService.logout(header.slice(7), req.body.refreshToken);
      res.json(ApiResponse.noContent());
    } catch (e) { next(e); }
  },

  async verifyEmail(req: Request, res: Response, next: NextFunction) {
    try {
      await AuthService.verifyEmail(req.user!.id, req.body.token);
      res.json(ApiResponse.success(null, 'Email vérifié'));
    } catch (e) { next(e); }
  },

  async resendOtp(req: Request, res: Response, next: NextFunction) {
    try {
      await AuthService.resendVerificationOtp(req.user!.id);
      res.json(ApiResponse.success(null, 'Nouveau code envoyé par email'));
    } catch (e) { next(e); }
  },

  async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      await AuthService.forgotPassword(req.body.email);
      res.json(ApiResponse.success(null, 'Email envoyé si le compte existe'));
    } catch (e) { next(e); }
  },

  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      await AuthService.resetPassword(req.body.token, req.body.password);
      res.json(ApiResponse.success(null, 'Mot de passe réinitialisé'));
    } catch (e) { next(e); }
  },

  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      await AuthService.changePassword(req.user!.id, req.body.currentPassword, req.body.newPassword);
      res.json(ApiResponse.noContent());
    } catch (e) { next(e); }
  },

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await userRepo().findOneByOrFail({ id: req.user!.id });
      res.json(ApiResponse.success(await sanitizeWithOrg(user)));
    } catch (e) { next(e); }
  },
};

// ─── Routes ──────────────────────────────────────────────────────

export const authRouter = Router();

// Google OAuth (id_token GIS + code flow) monté sur /auth/google*

authRouter.post('/register',
  authRateLimiter,
  validate(RegisterSchema),
  AuthController.register,
);
authRouter.post('/login',
  authRateLimiter,
  validate(LoginSchema),
  AuthController.login,
);
authRouter.post('/refresh',
  validate(RefreshSchema),
  AuthController.refresh,
);
// G6a — seconde étape du login 2FA (public : autorisé par le jeton temporaire)
const LoginVerify2FASchema = z.object({
  twoFAToken: z.string().min(20),
  code:       z.string().length(6),
});
authRouter.post('/2fa/login-verify',
  authRateLimiter,
  validate(LoginVerify2FASchema),
  AuthController.verifyLogin2FA,
);
authRouter.use(googleAuthRouter);
authRouter.post('/logout',
  authenticate,
  AuthController.logout,
);
authRouter.post('/verify-email',
  authenticate,
  validate(VerifyEmailSchema),
  AuthController.verifyEmail,
);
authRouter.post('/otp/resend',
  authenticate,
  authRateLimiter,
  AuthController.resendOtp,
);
authRouter.post('/forgot-password',
  authRateLimiter,
  validate(ForgotPasswordSchema),
  AuthController.forgotPassword,
);
authRouter.post('/reset-password',
  validate(ResetPasswordSchema),
  AuthController.resetPassword,
);
authRouter.patch('/change-password',
  authenticate,
  validate(ChangePasswordSchema),
  AuthController.changePassword,
);
authRouter.get('/me',
  authenticate,
  AuthController.me,
);
