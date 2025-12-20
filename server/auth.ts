import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import { getHiveBalance } from "./solana";
import { getHivePrice } from "./jupiter";
import { storage } from "./storage";

const CREATOR_PUBLIC_KEY = process.env.CREATOR_PUBLIC_KEY || "";
const PUBLIC_APP_DOMAIN = process.env.PUBLIC_APP_DOMAIN || process.env.REPL_SLUG ? `${process.env.REPL_SLUG}.${process.env.REPL_OWNER?.toLowerCase()}.repl.co` : "localhost";

const MIN_HIVE_ACCESS = parseFloat(process.env.MIN_HIVE_ACCESS || "50");
const MIN_USD_ACCESS = parseFloat(process.env.MIN_USD_ACCESS || "1");

const NONCE_TTL_MS = 10 * 60 * 1000;
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
  return crypto.randomBytes(32).toString("hex");
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

export async function issueNonce(walletAddress: string): Promise<{
  nonce: string;
  message: string;
  expiresAt: Date;
}> {
  if (!walletAddress || walletAddress.length < 32) {
    throw new Error("Invalid wallet address");
  }

  const nonce = generateSecureNonce();
  const issuedAt = new Date();
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS);
  const message = createNonceMessage(PUBLIC_APP_DOMAIN, walletAddress, nonce, issuedAt);

  await storage.createNonce(walletAddress, nonce, message, expiresAt);

  return { nonce, message, expiresAt };
}

export async function consumeNonce(walletAddress: string, nonce: string): Promise<{
  valid: boolean;
  message?: string;
  error?: string;
}> {
  const nonceRecord = await storage.consumeNonceAtomic(walletAddress, nonce);

  if (!nonceRecord) {
    return { valid: false, error: "Invalid, expired, or already used nonce" };
  }

  return { valid: true, message: nonceRecord.message };
}

export async function verifySignature(
  publicKey: string,
  signature: string,
  message: string
): Promise<boolean> {
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
