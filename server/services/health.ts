import { db } from "../db";
import { sql } from "drizzle-orm";
import { checkOllamaHealth } from "../aiChat";
import { execSync } from "child_process";

const startTime = Date.now();

interface ServiceStatus {
  status: "ok" | "down";
  latencyMs?: number;
  error?: string;
  baseUrl?: string;
}

interface HealthResponse {
  status: "ok" | "degraded" | "down";
  timestamp: string;
  version: string;
  uptimeSec: number;
  services: {
    db: ServiceStatus;
    ollama: ServiceStatus;
    rpc: ServiceStatus;
  };
}

function getVersion(): string {
  try {
    const sha = execSync("git rev-parse --short HEAD 2>/dev/null", { encoding: "utf8" }).trim();
    return sha || "1.0.0";
  } catch {
    return process.env.APP_VERSION || "1.0.0";
  }
}

async function checkDbHealth(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (error: any) {
    return { status: "down", latencyMs: Date.now() - start, error: error.message };
  }
}

async function checkRpcHealth(): Promise<ServiceStatus> {
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      return { status: "down", latencyMs: Date.now() - start, error: `HTTP ${response.status}` };
    }
    
    const data = await response.json();
    if (data.result === "ok") {
      return { status: "ok", latencyMs: Date.now() - start };
    }
    return { status: "down", latencyMs: Date.now() - start, error: data.error?.message };
  } catch (error: any) {
    return { 
      status: "down", 
      latencyMs: Date.now() - start, 
      error: error.name === "AbortError" ? "Timeout" : error.message 
    };
  }
}

async function checkOllamaHealthWithLatency(): Promise<ServiceStatus> {
  const start = Date.now();
  const health = await checkOllamaHealth();
  return {
    status: health.ok ? "ok" : "down",
    latencyMs: Date.now() - start,
    baseUrl: health.baseUrl,
    error: health.error,
  };
}

export async function getFullHealth(): Promise<HealthResponse> {
  const [dbStatus, ollamaStatus, rpcStatus] = await Promise.all([
    checkDbHealth(),
    checkOllamaHealthWithLatency(),
    checkRpcHealth(),
  ]);

  const services = { db: dbStatus, ollama: ollamaStatus, rpc: rpcStatus };
  
  let status: "ok" | "degraded" | "down" = "ok";
  if (dbStatus.status === "down") {
    status = "down";
  } else if (ollamaStatus.status === "down" || rpcStatus.status === "down") {
    status = "degraded";
  }

  return {
    status,
    timestamp: new Date().toISOString(),
    version: getVersion(),
    uptimeSec: Math.floor((Date.now() - startTime) / 1000),
    services,
  };
}

export async function isReady(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    const requiredEnvVars = ["DATABASE_URL"];
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function isLive(): boolean {
  return true;
}

export function isAiFallbackAllowed(): boolean {
  if (process.env.ALLOW_AI_FALLBACK !== undefined) {
    return process.env.ALLOW_AI_FALLBACK === "true";
  }
  return process.env.NODE_ENV !== "production";
}
