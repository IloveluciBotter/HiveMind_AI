import { z } from "zod";
import crypto from "crypto";

/**
 * Environment variable validation schema
 * All required variables must be set in production
 * Optional variables have safe defaults for development
 */
const envSchema = z.object({
  // Required in all environments
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  
  // Required in production, optional in development
  SESSION_SECRET: z.string().optional(),
  IP_HASH_SALT: z.string().optional(),
  
  // Port configuration
  PORT: z.string().regex(/^\d+$/).default("5000").transform(Number),
  
  // CORS configuration
  ALLOWED_ORIGINS: z.string().optional(), // Comma-separated list
  PUBLIC_APP_DOMAIN: z.string().optional(), // Fallback if ALLOWED_ORIGINS not set
  
  // Solana configuration - REQUIRED in production, no unsafe defaults
  HIVE_MINT: z.string().optional(), // Token mint address
  HIVE_VAULT_ADDRESS: z.string().optional(), // Vault address for deposits
  REWARDS_WALLET_ADDRESS: z.string().optional(), // Rewards distribution address
  SOLANA_RPC_URL: z.string().url().optional(), // Solana RPC endpoint
  HELIUS_API_KEY: z.string().optional(), // Helius API key (if using Helius RPC)
  
  // Economy configuration
  ECON_BASE_FEE_HIVE: z.string().default("1").transform(Number),
  ECON_PASS_THRESHOLD: z.string().default("0.70").transform(Number),
  ECON_MIN_PARTIAL_COST_PCT: z.string().default("0.05").transform(Number),
  
  // Token gating
  MIN_HIVE_ACCESS: z.string().default("50").transform(Number),
  MIN_USD_ACCESS: z.string().default("1").transform(Number),
  
  // Creator/Admin
  CREATOR_PUBLIC_KEY: z.string().optional(),
  
  // AI Services
  LMSTUDIO_BASE_URL: z.string().url().optional(),
  LMSTUDIO_MODEL: z.string().optional(),
  OLLAMA_BASE_URL: z.string().url().optional(),
  OLLAMA_EMBED_MODEL: z.string().optional(),
  OLLAMA_API_KEY: z.string().optional(),
  ALLOW_AI_FALLBACK: z
    .string()
    .default("false")
    .transform((v) => v.toLowerCase() === "true"),
  
  // Auto-review configuration
  AUTO_REVIEW_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v.toLowerCase() === "true"),
  AUTO_REVIEW_MODE: z.enum(["off", "auto", "shadow"]).default("auto"),
  AUTO_REVIEW_MIN_DURATION_SEC: z.string().default("30").transform(Number),
  AUTO_REVIEW_APPROVE_THRESHOLD: z.string().default("1.0").transform(Number),
  AUTO_REVIEW_REJECT_THRESHOLD: z.string().default("0.40").transform(Number),
  
  // Job queue
  JOB_WORKER_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v.toLowerCase() === "true"),
  JOB_WORKER_POLL_MS: z.string().default("2000").transform(Number),
  JOB_WORKER_INSTANCE_ID: z.string().optional(),
  
  // Telemetry
  ANSWER_EVENTS_RETENTION_DAYS: z.string().default("60").transform(Number),
  
  // Model versioning
  MODEL_MIN_QA_ACCURACY: z.string().optional().transform((v) => (v ? Number(v) : undefined)),
  MODEL_MAX_LATENCY_MS: z.string().optional().transform((v) => (v ? Number(v) : undefined)),
  MODEL_AUTO_ROLLBACK_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v.toLowerCase() === "true"),
  
  // RAG Guard
  RAG_GUARD_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v.toLowerCase() === "true"),
  RAG_GUARD_MODE: z.enum(["drop", "wrap"]).default("drop"),
  
  // Sentry (optional)
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  
  // Logging
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  
  // Replit-specific (for compatibility)
  REPL_ID: z.string().optional(),
  REPL_SLUG: z.string().optional(),
  REPL_OWNER: z.string().optional(),
});

/**
 * Validated environment variables
 * Fails fast on startup if required variables are missing or invalid
 */
function validateEnv() {
  const isProduction = process.env.NODE_ENV === "production";
  
  // Parse and validate
  const result = envSchema.safeParse(process.env);
  
  if (!result.success) {
    const errors = result.error.errors.map((err) => `  - ${err.path.join(".")}: ${err.message}`).join("\n");
    console.error("❌ Environment variable validation failed:\n", errors);
    process.exit(1);
  }
  
  const env = result.data;
  
  // Production-specific validation
  if (isProduction) {
    const productionErrors: string[] = [];
    
    if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
      productionErrors.push(
        "SESSION_SECRET is required in production and must be at least 32 characters"
      );
    }
    
    if (!env.IP_HASH_SALT || env.IP_HASH_SALT.length < 16) {
      productionErrors.push(
        "IP_HASH_SALT is required in production and must be at least 16 characters"
      );
    }
    
    if (!env.HIVE_MINT) {
      productionErrors.push("HIVE_MINT is required in production (no unsafe defaults allowed)");
    }
    
    if (!env.HIVE_VAULT_ADDRESS) {
      productionErrors.push("HIVE_VAULT_ADDRESS is required in production");
    }
    
    if (!env.REWARDS_WALLET_ADDRESS) {
      productionErrors.push("REWARDS_WALLET_ADDRESS is required in production");
    }
    
    if (!env.ALLOWED_ORIGINS && !env.PUBLIC_APP_DOMAIN) {
      productionErrors.push(
        "Either ALLOWED_ORIGINS or PUBLIC_APP_DOMAIN must be set in production for CORS"
      );
    }
    
    if (productionErrors.length > 0) {
      console.error("❌ Production environment validation failed:\n", productionErrors.join("\n"));
      process.exit(1);
    }
  }
  
  // Development warnings for missing optional vars
  if (!isProduction) {
    if (!env.SESSION_SECRET) {
      console.warn(
        "⚠️  WARNING: SESSION_SECRET not set. Using a generated secret (not secure for production!)"
      );
      env.SESSION_SECRET = crypto.randomBytes(32).toString("hex");
    }
    
    if (!env.IP_HASH_SALT) {
      console.warn(
        "⚠️  WARNING: IP_HASH_SALT not set. Using default 'hivemind-dev' (not secure for production!)"
      );
      env.IP_HASH_SALT = "hivemind-dev";
    }
    
    if (!env.HIVE_MINT) {
      console.warn(
        "⚠️  WARNING: HIVE_MINT not set. Some features may not work. Set HIVE_MINT for full functionality."
      );
    }
  }
  
  return env;
}

// Validate and export typed environment
export const env = validateEnv();

// Export types for use in other files
export type Env = typeof env;

