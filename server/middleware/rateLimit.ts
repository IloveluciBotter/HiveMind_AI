import rateLimit, { Options } from "express-rate-limit";
import { Request, Response } from "express";
import { logger } from "./logger";

const rateLimitResponse = (req: Request, res: Response) => {
  const retryAfter = res.getHeader("Retry-After");
  logger.warn({
    requestId: req.requestId,
    walletAddress: (req as any).walletAddress,
    path: req.path,
    message: "Rate limit exceeded",
  });
  res.status(429).json({
    error: "rate_limited",
    retryAfterSec: typeof retryAfter === "number" ? retryAfter : parseInt(retryAfter as string) || 60,
  });
};

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

function createLimiter(options: Partial<Options> & { useWallet?: boolean }) {
  const { useWallet = false, ...restOptions } = options;
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: getKeyGenerator(useWallet),
    handler: rateLimitResponse,
    ...restOptions,
  });
}

const getEnvLimit = (key: string, defaultVal: number): number => {
  const val = process.env[key];
  return val ? parseInt(val, 10) : defaultVal;
};

export const authNonceLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: getEnvLimit("RATE_LIMIT_AUTH_NONCE", 10),
  message: "Too many nonce requests",
  useWallet: false,
});

export const authVerifyLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: getEnvLimit("RATE_LIMIT_AUTH_VERIFY", 10),
  message: "Too many verification attempts",
  useWallet: false,
});

export const publicReadLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: getEnvLimit("RATE_LIMIT_PUBLIC_READ", 60),
  message: "Too many requests",
  useWallet: false,
});

export const chatLimiterWallet = createLimiter({
  windowMs: 60 * 1000,
  max: getEnvLimit("RATE_LIMIT_CHAT_WALLET", 30),
  message: "Too many chat requests",
  useWallet: true,
});

export const chatLimiterIp = createLimiter({
  windowMs: 60 * 1000,
  max: getEnvLimit("RATE_LIMIT_CHAT_IP", 60),
  message: "Too many chat requests from this IP",
  useWallet: false,
});

export const submitLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: getEnvLimit("RATE_LIMIT_SUBMIT", 60),
  message: "Too many submission requests",
  useWallet: true,
});

export const corpusLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: getEnvLimit("RATE_LIMIT_CORPUS", 20),
  message: "Too many corpus modification requests",
  useWallet: true,
});

export const reviewLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: getEnvLimit("RATE_LIMIT_REVIEW", 20),
  message: "Too many review requests",
  useWallet: true,
});
