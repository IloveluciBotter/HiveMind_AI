import { storage } from "../storage";
import { logger } from "../middleware/logger";
import { logAudit } from "./audit";
import { v4 as uuidv4 } from "uuid";

const ANSWER_EVENTS_RETENTION_DAYS = parseInt(process.env.ANSWER_EVENTS_RETENTION_DAYS || "60", 10);
const ROLLUP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

let rollupIntervalId: NodeJS.Timeout | null = null;
let cleanupIntervalId: NodeJS.Timeout | null = null;

export async function runAggregateRollup(): Promise<{ questions: number; tracks: number; cycles: number }> {
  const requestId = uuidv4();
  logger.info({ requestId, job: "rollup", message: "Starting aggregate rollup job" });

  try {
    const questionsUpdated = await storage.computeAndUpsertQuestionAggregates();
    const tracksUpdated = await storage.computeAndUpsertTrackAggregates();
    const cyclesUpdated = await storage.computeAndUpsertCycleAggregates();

    await logAudit({
      action: "rollup_completed",
      requestId,
      metadata: {
        questionsUpdated,
        tracksUpdated,
        cyclesUpdated,
      },
    });

    logger.info({
      requestId,
      job: "rollup",
      message: "Aggregate rollup completed",
      questionsUpdated,
      tracksUpdated,
      cyclesUpdated,
    });

    return { questions: questionsUpdated, tracks: tracksUpdated, cycles: cyclesUpdated };
  } catch (error) {
    logger.error({ requestId, job: "rollup", error: "Rollup failed", details: error });
    throw error;
  }
}

export async function runRetentionCleanup(): Promise<number> {
  const requestId = uuidv4();
  logger.info({
    requestId,
    job: "retention",
    message: `Starting retention cleanup (${ANSWER_EVENTS_RETENTION_DAYS} days)`,
  });

  try {
    const deletedCount = await storage.deleteExpiredAnswerEvents(ANSWER_EVENTS_RETENTION_DAYS);

    await logAudit({
      action: "retention_cleanup",
      requestId,
      metadata: {
        deletedCount,
        retentionDays: ANSWER_EVENTS_RETENTION_DAYS,
      },
    });

    logger.info({
      requestId,
      job: "retention",
      message: "Retention cleanup completed",
      deletedCount,
    });

    return deletedCount;
  } catch (error) {
    logger.error({ requestId, job: "retention", error: "Retention cleanup failed", details: error });
    throw error;
  }
}

export function startTelemetryJobs(): void {
  logger.info({ message: "Starting telemetry jobs" });

  // Run rollup every 15 minutes
  rollupIntervalId = setInterval(async () => {
    try {
      await runAggregateRollup();
    } catch (error) {
      // Error already logged
    }
  }, ROLLUP_INTERVAL_MS);

  // Run cleanup every 24 hours
  cleanupIntervalId = setInterval(async () => {
    try {
      await runRetentionCleanup();
    } catch (error) {
      // Error already logged
    }
  }, CLEANUP_INTERVAL_MS);

  // Run initial rollup after 1 minute to let the app start
  setTimeout(async () => {
    try {
      await runAggregateRollup();
    } catch (error) {
      // Error already logged
    }
  }, 60 * 1000);

  logger.info({
    message: "Telemetry jobs scheduled",
    rollupIntervalMinutes: ROLLUP_INTERVAL_MS / 60000,
    cleanupIntervalHours: CLEANUP_INTERVAL_MS / 3600000,
    retentionDays: ANSWER_EVENTS_RETENTION_DAYS,
  });
}

export function stopTelemetryJobs(): void {
  if (rollupIntervalId) {
    clearInterval(rollupIntervalId);
    rollupIntervalId = null;
  }
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
  logger.info({ message: "Telemetry jobs stopped" });
}

export function getTelemetryConfig() {
  return {
    rollupIntervalMinutes: ROLLUP_INTERVAL_MS / 60000,
    cleanupIntervalHours: CLEANUP_INTERVAL_MS / 3600000,
    retentionDays: ANSWER_EVENTS_RETENTION_DAYS,
  };
}
