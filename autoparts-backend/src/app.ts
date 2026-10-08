import 'reflect-metadata';
import express             from 'express';
import helmet              from 'helmet';
import cors                from 'cors';
import compression         from 'compression';
import * as path           from 'path';
import { env }             from './config/env';
import {
  globalRateLimiter, requestLogger, errorHandler,
  notFoundHandler, jsonSanitizer,
} from './middlewares';

// ── Modules MVP ───────────────────────────────────────────────
import { authRouter }           from './modules/auth';
import { usersRouter }          from './modules/users';
import { orgsRouter }           from './modules/organizations';
import { productsRouter }       from './modules/products';
import { catalogsRouter }       from './modules/catalogs';
import { catalogRouter }        from './modules/catalog';
import { ordersRouter }         from './modules/orders';
import { paymentsRouter }       from './modules/payments';
import { stockRouter }          from './modules/stock';
import { searchRouter }         from './modules/search';
import { categoriesRouter }     from './modules/categories';
import { brandsRouter }         from './modules/brands';
import { cartRouter }           from './modules/cart';
import { shippingRouter }       from './modules/shipping';
import { notificationsRouter }  from './modules/notifications';
import { pushRouter }           from './modules/push-notifications';
import { addressesRouter }      from './modules/addresses';
import { reviewsRouter }        from './modules/reviews';
import { shipmentsRouter }      from './modules/shipments';

// ── Modules V2 ────────────────────────────────────────────────
import { twofaRouter }           from './modules/twofa';
import { quotesRouter }          from './modules/quotes';
import { promotionsRouter }      from './modules/promotions';
import { bundlesRouter }         from './modules/bundles';
import { returnsRouter }         from './modules/returns';
import { disputesRouter }        from './modules/disputes';
import { commissionsRouter }     from './modules/commissions';
import { pickingRouter }         from './modules/picking';
import { stockAuditRouter }      from './modules/stock-audit';
import { purchaseOrdersRouter }  from './modules/purchase-orders';
import { wishlistRouter }        from './modules/wishlist';
import { messagingRouter }       from './modules/messaging';
import { loyaltyRouter }         from './modules/loyalty';
import { qaRouter }              from './modules/qa';
import { newsletterRouter }      from './modules/newsletter';
import { recurringOrdersRouter } from './modules/orders/recurring';

// ── Modules V3 ────────────────────────────────────────────────
import { walletRouter }          from './modules/wallet';
import { geoRouter }             from './modules/geo';
import { ocrRouter }             from './modules/ocr';
import { vinRouter }             from './modules/vin';
import { analyticsRouter }       from './modules/analytics';
import { priceContractsRouter }  from './modules/price-contracts';
import { chatbotRouter }          from './modules/chatbot';
import { recommendationsRouter } from './modules/recommendations';


// ── Nouvelles fonctionnalités (phase 2) ─────────────────────
import { i18nMiddleware }          from './i18n';
import { initSentry, Sentry }      from './config/sentry';
import { invoicesRouter }          from './modules/invoices';
import { uploadsRouter }           from './modules/uploads';
import { exportsRouter }           from './modules/exports';
import { auditRouter }             from './modules/audit';
import { voiceOrderRouter } from './modules/voice-order';
import { legalRouter }             from './modules/legal';
import { adminRouter }             from './modules/admin';

// Sentry init
initSentry();

const app = express();

// ── Sécurité headers ─────────────────────────────────────────
// CORP `cross-origin` : les images /uploads sont consommées par le
// storefront (autre port/origine en dev) — Helmet met `same-origin`
// par défaut, ce qui fait échouer le rendu <img> cross-origin.
app.use(helmet({
  contentSecurityPolicy: env.NODE_ENV === 'production',
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({
  origin:      env.ALLOWED_ORIGINS.split(',').map(o => o.trim()),
  credentials: true,
  methods:     ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
}));

// ── Body + Compression ────────────────────────────────────────
app.use(compression());
app.use(i18nMiddleware);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Middleware globaux ────────────────────────────────────────
app.use(jsonSanitizer);
app.use(requestLogger);
app.use(globalRateLimiter);

// ── Health check ──────────────────────────────────────────────
app.get('/health', (_req, res) =>
  res.json({ status: 'ok', env: env.NODE_ENV, uptime: Math.floor(process.uptime()), ts: new Date().toISOString() }),
);

// ── Fichiers uploadés (stockage local de repli) ───────────────
app.use('/uploads', express.static(path.resolve('uploads'), { maxAge: '7d', immutable: true }));

// ── Routes API v1 ─────────────────────────────────────────────
const v1 = `/api/${env.API_VERSION}`;

// MVP
app.use(`${v1}/auth`,               authRouter);
app.use(`${v1}/auth/2fa`,           twofaRouter);
app.use(`${v1}/users`,              usersRouter);
app.use(`${v1}/organizations`,      orgsRouter);
app.use(`${v1}/products`,           productsRouter);
app.use(`${v1}/catalogs`,           catalogsRouter);
app.use(`${v1}/catalog`,            catalogRouter);
// ⚠️ recurring DOIT être monté avant /orders : sinon GET /orders/:id
// capturerait /orders/recurring et jeterait « invalid input syntax for uuid »
app.use(`${v1}/orders/recurring`,   recurringOrdersRouter);
app.use(`${v1}/orders`,             ordersRouter);
app.use(`${v1}/payments`,           paymentsRouter);
app.use(`${v1}/stock`,              stockRouter);
app.use(`${v1}/search`,             searchRouter);
app.use(`${v1}/categories`,         categoriesRouter);
app.use(`${v1}/brands`,             brandsRouter);
app.use(`${v1}/cart`,               cartRouter);
app.use(`${v1}/shipping`,           shippingRouter);
app.use(`${v1}/notifications`,      notificationsRouter);
app.use(`${v1}/notifications`,      pushRouter);
app.use(`${v1}/addresses`,          addressesRouter);
app.use(`${v1}/reviews`,            reviewsRouter);
app.use(`${v1}/shipments`,          shipmentsRouter);

// V2
app.use(`${v1}/quotes`,             quotesRouter);
app.use(`${v1}/promotions`,         promotionsRouter);
app.use(`${v1}/bundles`,            bundlesRouter);
app.use(`${v1}/returns`,            returnsRouter);
app.use(`${v1}/disputes`,           disputesRouter);
app.use(`${v1}/commissions`,        commissionsRouter);
app.use(`${v1}/picking`,            pickingRouter);
app.use(`${v1}/stock-audits`,       stockAuditRouter);
app.use(`${v1}/purchase-orders`,    purchaseOrdersRouter);
app.use(`${v1}/wishlist`,           wishlistRouter);
app.use(`${v1}/messages`,           messagingRouter);
app.use(`${v1}/loyalty`,            loyaltyRouter);
app.use(`${v1}/qa`,                 qaRouter);
app.use(`${v1}/newsletter`,         newsletterRouter);

// V3
app.use(`${v1}/wallet`,             walletRouter);
app.use(`${v1}/geo`,                geoRouter);
app.use(`${v1}/analytics`,          analyticsRouter);
app.use(`${v1}/price-contracts`,    priceContractsRouter);
app.use(`${v1}/recommendations`,    recommendationsRouter);

app.use(`${v1}/chatbot`,            chatbotRouter);


// ── Nouvelles routes (phase 2) ─────────────────────────────
app.use(`${v1}/invoices`,           invoicesRouter);
app.use(`${v1}/uploads`,            uploadsRouter);
app.use(`${v1}/exports`,            exportsRouter);
app.use(`${v1}/audit`,              auditRouter);
app.use(`${v1}/legal`,              legalRouter);
app.use(`${v1}/admin`,              adminRouter);
app.use(`${v1}/voice-order`,        voiceOrderRouter);

// ── Services tiers intégrés (clés .env : GEOAPIFY / OCR / CAR_API) ──
app.use(`${v1}/ocr`,                ocrRouter);
app.use(`${v1}/vin`,                vinRouter);

// ── Handlers finaux ───────────────────────────────────────────
if (process.env.SENTRY_DSN) app.use(Sentry.expressErrorHandler());
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
