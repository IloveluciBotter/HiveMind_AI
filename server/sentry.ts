import * as Sentry from "@sentry/node";

const SENTRY_DSN = process.env.SENTRY_DSN;

export function initSentry() {
  if (!SENTRY_DSN) {
    console.log("[Sentry] No SENTRY_DSN configured, error tracking disabled");
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
    tracesSampleRate: 0.1,
    integrations: [
      Sentry.httpIntegration(),
      Sentry.expressIntegration(),
    ],
    beforeSend(event, hint) {
      if (hint.originalException instanceof Error) {
        event.fingerprint = [hint.originalException.message];
      }
      return event;
    },
  });

  console.log(`[Sentry] Initialized for environment: ${process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV}`);
}

export function captureError(error: Error, context?: Record<string, any>) {
  if (!SENTRY_DSN) return;
  
  Sentry.withScope((scope) => {
    if (context?.requestId) {
      scope.setTag("requestId", context.requestId);
    }
    if (context?.walletAddress) {
      scope.setUser({ id: context.walletAddress });
    }
    if (context?.extra) {
      scope.setExtras(context.extra);
    }
    Sentry.captureException(error);
  });
}

export function sentryErrorHandler() {
  return Sentry.expressErrorHandler();
}

export { Sentry };
