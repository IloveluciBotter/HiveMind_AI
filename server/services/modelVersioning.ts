import { db } from "../db";
import { modelVersionsV2, modelState, trainingCorpusItems } from "@shared/schema";
import { eq, sql, and } from "drizzle-orm";
import { logger } from "../middleware/logger";
import crypto from "crypto";

// Use the new model_versions_v2 table (avoiding conflict with existing modelVersions)
const modelVersions = modelVersionsV2;

export interface BenchmarkMetrics {
  qaAccuracy?: number;
  refusalRate?: number;
  hallucinationRate?: number;
  latencyMs?: number;
  evalCount?: number;
}

export interface ModelVersionConfig {
  minQaAccuracy?: number;
  maxLatencyMs?: number;
  autoRollbackEnabled: boolean;
}

/**
 * Get model versioning configuration from environment variables
 */
export function getModelVersionConfig(): ModelVersionConfig {
  const minQaAccuracy = process.env.MODEL_MIN_QA_ACCURACY
    ? parseFloat(process.env.MODEL_MIN_QA_ACCURACY)
    : undefined;
  const maxLatencyMs = process.env.MODEL_MAX_LATENCY_MS
    ? parseInt(process.env.MODEL_MAX_LATENCY_MS, 10)
    : undefined;
  const autoRollbackEnabled = process.env.MODEL_AUTO_ROLLBACK_ENABLED === "true";

  return { minQaAccuracy, maxLatencyMs, autoRollbackEnabled };
}

/**
 * Compute corpus hash from approved corpus items
 * Deterministic hash based on corpus item IDs and updatedAt timestamps
 */
export async function computeCorpusHash(): Promise<string> {
  const items = await db
    .select({
      id: trainingCorpusItems.id,
      updatedAt: trainingCorpusItems.updatedAt,
    })
    .from(trainingCorpusItems)
    .where(eq(trainingCorpusItems.status, "approved"))
    .orderBy(trainingCorpusItems.id);

  // Create deterministic hash from IDs and updatedAt
  const hashInput = items
    .map((item) => `${item.id}:${item.updatedAt?.toISOString() || ""}`)
    .join("|");

  return crypto.createHash("sha256").update(hashInput).digest("hex").slice(0, 32);
}

/**
 * Run lightweight benchmark stub
 * Returns basic metrics without full evaluation
 */
export async function runBenchmarkStub(): Promise<BenchmarkMetrics> {
  const metrics: BenchmarkMetrics = {
    evalCount: 0,
  };

  // Measure latency by pinging Ollama
  try {
    const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL;
    if (OLLAMA_BASE_URL) {
      const startTime = Date.now();
      const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
        method: "GET",
        signal: AbortSignal.timeout(3000), // 3 second timeout
      });
      const latencyMs = Date.now() - startTime;
      
      if (response.ok) {
        metrics.latencyMs = latencyMs;
      }
    }
  } catch (error: any) {
    logger.warn({ error: error.message, message: "Failed to measure Ollama latency" });
    // Don't fail if latency check fails
  }

  return metrics;
}

/**
 * Evaluate if model version passes thresholds
 */
export function evaluateModelVersion(
  metrics: BenchmarkMetrics,
  config: ModelVersionConfig
): { passed: boolean; reason?: string } {
  if (config.minQaAccuracy !== undefined && metrics.qaAccuracy !== undefined) {
    if (metrics.qaAccuracy < config.minQaAccuracy) {
      return {
        passed: false,
        reason: `QA accuracy ${metrics.qaAccuracy} below threshold ${config.minQaAccuracy}`,
      };
    }
  }

  if (config.maxLatencyMs !== undefined && metrics.latencyMs !== undefined) {
    if (metrics.latencyMs > config.maxLatencyMs) {
      return {
        passed: false,
        reason: `Latency ${metrics.latencyMs}ms exceeds threshold ${config.maxLatencyMs}ms`,
      };
    }
  }

  // If metrics are missing, don't fail - just keep as candidate
  return { passed: true };
}

/**
 * Create a model version for a finalized cycle
 */
export async function createModelVersionForCycle(
  cycleId: string | null,
  notes?: string
): Promise<typeof modelVersions.$inferSelect> {
  const corpusHash = await computeCorpusHash();
  const benchmarks = await runBenchmarkStub();
  const config = getModelVersionConfig();

  // Evaluate if version passes thresholds
  const evaluation = evaluateModelVersion(benchmarks, config);
  const status = evaluation.passed ? "candidate" : "failed";

  const result = await db
    .insert(modelVersions)
    .values({
      cycleId,
      status,
      corpusHash,
      benchmarks,
      notes: notes || (evaluation.reason ? `Auto-evaluated: ${evaluation.reason}` : null),
    })
    .returning();

  const version = result[0];
  logger.info({
    versionId: version.id,
    cycleId,
    status,
    corpusHash,
    message: "Model version created",
  });

  if (!evaluation.passed) {
    logger.warn({
      versionId: version.id,
      reason: evaluation.reason,
      message: "Model version failed evaluation",
    });
  }

  return version;
}

/**
 * Get active model version
 */
export async function getActiveModelVersion(): Promise<
  | (typeof modelVersions.$inferSelect & { isActive: boolean })
  | null
> {
  const [state] = await db.select().from(modelState).where(eq(modelState.id, 1)).limit(1);

  if (!state || !state.activeModelVersionId) {
    return null;
  }

  const [version] = await db
    .select()
    .from(modelVersions)
    .where(eq(modelVersions.id, state.activeModelVersionId))
    .limit(1);

  if (!version) {
    return null;
  }

  return { ...version, isActive: true };
}

/**
 * Get current corpus hash (from active model version or compute fresh)
 */
export async function getCurrentCorpusHash(): Promise<string> {
  const activeVersion = await getActiveModelVersion();
  if (activeVersion) {
    return activeVersion.corpusHash;
  }
  return await computeCorpusHash();
}

/**
 * Activate a model version
 */
export async function activateModelVersion(versionId: string): Promise<void> {
  // Verify version exists
  const [version] = await db
    .select()
    .from(modelVersions)
    .where(eq(modelVersions.id, versionId))
    .limit(1);

  if (!version) {
    throw new Error(`Model version ${versionId} not found`);
  }

  // Get current state
  const [currentState] = await db.select().from(modelState).where(eq(modelState.id, 1)).limit(1);

  const previousModelVersionId = currentState?.activeModelVersionId || null;

  // Update model state
  if (currentState) {
    await db
      .update(modelState)
      .set({
        previousModelVersionId,
        activeModelVersionId: versionId,
        updatedAt: new Date(),
      })
      .where(eq(modelState.id, 1));
  } else {
    await db.insert(modelState).values({
      id: 1,
      activeModelVersionId: versionId,
      previousModelVersionId,
    });
  }

  // Mark version as active
  await db
    .update(modelVersions)
    .set({ status: "active" })
    .where(eq(modelVersions.id, versionId));

  // Mark previous version as inactive (if exists)
  if (previousModelVersionId) {
    await db
      .update(modelVersions)
      .set({ status: "candidate" })
      .where(
        and(
          eq(modelVersions.id, previousModelVersionId),
          eq(modelVersions.status, "active")
        )
      );
  }

  logger.info({
    versionId,
    previousModelVersionId,
    message: "Model version activated",
  });
}

/**
 * Rollback to previous model version
 */
export async function rollbackModelVersion(): Promise<void> {
  const [state] = await db.select().from(modelState).where(eq(modelState.id, 1)).limit(1);

  if (!state || !state.previousModelVersionId) {
    throw new Error("No previous model version to rollback to");
  }

  const currentVersionId = state.activeModelVersionId;
  const previousVersionId = state.previousModelVersionId;

  // Update model state
  await db
    .update(modelState)
    .set({
      activeModelVersionId: previousVersionId,
      previousModelVersionId: null, // Clear previous since we're rolling back
      updatedAt: new Date(),
    })
    .where(eq(modelState.id, 1));

  // Mark current version as rolled back
  if (currentVersionId) {
    await db
      .update(modelVersions)
      .set({ status: "rolled_back" })
      .where(eq(modelVersions.id, currentVersionId));
  }

  // Mark previous version as active
  await db
    .update(modelVersions)
    .set({ status: "active" })
    .where(eq(modelVersions.id, previousVersionId));

  logger.info({
    currentVersionId,
    previousVersionId,
    message: "Model version rolled back",
  });
}

/**
 * Get all model versions
 */
export async function getAllModelVersions(): Promise<typeof modelVersions.$inferSelect[]> {
  return await db
    .select()
    .from(modelVersions)
    .orderBy(sql`created_at DESC`);
}

/**
 * Get model version by ID
 */
export async function getModelVersionById(
  versionId: string
): Promise<typeof modelVersions.$inferSelect | undefined> {
  const [version] = await db
    .select()
    .from(modelVersions)
    .where(eq(modelVersions.id, versionId))
    .limit(1);
  return version;
}

