import * as Sentry from '@sentry/node';
import { env }     from './env';

export function initSentry(): void {
  if (!env.SENTRY_DSN) return;
  Sentry.init({
    dsn:              env.SENTRY_DSN,
    environment:      env.NODE_ENV,
    integrations:     [Sentry.requestDataIntegration()],
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0,
    beforeSend: (event) => {
      const status = (event.extra?.statusCode as number) ?? 500;
      return status < 500 ? null : event;
    },
  });
}

export { Sentry };
