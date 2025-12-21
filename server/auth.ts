import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import { getHiveBalance } from "./solana";
import { getHivePrice } from "./jupiter";
import { storage } from "./storage";
import { env } from "./env";

const CREATOR_PUBLIC_KEY = env.CREATOR_PUBLIC_KEY || "";
const PUBLIC_APP_DOMAIN = env.PUBLIC_APP_DOMAIN || (env.REPL_SLUG ? `${env.REPL_SLUG}.${env.REPL_OWNER?.toLowerCase()}.repl.co` : "localhost");

const MIN_HIVE_ACCESS = env.MIN_HIVE_ACCESS;
const MIN_USD_ACCESS = env.MIN_USD_ACCESS;

const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes (hardened from 10)
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface AccessCache {
  hasAccess: boolean;
  hiveAmount: number;
  requiredHiveAmount: number;
  hiveUsd: number | null;
  priceUsd: number | null;
  priceMissing: boolean;
  timestamp: number;
}

const accessCache = new Map<string, AccessCache>();
const ACCESS_CACHE_TTL = 60 * 1000;

export function generateSecureNonce(): string {
  // Generate cryptographically strong nonce (32 bytes = 256 bits)
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Hash nonce with IP salt for secure storage
 * Returns sha256(nonce + IP_HASH_SALT)
 */
export function hashNonce(nonce: string): string {
  const salt = env.IP_HASH_SALT || "hivemind-dev-fallback";
  return crypto.createHash("sha256").update(nonce + salt).digest("hex");
}

/**
 * Hash IP address for tracking (same as logger)
 */
export function hashIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  const salt = env.IP_HASH_SALT || "hivemind-dev-fallback";
  return crypto.createHash("sha256").update(ip + salt).digest("hex").slice(0, 16);
}

/**
 * Hash user agent for tracking
 */
export function hashUserAgent(userAgent: string | undefined): string | undefined {
  if (!userAgent) return undefined;
  return crypto.createHash("sha256").update(userAgent).digest("hex").slice(0, 16);
}

export function generateSessionToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

export function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createNonceMessage(domain: string, wallet: string, nonce: string, issuedAt: Date): string {
  return `HiveMind Login
Domain: ${domain}
Wallet: ${wallet}
Nonce: ${nonce}
Issued At: ${issuedAt.toISOString()}`;
}

export async function issueNonce(
  walletAddress: string,
  req?: { headers: Record<string, string | string[] | undefined>; socket: { remoteAddress?: string } }
): Promise<{
  nonce: string;
  message: string;
  expiresAt: Date;
}> {
  if (!walletAddress || walletAddress.length < 32) {
    throw new Error("Invalid wallet address");
  }

  // Generate cryptographically strong nonce (32 bytes = 256 bits)
  const nonce = generateSecureNonce();
  const nonceHash = hashNonce(nonce);
  const issuedAt = new Date();
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS);
  const message = createNonceMessage(PUBLIC_APP_DOMAIN, walletAddress, nonce, issuedAt);

  // Extract IP and user agent for tracking
  let ip: string | undefined;
  if (req) {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string") {
      ip = forwarded.split(",")[0].trim();
    } else {
      ip = req.socket.remoteAddress;
    }
  }
  const ipHash = hashIp(ip);
  const userAgentHash = hashUserAgent(req?.headers["user-agent"] as string | undefined);

  // Invalidate any existing unexpired nonces for this wallet (prevent multiple active nonces)
  await storage.invalidateWalletNonces(walletAddress);

  // Store hashed nonce with metadata
  await storage.createNonce(walletAddress, nonceHash, message, expiresAt, ipHash, userAgentHash);

  return { nonce, message, expiresAt };
}

export async function consumeNonce(
  walletAddress: string,
  nonce: string,
  req?: { headers: Record<string, string | string[] | undefined>; socket: { remoteAddress?: string } }
): Promise<{
  valid: boolean;
  message?: string;
  error?: string;
}> {
  // Hash the incoming nonce to compare with stored hash
  const nonceHash = hashNonce(nonce);

  // Extract IP for comparison (soft check - mobile networks may change IP)
  let ip: string | undefined;
  if (req) {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string") {
      ip = forwarded.split(",")[0].trim();
    } else {
      ip = req.socket.remoteAddress;
    }
  }
  const ipHash = hashIp(ip);

  // Atomically consume nonce (marks as used if valid)
  const nonceRecord = await storage.consumeNonceAtomic(walletAddress, nonceHash, ipHash);

  if (!nonceRecord) {
    return {
      valid: false,
      error: "invalid_nonce",
    };
  }

  // Soft check: compare IP hash if both are present (don't fail if IP changed due to mobile network)
  if (nonceRecord.ipHash && ipHash && nonceRecord.ipHash !== ipHash) {
    // Log warning but don't fail - mobile networks can change IP
    console.warn(`[Auth] IP hash mismatch for nonce ${nonceRecord.id}, but allowing (mobile network?)`);
  }

  return { valid: true, message: nonceRecord.message };
}

export async function verifySignature(
  publicKey: string,
  signature: string,
  message: string
): Promise<boolean> {
  // TEST MODE: Allow signature verification to pass in test environment
  // This is guarded by NODE_ENV check to prevent use in production
  if (process.env.NODE_ENV === "test" && process.env.TEST_MODE === "true") {
    return true; // Always pass in test mode
  }

  try {
    const pubKey = new PublicKey(publicKey);
    const sigBytes = Uint8Array.from(Buffer.from(signature, "base64"));
    const msgBytes = new TextEncoder().encode(message);

    return nacl.sign.detached.verify(msgBytes, sigBytes, pubKey.toBytes());
  } catch (error) {
    console.error("Signature verification error:", error);
    return false;
  }
}

export async function createSession(walletAddress: string): Promise<{
  sessionToken: string;
  expiresAt: Date;
}> {
  const sessionToken = generateSessionToken();
  const sessionTokenHash = hashSessionToken(sessionToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await storage.createSession(walletAddress, sessionTokenHash, expiresAt);

  return { sessionToken, expiresAt };
}

export async function validateSession(sessionToken: string): Promise<{
  valid: boolean;
  walletAddress?: string;
  sessionId?: string;
}> {
  if (!sessionToken) {
    return { valid: false };
  }

  const sessionTokenHash = hashSessionToken(sessionToken);
  const session = await storage.getSessionByTokenHash(sessionTokenHash);

  if (!session) {
    return { valid: false };
  }

  if (new Date() > session.expiresAt) {
    return { valid: false };
  }

  if (session.revokedAt) {
    return { valid: false };
  }

  return {
    valid: true,
    walletAddress: session.walletAddress,
    sessionId: session.id,
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const sessionToken = req.cookies?.sid;

  if (!sessionToken) {
    res.status(401).json({ error: "Unauthorized", code: "NO_SESSION" });
    return;
  }

  validateSession(sessionToken)
    .then((result) => {
      if (!result.valid || !result.walletAddress) {
        res.status(401).json({ error: "Invalid or expired session", code: "INVALID_SESSION" });
        return;
      }

      (req as any).walletAddress = result.walletAddress;
      (req as any).sessionId = result.sessionId;
      (req as any).publicKey = result.walletAddress;
      next();
    })
    .catch((error) => {
      console.error("Session validation error:", error);
      res.status(500).json({ error: "Session validation failed" });
    });
}

export async function checkHiveAccess(publicKey: string): Promise<{
  hasAccess: boolean;
  hiveAmount: number;
  requiredHiveAmount: number;
  hiveUsd: number | null;
  priceUsd: number | null;
  priceMissing: boolean;
}> {
  const cached = accessCache.get(publicKey);
  if (cached && Date.now() - cached.timestamp < ACCESS_CACHE_TTL) {
    return {
      hasAccess: cached.hasAccess,
      hiveAmount: cached.hiveAmount,
      requiredHiveAmount: cached.requiredHiveAmount,
      hiveUsd: cached.hiveUsd,
      priceUsd: cached.priceUsd,
      priceMissing: cached.priceMissing,
    };
  }

  const [hiveAmount, priceUsd] = await Promise.all([
    getHiveBalance(publicKey),
    getHivePrice(),
  ]);

  const priceMissing = priceUsd === null;
  const hiveUsd = priceUsd !== null ? hiveAmount * priceUsd : null;

  const hasAccess = hiveAmount >= MIN_HIVE_ACCESS;

  const result = {
    hasAccess,
    hiveAmount,
    requiredHiveAmount: MIN_HIVE_ACCESS,
    hiveUsd,
    priceUsd,
    priceMissing,
  };

  accessCache.set(publicKey, {
    ...result,
    timestamp: Date.now(),
  });

  return result;
}

export async function requireHiveAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const publicKey = (req as any).walletAddress || (req as any).publicKey;
  if (!publicKey) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const access = await checkHiveAccess(publicKey);
  if (!access.hasAccess) {
    res.status(403).json({ error: "HIVE_REQUIRED", requiredAmount: access.requiredHiveAmount, currentAmount: access.hiveAmount });
    return;
  }

  (req as any).hiveAccess = access;
  next();
}

export function isCreator(publicKey: string): boolean {
  if (!CREATOR_PUBLIC_KEY) {
    console.warn("CREATOR_PUBLIC_KEY not set - creator access disabled");
    return false;
  }
  return publicKey === CREATOR_PUBLIC_KEY;
}

export function requireCreator(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const publicKey = (req as any).walletAddress || (req as any).publicKey;
  
  if (!publicKey) {
    res.status(401).json({ error: "Unauthorized - wallet authentication required", code: "NO_WALLET" });
    return;
  }

  if (!isCreator(publicKey)) {
    res.status(403).json({ 
      error: "CREATOR_ONLY",
      message: "This action is restricted to the HiveMind creator only"
    });
    return;
  }

  next();
}

export async function revokeSession(sessionId: string): Promise<void> {
  await storage.revokeSession(sessionId);
}

export async function revokeAllSessions(walletAddress: string): Promise<void> {
  await storage.revokeAllUserSessions(walletAddress);
}

export function getPublicAppDomain(): string {
  return PUBLIC_APP_DOMAIN;
}
