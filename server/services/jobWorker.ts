import { logger } from "../middleware/logger";
import {
  getJobWorkerConfig,
  claimJob,
  markJobSucceeded,
  markJobFailed,
  type JobType,
} from "./jobQueue";
import { embedCorpusItem } from "./rag";

let workerInterval: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Process a single job based on its type
 */
async function processJob(job: { id: string; type: JobType; payload: any; attempts: number; maxAttempts: number }): Promise<void> {
  logger.info({ jobId: job.id, type: job.type, message: "Processing job" });

  try {
    switch (job.type) {
      case "embed_corpus_item": {
        const { corpusItemId } = job.payload;
        if (!corpusItemId || typeof corpusItemId !== "string") {
          throw new Error("Invalid payload: corpusItemId required");
        }

        await embedCorpusItem(corpusItemId);
        break;
      }

      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }

    await markJobSucceeded(job.id);
    logger.info({ jobId: job.id, type: job.type, message: "Job completed successfully" });
  } catch (error: any) {
    const errorMessage = error.message || "Unknown error";
    await markJobFailed(job.id, errorMessage, job.attempts, job.maxAttempts);
    throw error; // Re-throw so caller knows it failed
  }
}

/**
 * Run one worker cycle: claim and process a job
 */
async function runWorkerCycle(config: { instanceId: string }): Promise<number> {
  if (isRunning) {
    return 0; // Skip if already processing
  }

  isRunning = true;
  let processed = 0;

  try {
    const job = await claimJob(config.instanceId);
    if (!job) {
      return 0; // No jobs available
    }

    try {
      await processJob(job);
      processed = 1;
    } catch (error: any) {
      // Error already logged in processJob
      // Job is marked as failed/pending for retry
    }
  } catch (error: any) {
    logger.error({ error: error.message, message: "Worker cycle error" });
  } finally {
    isRunning = false;
  }

  return processed;
}

/**
 * Start the job worker
 */
export function startJobWorker(): void {
  const config = getJobWorkerConfig();

  if (!config.enabled) {
    logger.info({ message: "Job worker disabled (JOB_WORKER_ENABLED=false)" });
    return;
  }

  if (workerInterval) {
    logger.warn({ message: "Job worker already running" });
    return;
  }

  logger.info({
    instanceId: config.instanceId,
    pollIntervalMs: config.pollIntervalMs,
    message: "Starting job worker",
  });

  // Run immediately, then on interval
  const runCycle = async () => {
    try {
      const processed = await runWorkerCycle(config);
      if (processed > 0) {
        logger.debug({ processed, instanceId: config.instanceId, message: "Worker cycle complete" });
      }
    } catch (error: any) {
      logger.error({ error: error.message, instanceId: config.instanceId, message: "Worker cycle error" });
    }
  };

  runCycle();
  workerInterval = setInterval(runCycle, config.pollIntervalMs);
}

/**
 * Stop the job worker
 */
export function stopJobWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    logger.info({ message: "Job worker stopped" });
  }
}

