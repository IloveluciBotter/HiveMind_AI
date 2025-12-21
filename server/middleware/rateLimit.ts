import rateLimit, { Options } from "express-rate-limit";
import { Request, Response } from "express";
import { logger } from "./logger";
import { isCreator } from "../auth";

const rateLimitResponse = (req: Request, res: Response) => {
  const retryAfter = res.getHeader("Retry-After");
  logger.warn({
    requestId: req.requestId,
    walletAddress: (req as any).walletAddress,
    path: req.path,
    message: "Rate limit exceeded",
  });
  res.status(429).json({
    ok: false,
    error: "rate_limited",
    message: "Too many requests, please slow down.",
  });
};

/**
 * Check if request is from admin/creator (server-side validated)
 * Returns multiplier for rate limit (5x for admins)
 */
function getAdminMultiplier(req: Request): number {
  const walletAddress = (req as any).walletAddress || (req as any).publicKey;
  if (walletAddress && isCreator(walletAddress)) {
    return 5; // 5x limit for creators/admins
  }
  return 1;
}

function getKeyGenerator(useWallet: boolean) {
  return (req: Request): string => {
    const walletAddress = (req as any).walletAddress;
    const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() || req.socket.remoteAddress || "unknown";
    if (useWallet && walletAddress) {
      return `wallet:${walletAddress}`;
    }
    return `ip:${ip}`;
  };
}

function createLimiter(options: Partial<Options> & { useWallet?: boolean; allowAdmin?: boolean }) {
  const { useWallet = false, allowAdmin = true, max, ...restOptions } = options;
  
  // Apply admin multiplier if enabled
  const baseMax = max || 100;
  const effectiveMax = allowAdmin 
    ? (req: Request) => {
        const multiplier = getAdminMultiplier(req);
        return typeof baseMax === "function" ? baseMax(req) * multiplier : baseMax * multiplier;
      }
    : baseMax;
  
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getKeyGenerator(useWallet),
    handler: rateLimitResponse,
    max: effectiveMax,
    ...restOptions,
  });
}

const getEnvLimit = (key: string, defaultVal: number): number => {
  const val = process.env[key];
  return val ? parseInt(val, 10) : defaultVal;
};

// Window: 15 minutes (900,000 ms)
const WINDOW_15MIN = 15 * 60 * 1000;

// ===== PRODUCTION RATE LIMITERS (15 minute windows) =====

// Default public routes (light browsing)
export const defaultLimiter = createLimiter({
  windowMs: WINDOW_15MIN,
  max: getEnvLimit("RATE_LIMIT_DEFAULT", 200),
  useWallet: false,
  allowAdmin: true,
});

// AI chat endpoints (expensive operations)
export const chatLimiter = createLimiter({
  windowMs: WINDOW_15MIN,
  max: getEnvLimit("RATE_LIMIT_CHAT", 30),
  useWallet: false, // Track by IP for chat
  allowAdmin: true,
});

// Training submission, review, corpus write endpoints
export const writeLimiter = createLimiter({
  windowMs: WINDOW_15MIN,
  max: getEnvLimit("RATE_LIMIT_WRITE", 20),
  useWallet: false, // Track by IP
  allowAdmin: true,
});

// Auth/wallet signature endpoints (brute force protection)
export const authLimiter = createLimiter({
  windowMs: WINDOW_15MIN,
  max: getEnvLimit("RATE_LIMIT_AUTH", 40),
  useWallet: false,
  allowAdmin: true,
});

// ===== LEGACY LIMITERS (kept for backward compatibility) =====
// These use 1 minute windows for specific endpoints that need tighter control

export const authNonceLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: getEnvLimit("RATE_LIMIT_AUTH_NONCE", 10),
  useWallet: false,
  allowAdmin: true,
});

export const authVerifyLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: getEnvLimit("RATE_LIMIT_AUTH_VERIFY", 10),
  useWallet: false,
  allowAdmin: true,
});

export const publicReadLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: getEnvLimit("RATE_LIMIT_PUBLIC_READ", 60),
  useWallet: false,
  allowAdmin: true,
});

export const chatLimiterWallet = createLimiter({
  windowMs: 60 * 1000,
  max: getEnvLimit("RATE_LIMIT_CHAT_WALLET", 30),
  useWallet: true,
  allowAdmin: true,
});

export const chatLimiterIp = createLimiter({
  windowMs: 60 * 1000,
  max: getEnvLimit("RATE_LIMIT_CHAT_IP", 60),
  useWallet: false,
  allowAdmin: true,
});

export const submitLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: getEnvLimit("RATE_LIMIT_SUBMIT", 60),
  useWallet: true,
  allowAdmin: true,
});

export const corpusLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: getEnvLimit("RATE_LIMIT_CORPUS", 20),
  useWallet: true,
  allowAdmin: true,
});

export const reviewLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: getEnvLimit("RATE_LIMIT_REVIEW", 20),
  useWallet: true,
  allowAdmin: true,
});
