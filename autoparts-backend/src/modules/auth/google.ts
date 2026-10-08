// ═══════════════════════════════════════════════════════════════
//  AUTH GOOGLE — OAuth 2.0 (id_token GIS + authorization code)
//  POST /auth/google            { idToken }  (Google Identity Services)
//  POST /auth/google            { code, redirectUri }  (code flow)
//  GET  /auth/google/callback   ?code&state  → 302 vers le front (#tokens)
// ═══════════════════════════════════════════════════════════════

import { Router, Request, Response, NextFunction } from 'express';
import { z }                from 'zod';
import axios                from 'axios';
import bcrypt               from 'bcryptjs';
import { OAuth2Client }     from 'google-auth-library';
import { AppDataSource }    from '../../config/database';
import { redis }            from '../../config/redis';
import { env }              from '../../config/env';
import { User }             from '../../entities/User';
import { ConsentLog }       from '../../entities/ConsentLog';
import { ApiError, ApiResponse } from '../../shared/utils/response';
import { logger }           from '../../shared/utils/logger';
import { storeRefreshToken } from '../../config/redis';
import { validate, authRateLimiter } from '../../middlewares';
import { sanitizeUserPhone } from '../../shared/utils/phone';
import { AuthService, signTokens }    from './index';

// ─── Client Google (vérification des id_token) ──────────────────
const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

const GoogleAuthSchema = z.object({
  idToken:     z.string().min(20).optional(),
  code:        z.string().min(10).optional(),
  redirectUri: z.string().optional(),
});

interface GoogleProfile {
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  picture?: string | null;
}

function sanitize(u: User) {
  const { passwordHash: _, ...safe } = u as any;
  return sanitizeUserPhone(safe as any);
}

export const GoogleAuthService = {

  /** Échange un id_token Google (flow GIS) contre une session applicative. */
  async loginWithIdToken(idToken: string) {
    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (e) {
      throw ApiError.unauthorized('id_token Google invalide ou expiré');
    }
    if (!payload?.email) throw ApiError.unauthorized('id_token sans email');

    return this.findOrCreateFromGoogle({
      email:         payload.email.toLowerCase(),
      emailVerified: payload.email_verified === true,
      firstName:     payload.given_name ?? payload.email.split('@')[0],
      lastName:      payload.family_name ?? '-',
      picture:       payload.picture ?? null,
    });
  },

  /** Échange un authorization code (flow redirect serveur) contre une session. */
  async loginWithAuthCode(code: string, redirectUri: string) {
    let idToken: string;
    try {
      const { data } = await axios.post<{ id_token?: string }>(
        'https://oauth2.googleapis.com/token',
        {
          code,
          client_id:     env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_SECRET,
          redirect_uri:  redirectUri,
          grant_type:    'authorization_code',
        },
        { timeout: 10_000 },
      );
      if (!data.id_token) throw new Error('id_token absent de la réponse Google');
      idToken = data.id_token;
    } catch (e) {
      logger.warn('Échange code Google échoué:', (e as Error).message);
      throw ApiError.unauthorized('Code Google invalide ou expiré');
    }
    return this.loginWithIdToken(idToken);
  },

  /**
   * Connecte l'email Google : compte existant → session directe ;
   * email inconnu → création automatique buyer, email déjà vérifié, pas d'OTP.
   */
  async findOrCreateFromGoogle(profile: GoogleProfile) {
    if (!profile.emailVerified) {
      throw ApiError.forbidden("L'email Google n'est pas vérifié — connexion refusée");
    }

    const userRepo = () => AppDataSource.getRepository(User);
    let user = await userRepo().findOneBy({ email: profile.email });
    let created = false;

    if (!user) {
      // Compte Google : pas de mot de passe utilisé (hash aléatoire),
      // email considéré vérifié par Google → pas d'étape OTP.
      const randomPassword = await bcrypt.genSalt(12);
      user = userRepo().create({
        email:       profile.email,
        passwordHash: await bcrypt.hash(randomPassword + Date.now(), env.BCRYPT_ROUNDS),
        firstName:   profile.firstName.slice(0, 60),
        lastName:    profile.lastName.slice(0, 60),
        accountType: 'individual',
        roles:       ['buyer'],
        isVerified:  true,
      });
      await userRepo().save(user);
      created = true;

      await AppDataSource.getRepository(ConsentLog).save(
        AppDataSource.getRepository(ConsentLog).create({
          user: { id: user.id }, type: 'cgv', version: '1.0', accepted: true,
        }),
      );
    } else if (!user.isVerified) {
      // Un compte email/mdp non vérifié avec le même email : Google atteste
      // la possession de l'adresse → on considère l'email vérifié.
      await userRepo().update(user.id, { isVerified: true });
      user.isVerified = true;
      await redis.del(`otp:verify:${user.id}`);
    }

    await userRepo().update(user.id, { lastLoginAt: new Date() });

    const { accessToken, refreshToken } = signTokens(user);
    await storeRefreshToken(refreshToken, user.id, 30 * 24 * 3600);

    return { user: sanitize(user), accessToken, refreshToken, created };
  },
};

// ─── Routes ─────────────────────────────────────────────────────

export const googleAuthRouter = Router();

googleAuthRouter.post('/google',
  authRateLimiter,
  validate(GoogleAuthSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { idToken, code, redirectUri } = req.body as z.infer<typeof GoogleAuthSchema>;
      let result;
      if (idToken) {
        result = await GoogleAuthService.loginWithIdToken(idToken);
      } else if (code && redirectUri) {
        result = await GoogleAuthService.loginWithAuthCode(code, redirectUri);
      } else {
        throw ApiError.badRequest('Fournir idToken, ou code + redirectUri');
      }
      res.json(ApiResponse.success(result, result.created
        ? 'Compte créé via Google — bienvenue !'
        : 'Connexion Google réussie'));
    } catch (e) { next(e); }
  },
);

/**
 * Flow redirect côté serveur (optionnel) : Google appelle cette URL avec
 * ?code=...&state=<origin du frontend>. L'origin est validée contre
 * ALLOWED_ORIGINS (anti-CSRF), puis 302 vers {state}/auth/google/callback
 * avec les tokens en fragment (#…) pour qu'ils n'aillent jamais au serveur.
 */
googleAuthRouter.get('/google/callback',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const code  = req.query.code as string | undefined;
      const state = (req.query.state as string | undefined) ?? '';
      const allowed = env.ALLOWED_ORIGINS.split(',').map(o => o.trim());
      const frontend = allowed.find(o => o === state) ?? allowed[0];
      if (!code) throw ApiError.badRequest('Paramètre code manquant');

      try {
        const redirectUri = `${frontend}/auth/google/callback`;
        const result = await GoogleAuthService.loginWithAuthCode(code, redirectUri);
        const frag = `#access_token=${encodeURIComponent(result.accessToken)}` +
                     `&refresh_token=${encodeURIComponent(result.refreshToken)}`;
        res.redirect(302, `${frontend}/auth/google/callback${frag}`);
      } catch (e) {
        res.redirect(302, `${frontend}/auth/google/callback?error=google_exchange_failed`);
      }
    } catch (e) { next(e); }
  },
);
