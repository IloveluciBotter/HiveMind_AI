import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { createServer, type Server } from "http";
import { requestIdMiddleware } from "./middleware/requestId";
import { httpLogger, logger } from "./middleware/logger";
import { initSentry, sentryErrorHandler, captureError } from "./sentry";
import { env } from "./env";

export function log(message: string, source = "express") {
  logger.info({ source, message });
}

/**
 * Create Express app without starting server
 * Used for testing and can be used for programmatic server creation
 */
export async function createApp(): Promise<{ app: express.Application; httpServer: Server }> {
  const app = express();
  const httpServer = createServer(app);

  // Trust proxy for accurate IP detection behind load balancers (Replit, Render, etc.)
  app.set("trust proxy", true);

  // CORS configuration
  const allowedOrigins = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
    : env.PUBLIC_APP_DOMAIN
      ? [`https://${env.PUBLIC_APP_DOMAIN}`, `http://${env.PUBLIC_APP_DOMAIN}`]
      : [];

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, Postman, etc.) in development
        if (!origin && env.NODE_ENV === "development") {
          return callback(null, true);
        }
        // Allow requests from allowed origins
        if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
    })
  );

  app.use(requestIdMiddleware);
  app.use(httpLogger);

  // JSON body parser with 1MB size limit for abuse protection
  app.use(
    express.json({
      limit: "1mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  // Register routes
  const { registerRoutes } = await import("./routes");
  await registerRoutes(httpServer, app);

  // Only start background workers if not in test mode
  if (env.NODE_ENV !== "test") {
    const { startTelemetryJobs } = await import("./services/telemetryJobs");
    const { startEmbedWorker } = await import("./services/embedWorker");
    const { startJobWorker } = await import("./services/jobWorker");
    
    startTelemetryJobs();
    startEmbedWorker(); // Legacy embed worker (kept for backward compatibility)
    startJobWorker(); // New job queue worker
  }

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

  // Skip Vite setup in test mode
  if (env.NODE_ENV !== "test") {
    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (env.NODE_ENV === "production") {
      const { serveStatic } = await import("./static");
      serveStatic(app);
    } else {
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
    }
  }

  return { app, httpServer };
}

