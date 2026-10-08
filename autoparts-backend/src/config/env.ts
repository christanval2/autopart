import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  // App
  NODE_ENV:           z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT:               z.coerce.number().default(3000),
  API_VERSION:        z.string().default('v1'),
  APP_URL:            z.string().url().default('http://localhost:3000'),
  ALLOWED_ORIGINS:    z.string().default('http://localhost:5173'),

  // Database
  DATABASE_URL:       z.string().url(),
  DB_POOL_MIN:        z.coerce.number().default(2),
  DB_POOL_MAX:        z.coerce.number().default(20),
  DB_LOGGING:         z.coerce.boolean().default(false),

  // Redis
  REDIS_URL:          z.string().url().default('redis://localhost:6379'),
  REDIS_TTL_DEFAULT:  z.coerce.number().default(300),     // 5 min

  // JWT
  JWT_ACCESS_SECRET:  z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL:     z.string().default('15m'),
  JWT_REFRESH_TTL:    z.string().default('30d'),

  // Crypto
  BCRYPT_ROUNDS:      z.coerce.number().default(12),
  ENCRYPTION_KEY:     z.string().length(32),              // AES-256

  // Storage (S3-compatible)
  S3_ENDPOINT:        z.string().url().optional(),
  S3_BUCKET:          z.string().optional(),
  S3_ACCESS_KEY:      z.string().optional(),
  S3_SECRET_KEY:      z.string().optional(),
  S3_REGION:          z.string().default('eu-west-3'),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY:    z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // LiveKit Voice Order
  LIVEKIT_API_KEY:     z.string().optional(),
  LIVEKIT_API_SECRET:  z.string().optional(),
  LIVEKIT_URL:         z.string().url().optional(),
  VOICE_AGENT_URL:     z.string().url().optional(),
  VOICE_AGENT_SECRET:  z.string().optional(),

  // Email
  SMTP_HOST:          z.string().optional(),
  SMTP_PORT:          z.coerce.number().default(587),
  SMTP_USER:          z.string().optional(),
  SMTP_PASS:          z.string().optional(),
  EMAIL_FROM:         z.string().email().default('no-reply@autoparts.cm'),

  // Mobile Money (MTN MoMo / Orange Money)
  MOMO_API_URL:       z.string().url().optional(),
  MOMO_API_KEY:       z.string().optional(),
  MOMO_SUBSCRIPTION_KEY: z.string().optional(),
  ORANGE_API_URL:     z.string().url().optional(),
  ORANGE_API_TOKEN:   z.string().optional(),

  // Coordonnées bancaires pour les paiements par virement
  BANK_NAME:          z.string().optional(),
  BANK_RIB:           z.string().optional(),

  // F6.3 — API vision pour la recherche par image (OpenAI-compatible)
  VISION_API_URL:     z.string().url().optional(),
  VISION_API_KEY:     z.string().optional(),
  VISION_MODEL:       z.string().optional(),


  // Groq AI Chatbot
  GROQ_API_KEY:        z.string().optional(),
  GROQ_MODEL:          z.string().default('llama-3.3-70b-versatile'),

  // CinetPay — agrégateur MoMo/Orange/carte (api-checkout.cinetpay.com)
  CINETPAY_API_KEY:    z.string().optional(),
  CINETPAY_SITE_ID:    z.string().optional(),

  // Services tiers (clés fournies — intégration à venir)
  GEOAPIFY_API_KEY:    z.string().optional(), // géocodage vendeurs + autocomplete
  OCR_API_KEY:         z.string().optional(), // lecture étiquettes/factures (V3)
  CAR_API_KEY:         z.string().optional(), // décodage VIN (api.carapi.dev/v1)

  // SMS Africa's Talking (notif-3)
  SMS_API_KEY:        z.string().optional(),
  SMS_USERNAME:       z.string().optional(),

  // OAuth Social (auth-7 V3)
  GOOGLE_CLIENT_ID:   z.string().optional(),
  GOOGLE_SECRET:      z.string().optional(),
  FACEBOOK_APP_ID:    z.string().optional(),
  FACEBOOK_APP_SECRET:z.string().optional(),

  // Anti-fraude (cpl-3)
  FRAUD_SCORE_THRESHOLD: z.coerce.number().int().min(0).max(100).default(60),

  // Monitoring
  SENTRY_DSN:         z.string().url().optional(),
  LOG_LEVEL:          z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

// Fail-fast : une intégration à moitié configurée doit planter au démarrage
// plutôt qu'échouer silencieusement à l'exécution.
const withCoupledConfig = envSchema.superRefine((data, ctx) => {
  const requirePair = (key: keyof typeof data, sibling: keyof typeof data) => {
    if (data[sibling] && !data[key]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `${key} doit être défini car ${sibling} est configuré`,
      });
    }
  };
  requirePair('GOOGLE_SECRET', 'GOOGLE_CLIENT_ID');
  requirePair('GOOGLE_CLIENT_ID', 'GOOGLE_SECRET');
  requirePair('CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY');
  requirePair('CLOUDINARY_API_KEY', 'CLOUDINARY_CLOUD_NAME');
  requirePair('CLOUDINARY_API_SECRET', 'CLOUDINARY_API_KEY');
  requirePair('LIVEKIT_API_SECRET', 'LIVEKIT_API_KEY');
  requirePair('SMTP_PASS', 'SMTP_USER');
});

const parsed = withCoupledConfig.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Variables d\'environnement invalides:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const env = Object.freeze(parsed.data);
