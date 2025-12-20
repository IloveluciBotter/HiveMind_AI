import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { requestIdMiddleware } from "./middleware/requestId";
import { httpLogger, logger } from "./middleware/logger";
import { initSentry, sentryErrorHandler, captureError } from "./sentry";
import { startTelemetryJobs } from "./services/telemetryJobs";
import { startEmbedWorker } from "./services/embedWorker";

initSentry();

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(requestIdMiddleware);
app.use(httpLogger);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

export function log(message: string, source = "express") {
  logger.info({ source, message });
}

(async () => {
  await registerRoutes(httpServer, app);
  
  startTelemetryJobs();
  startEmbedWorker();

  app.use(sentryErrorHandler());
  
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    logger.error({
      requestId: req.requestId,
      error: message,
      stack: err.stack,
      status,
    });

    captureError(err, {
      requestId: req.requestId,
      walletAddress: (req as any).walletAddress,
      extra: { path: req.path, method: req.method },
    });

    res.status(status).json({ error: message, requestId: req.requestId });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
  });
})();
