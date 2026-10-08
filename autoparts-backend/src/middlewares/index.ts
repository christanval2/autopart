import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError }          from 'zod';
import jwt                                 from 'jsonwebtoken';
import { v4 as uuidv4 }                   from 'uuid';
import rateLimit                           from 'express-rate-limit';
import RedisStore                          from 'rate-limit-redis';
import { sanitizeDeep } from '../shared/utils/helpers';
import { env }                             from '../config/env';
import { redis }                           from '../config/redis';
import { logger }                          from '../shared/utils/logger';
import { ApiError }                        from '../shared/utils/response';
import type { UserRole }                   from '../shared/types';

// ═══════════════════════════════════════════════════════════
//  1. validate — Validation Zod générique
// ═══════════════════════════════════════════════════════════

type Target = 'body' | 'query' | 'params';

export const validate =
  (schema: AnyZodObject, target: Target = 'body') =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      const details = result.error.errors.map(e => ({
        field:   e.path.join('.'),
        message: e.message,
        code:    e.code,
      }));
      return next(ApiError.unprocessable('Données invalides', details));
    }
    (req as any)[target] = result.data;
    next();
  };


// ═══════════════════════════════════════════════════════════
//  json-sanitizer — retire passwordHash de toutes les réponses
// ═══════════════════════════════════════════════════════════
export const jsonSanitizer = (_req: Request, res: Response, next: NextFunction): void => {
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    return originalJson(sanitizeDeep(body));
  };
  next();
};

// ═══════════════════════════════════════════════════════════
//  2. authenticate — Vérification JWT
// ═══════════════════════════════════════════════════════════

interface JwtPayload {
  sub:   string;
  orgId: string | null;
  roles: UserRole[];
  email: string;
  // F1b — présent uniquement sur les tokens d'impersonation
  impersonatorId?: string;
  iat:   number;
  exp:   number;
}

export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(ApiError.unauthorized('Token manquant'));
  }

  try {
    const token   = header.slice(7);

    // Vérifier blacklist Redis
    const blacklisted = await redis.get(`blacklist:${token}`);
    if (blacklisted) return next(ApiError.unauthorized('Token révoqué'));

    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer:   'autoparts-api',
      audience: 'autoparts-client',
    }) as JwtPayload;

    req.user = {
      id:    payload.sub,
      orgId: payload.orgId,
      roles: payload.roles,
      email: payload.email,
      ...(payload.impersonatorId ? { impersonatorId: payload.impersonatorId } : {}),
    };
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError)
      return next(ApiError.unauthorized('Token expiré'));
    if (err instanceof jwt.JsonWebTokenError)
      return next(ApiError.unauthorized('Token invalide'));
    next(err);
  }
};

// ═══════════════════════════════════════════════════════════
//  2b. optionalAuthenticate — renseigne req.user si un token
//      valide est présent, sinon continue anonymement
// ═══════════════════════════════════════════════════════════

export const optionalAuthenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!req.headers.authorization?.startsWith('Bearer ')) return next();
  // Réutilise authenticate ; en cas de token invalide on reste anonyme
  // plutôt que de bloquer la route publique.
  await new Promise<void>(resolve => {
    authenticate(req, _res, (err?: unknown) => { void err; resolve(); });
  });
  next();
};

// ═══════════════════════════════════════════════════════════
//  3. authorize — RBAC
// ═══════════════════════════════════════════════════════════

export const authorize =
  (...roles: UserRole[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(ApiError.unauthorized());
    const hasRole = roles.some(r => req.user!.roles.includes(r));
    if (!hasRole) {
      return next(ApiError.forbidden(`Rôle requis : ${roles.join(' | ')}`));
    }
    next();
  };

// ═══════════════════════════════════════════════════════════
//  4. requireOwnership — Vérification propriétaire ressource
// ═══════════════════════════════════════════════════════════

export const requireOwnership =
  (getOwnerId: (req: Request) => Promise<string>) =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const isAdmin = req.user?.roles.some(r =>
        (['super_admin', 'org_admin'] as UserRole[]).includes(r),
      );
      if (isAdmin) return next();
      const ownerId = await getOwnerId(req);
      if (ownerId !== req.user?.id) return next(ApiError.forbidden());
      next();
    } catch (err) { next(err); }
  };

// ═══════════════════════════════════════════════════════════
//  5. Rate limiters
// ═══════════════════════════════════════════════════════════

const redisStoreOptions = {
  sendCommand: (...args: string[]) => (redis as any).call(...args),
};

export const globalRateLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             env.NODE_ENV === 'test' ? 10000 : 300,
  standardHeaders: true,
  legacyHeaders:   false,
  store: new RedisStore({ ...redisStoreOptions, prefix: 'rl:global:' }),
  handler: (_req: Request, _res: Response, next: NextFunction) =>
    next(ApiError.tooManyRequests()),
});

export const authRateLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             env.NODE_ENV === 'test' ? 10000 : 10,
  standardHeaders: true,
  legacyHeaders:   false,
  store: new RedisStore({ ...redisStoreOptions, prefix: 'rl:auth:' }),
  handler: (_req: Request, _res: Response, next: NextFunction) =>
    next(ApiError.tooManyRequests()),
});

// Rate limiter par user (actions critiques)
export const perUserRateLimit =
  (key: string, limit: number, windowSec: number) =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const identifier = req.user?.id ?? req.ip ?? 'anon';
    const redisKey   = `rl:${key}:${identifier}`;
    const current    = await redis.incr(redisKey);
    if (current === 1) await redis.expire(redisKey, windowSec);
    if (current > limit) return next(ApiError.tooManyRequests());
    next();
  };

// ═══════════════════════════════════════════════════════════
//  6. requestLogger
// ═══════════════════════════════════════════════════════════

export const requestLogger = (
  req:  Request,
  res:  Response,
  next: NextFunction,
): void => {
  req.requestId = uuidv4();
  const start   = Date.now();

  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error'
                : res.statusCode >= 400 ? 'warn'
                : 'info';
    logger[level]({
      requestId: req.requestId,
      method:    req.method,
      url:       req.originalUrl,
      status:    res.statusCode,
      ms,
      userId:    req.user?.id,
      ip:        req.ip,
    });
  });

  next();
};

// ═══════════════════════════════════════════════════════════
//  7. errorHandler — Gestionnaire d'erreurs centralisé
// ═══════════════════════════════════════════════════════════

export const errorHandler = (
  err:  unknown,
  req:  Request,
  res:  Response,
  _next:NextFunction,
): void => {
  // ApiError (erreurs métier)
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success:   false,
      code:      err.code,
      message:   err.message,
      details:   err.details ?? [],
      requestId: req.requestId,
    });
    return;
  }

  // ZodError (validation)
  if (err instanceof ZodError) {
    res.status(422).json({
      success:   false,
      code:      'VALIDATION_ERROR',
      message:   'Données invalides',
      details:   err.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
      requestId: req.requestId,
    });
    return;
  }

  // Contrainte unique PostgreSQL
  if ((err as any)?.code === '23505') {
    res.status(409).json({
      success:   false,
      code:      'CONFLICT',
      message:   'Cette ressource existe déjà',
      requestId: req.requestId,
    });
    return;
  }

  // Erreur inconnue
  logger.error({
    requestId: req.requestId,
    error:     err instanceof Error ? err.message : String(err),
    stack:     err instanceof Error ? err.stack : undefined,
  });

  res.status(500).json({
    success:   false,
    code:      'INTERNAL_ERROR',
    message:   env.NODE_ENV === 'production'
      ? 'Erreur interne du serveur'
      : (err instanceof Error ? err.message : String(err)),
    requestId: req.requestId,
  });
};

// ═══════════════════════════════════════════════════════════
//  8. notFoundHandler
// ═══════════════════════════════════════════════════════════

export const notFoundHandler = (
  req:  Request,
  _res: Response,
  next: NextFunction,
): void => {
  next(ApiError.notFound(`Route ${req.method} ${req.path}`));
};

// ═══════════════════════════════════════════════════════════
//  9. validateUUID — Validation des paramètres UUID dans l'URL
// ═══════════════════════════════════════════════════════════

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Middleware qui valide que tous les paramètres :id/:*Id sont des UUID valides.
 * Prévient les injections via les paramètres d'URL et les erreurs DB.
 */
export const validateParams = (...paramNames: string[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    for (const param of paramNames) {
      const val = req.params[param];
      if (val !== undefined && !UUID_REGEX.test(val)) {
        return next(ApiError.badRequest(`Paramètre invalide : ${param} doit être un UUID`));
      }
    }
    next();
  };
