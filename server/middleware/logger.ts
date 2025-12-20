import pino from "pino";
import pinoHttp from "pino-http";
import { Request, Response } from "express";
import { createHash } from "crypto";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: "hivemind",
    env: process.env.NODE_ENV || "development",
  },
});

export function hashIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  return createHash("sha256").update(ip + (process.env.IP_HASH_SALT || "hivemind")).digest("hex").slice(0, 16);
}

function getClientIp(req: Request): string | undefined {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress;
}

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req: Request) => req.requestId,
  customProps: (req: Request, res: Response) => {
    const walletAddress = (req as any).walletAddress;
    return {
      requestId: req.requestId,
      walletAddress: walletAddress || undefined,
      ipHash: hashIp(getClientIp(req)),
    };
  },
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  customSuccessMessage: (req: Request, res: Response) => {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
  customErrorMessage: (req: Request, res: Response, err: Error) => {
    return `${req.method} ${req.url} ${res.statusCode} - ${err.message}`;
  },
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      requestId: req.requestId,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
});

export function getIpHash(req: Request): string | undefined {
  return hashIp(getClientIp(req));
}
