import * as Sentry from "@sentry/react";

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;

export function initSentry() {
  if (!SENTRY_DSN) {
    console.log("[Sentry] No VITE_SENTRY_DSN configured, error tracking disabled");
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE || "development",
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });

  console.log(`[Sentry] Initialized for environment: ${import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE}`);
}

export function captureError(error: Error, context?: Record<string, any>) {
  if (!SENTRY_DSN) {
    console.error("[Sentry disabled]", error);
    return;
  }
  
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

export function setUser(walletAddress: string | null) {
  if (!SENTRY_DSN) return;
  
  if (walletAddress) {
    Sentry.setUser({ id: walletAddress });
  } else {
    Sentry.setUser(null);
  }
}

export { Sentry };
