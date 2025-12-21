import { db } from "../db";
import { jobs } from "@shared/schema";
import { eq, and, lte, sql, or, isNull } from "drizzle-orm";
import { logger } from "../middleware/logger";
import crypto from "crypto";

export type JobType = "embed_corpus_item";
export type JobStatus = "pending" | "running" | "succeeded" | "failed";

export interface JobPayload {
  [key: string]: any;
}

export interface JobConfig {
  enabled: boolean;
  pollIntervalMs: number;
  instanceId: string;
}

/**
 * Get job worker configuration from environment variables
 */
export function getJobWorkerConfig(): JobConfig {
  // Default to true in development, false in production (unless explicitly set)
  const enabledEnv = process.env.JOB_WORKER_ENABLED;
  const enabled = enabledEnv !== undefined 
    ? enabledEnv === "true"
    : process.env.NODE_ENV !== "production";
  
  const pollIntervalMs = parseInt(process.env.JOB_WORKER_POLL_MS || "2000", 10);
  
  // Generate instance ID if not provided (for multi-instance deployments)
  let instanceId = process.env.JOB_WORKER_INSTANCE_ID;
  if (!instanceId) {
    instanceId = `worker-${crypto.randomBytes(4).toString("hex")}`;
  }
  
  return { enabled, pollIntervalMs, instanceId };
}

/**
 * Enqueue a new job
 */
export async function enqueueJob(
  type: JobType,
  payload: JobPayload,
  options?: {
    maxAttempts?: number;
    runAt?: Date;
  }
): Promise<string> {
  const result = await db
    .insert(jobs)
    .values({
      type,
      payload,
      status: "pending",
      attempts: 0,
      maxAttempts: options?.maxAttempts || 5,
      runAt: options?.runAt || new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: jobs.id });

  const jobId = result[0].id;
  logger.info({ jobId, type, message: "Job enqueued" });
  return jobId;
}

/**
 * Atomically claim a pending job (for processing)
 * Uses PostgreSQL's FOR UPDATE SKIP LOCKED for safe concurrent access
 */
export async function claimJob(instanceId: string): Promise<typeof jobs.$inferSelect | null> {
  const now = new Date();
  
  // Use PostgreSQL's FOR UPDATE SKIP LOCKED to atomically claim a job
  // This ensures only one worker can claim a job at a time
  const result = await db.execute(sql`
    UPDATE jobs
    SET 
      status = 'running',
      locked_at = ${now},
      locked_by = ${instanceId},
      updated_at = ${now}
    WHERE id = (
      SELECT id 
      FROM jobs 
      WHERE status = 'pending' 
        AND run_at <= ${now}
      ORDER BY run_at ASC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `);

  // Handle both array and object result formats
  const rows = Array.isArray(result) ? result : (result.rows || []);
  if (rows.length === 0) {
    return null;
  }

  const job = rows[0] as typeof jobs.$inferSelect;
  logger.debug({ jobId: job.id, type: job.type, instanceId, message: "Job claimed" });
  return job;
}

/**
 * Mark a job as succeeded
 */
export async function markJobSucceeded(jobId: string): Promise<void> {
  await db
    .update(jobs)
    .set({
      status: "succeeded",
      lockedAt: null,
      lockedBy: null,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, jobId));

  logger.info({ jobId, message: "Job succeeded" });
}

/**
 * Mark a job as failed and schedule retry with exponential backoff
 */
export async function markJobFailed(
  jobId: string,
  error: string,
  currentAttempts: number,
  maxAttempts: number
): Promise<void> {
  const newAttempts = currentAttempts + 1;
  const isFinalAttempt = newAttempts >= maxAttempts;

  // Exponential backoff: 2^attempts seconds, capped at 5 minutes (300 seconds)
  const backoffSeconds = Math.min(Math.pow(2, newAttempts), 300);
  const runAt = isFinalAttempt ? null : new Date(Date.now() + backoffSeconds * 1000);

  await db
    .update(jobs)
    .set({
      status: isFinalAttempt ? "failed" : "pending",
      attempts: newAttempts,
      lastError: error,
      runAt: runAt || undefined,
      lockedAt: null,
      lockedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, jobId));

  if (isFinalAttempt) {
    logger.error({ jobId, attempts: newAttempts, error, message: "Job permanently failed" });
  } else {
    logger.warn({ 
      jobId, 
      attempts: newAttempts, 
      nextRunAt: runAt?.toISOString(),
      error, 
      message: "Job failed, will retry" 
    });
  }
}

/**
 * Get jobs by status (for admin endpoints)
 */
export async function getJobsByStatus(
  status?: JobStatus,
  limit: number = 50
): Promise<typeof jobs.$inferSelect[]> {
  let query = db.select().from(jobs);

  if (status) {
    query = query.where(eq(jobs.status, status)) as any;
  }

  const results = await query.orderBy(sql`created_at DESC`).limit(limit);
  return results;
}

/**
 * Get a single job by ID
 */
export async function getJobById(jobId: string): Promise<typeof jobs.$inferSelect | undefined> {
  const result = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  return result[0];
}

/**
 * Retry a failed job
 */
export async function retryJob(jobId: string): Promise<void> {
  const job = await getJobById(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  if (job.status !== "failed") {
    throw new Error(`Can only retry failed jobs, current status: ${job.status}`);
  }

  await db
    .update(jobs)
    .set({
      status: "pending",
      attempts: 0,
      lastError: null,
      runAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, jobId));

  logger.info({ jobId, type: job.type, message: "Job reset for retry" });
}

/**
 * Clean up old succeeded jobs (optional maintenance)
 */
export async function cleanupOldJobs(olderThanDays: number = 7): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const result = await db
    .delete(jobs)
    .where(
      and(
        eq(jobs.status, "succeeded"),
        lte(jobs.updatedAt, cutoffDate)
      )
    );

  // Drizzle returns affected rows count differently
  const deleted = (result as any).rowCount || ((result as any).length || 0);
  if (deleted > 0) {
    logger.info({ deleted, olderThanDays, message: "Cleaned up old succeeded jobs" });
  }
  return deleted;
}

