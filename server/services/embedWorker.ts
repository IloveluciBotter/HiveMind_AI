import { db } from "../db";
import { trainingCorpusItems, corpusChunks } from "@shared/schema";
import { eq, sql, and, lte, or, isNull } from "drizzle-orm";
import { generateEmbedding, chunkText } from "./embedding";
import { logger } from "../middleware/logger";
import crypto from "crypto";

export interface EmbedWorkerConfig {
  maxAttempts: number;
  backoffScheduleMs: number[];
  pollIntervalMs: number;
}

export function getEmbedWorkerConfig(): EmbedWorkerConfig {
  return {
    maxAttempts: parseInt(process.env.EMBED_MAX_ATTEMPTS || "5", 10),
    backoffScheduleMs: [
      60 * 1000,
      5 * 60 * 1000,
      15 * 60 * 1000,
      60 * 60 * 1000,
      6 * 60 * 60 * 1000,
    ],
    pollIntervalMs: parseInt(process.env.EMBED_POLL_INTERVAL_MS || "30000", 10),
  };
}

export function computeContentHash(title: string | null, content: string): string {
  const text = `${title || ""}::${content}`;
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}

export async function queueForEmbedding(corpusItemId: string): Promise<void> {
  const [item] = await db
    .select({ 
      id: trainingCorpusItems.id, 
      status: trainingCorpusItems.status,
      title: trainingCorpusItems.title,
      normalizedText: trainingCorpusItems.normalizedText 
    })
    .from(trainingCorpusItems)
    .where(eq(trainingCorpusItems.id, corpusItemId))
    .limit(1);

  if (!item) {
    throw new Error(`Corpus item ${corpusItemId} not found`);
  }

  if (item.status !== "approved") {
    throw new Error(`Cannot embed non-approved item ${corpusItemId}`);
  }

  const contentHash = computeContentHash(item.title, item.normalizedText);

  await db
    .update(trainingCorpusItems)
    .set({
      embedStatus: "queued",
      embedError: null,
      embedAttempts: 0,
      embedNextRetryAt: null,
      contentHash,
      embedUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(trainingCorpusItems.id, corpusItemId));

  logger.info({ corpusItemId, message: "Corpus item queued for embedding" });
}

export async function checkAndQueueOnEdit(
  corpusItemId: string,
  newTitle: string | null,
  newContent: string
): Promise<boolean> {
  const [item] = await db
    .select({
      status: trainingCorpusItems.status,
      lastEmbeddedHash: trainingCorpusItems.lastEmbeddedHash,
      contentHash: trainingCorpusItems.contentHash,
    })
    .from(trainingCorpusItems)
    .where(eq(trainingCorpusItems.id, corpusItemId))
    .limit(1);

  if (!item || item.status !== "approved") {
    return false;
  }

  const newHash = computeContentHash(newTitle, newContent);
  
  if (item.lastEmbeddedHash && newHash !== item.lastEmbeddedHash) {
    await db
      .update(trainingCorpusItems)
      .set({
        embedStatus: "queued",
        embedError: null,
        embedAttempts: 0,
        embedNextRetryAt: null,
        contentHash: newHash,
        embedUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(trainingCorpusItems.id, corpusItemId));

    logger.info({ corpusItemId, message: "Corpus item re-queued due to content change" });
    return true;
  }

  return false;
}

export async function processEmbedQueue(): Promise<number> {
  const config = getEmbedWorkerConfig();
  const now = new Date();

  const itemsToProcess = await db
    .select()
    .from(trainingCorpusItems)
    .where(
      and(
        eq(trainingCorpusItems.status, "approved"),
        or(
          eq(trainingCorpusItems.embedStatus, "queued"),
          and(
            eq(trainingCorpusItems.embedStatus, "failed"),
            lte(trainingCorpusItems.embedNextRetryAt, now)
          )
        )
      )
    )
    .limit(10);

  let processed = 0;

  for (const item of itemsToProcess) {
    const lockAcquired = await acquireEmbedLock(item.id);
    if (!lockAcquired) {
      logger.debug({ corpusItemId: item.id, message: "Skipping - already being processed" });
      continue;
    }

    try {
      await embedItemWithRetry(item.id);
      processed++;
    } catch (error: any) {
      logger.error({ 
        corpusItemId: item.id, 
        error: error.message, 
        message: "Embedding failed" 
      });
    }
  }

  return processed;
}

async function acquireEmbedLock(corpusItemId: string): Promise<boolean> {
  const result = await db
    .update(trainingCorpusItems)
    .set({
      embedStatus: "embedding",
      embedUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(trainingCorpusItems.id, corpusItemId),
        or(
          eq(trainingCorpusItems.embedStatus, "queued"),
          eq(trainingCorpusItems.embedStatus, "failed")
        )
      )
    )
    .returning({ id: trainingCorpusItems.id });

  return result.length > 0;
}

async function embedItemWithRetry(corpusItemId: string): Promise<void> {
  const config = getEmbedWorkerConfig();

  const [item] = await db
    .select()
    .from(trainingCorpusItems)
    .where(eq(trainingCorpusItems.id, corpusItemId))
    .limit(1);

  if (!item) {
    throw new Error(`Corpus item ${corpusItemId} not found`);
  }

  const attemptNumber = (item.embedAttempts || 0) + 1;

  try {
    await db.transaction(async (tx) => {
      await tx.delete(corpusChunks).where(eq(corpusChunks.corpusItemId, corpusItemId));

      const chunks = chunkText(item.normalizedText);
      
      for (let i = 0; i < chunks.length; i++) {
        const { embedding, model } = await generateEmbedding(chunks[i]);
        const embeddingJson = JSON.stringify(embedding);

        await tx.insert(corpusChunks).values({
          corpusItemId,
          chunkIndex: i,
          chunkText: chunks[i],
          embeddingModel: model,
        });

        await tx.execute(
          sql`UPDATE corpus_chunks 
              SET embedding = ${embeddingJson}::vector 
              WHERE corpus_item_id = ${corpusItemId} AND chunk_index = ${i}`
        );
      }

      const contentHash = computeContentHash(item.title, item.normalizedText);

      await tx
        .update(trainingCorpusItems)
        .set({
          embedStatus: "embedded",
          embedError: null,
          embedAttempts: attemptNumber,
          embedNextRetryAt: null,
          lastEmbeddedHash: contentHash,
          contentHash,
          embedUpdatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(trainingCorpusItems.id, corpusItemId));
    });

    logger.info({ 
      corpusItemId, 
      attemptNumber, 
      message: "Corpus item embedded successfully" 
    });

  } catch (error: any) {
    const backoffIndex = Math.min(attemptNumber - 1, config.backoffScheduleMs.length - 1);
    const backoffMs = config.backoffScheduleMs[backoffIndex];
    const nextRetryAt = new Date(Date.now() + backoffMs);

    const isFinalAttempt = attemptNumber >= config.maxAttempts;
    const newStatus = isFinalAttempt ? "failed" : "failed";

    await db
      .update(trainingCorpusItems)
      .set({
        embedStatus: newStatus,
        embedError: error.message || "Unknown error",
        embedAttempts: attemptNumber,
        embedNextRetryAt: isFinalAttempt ? null : nextRetryAt,
        embedUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(trainingCorpusItems.id, corpusItemId));

    if (isFinalAttempt) {
      logger.error({ 
        corpusItemId, 
        attemptNumber, 
        error: error.message,
        message: "Embedding permanently failed after max attempts" 
      });
    } else {
      logger.warn({ 
        corpusItemId, 
        attemptNumber, 
        nextRetryAt: nextRetryAt.toISOString(),
        error: error.message,
        message: "Embedding failed, will retry" 
      });
    }

    throw error;
  }
}

export async function retryEmbedding(corpusItemId: string): Promise<void> {
  const [item] = await db
    .select({ embedStatus: trainingCorpusItems.embedStatus })
    .from(trainingCorpusItems)
    .where(eq(trainingCorpusItems.id, corpusItemId))
    .limit(1);

  if (!item) {
    throw new Error(`Corpus item ${corpusItemId} not found`);
  }

  if (item.embedStatus !== "failed") {
    throw new Error(`Can only retry items with 'failed' status, current: ${item.embedStatus}`);
  }

  await db
    .update(trainingCorpusItems)
    .set({
      embedStatus: "queued",
      embedError: null,
      embedAttempts: 0,
      embedNextRetryAt: null,
      embedUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(trainingCorpusItems.id, corpusItemId));

  logger.info({ corpusItemId, message: "Corpus item reset for retry" });
}

export async function forceReembed(corpusItemId: string): Promise<void> {
  const [item] = await db
    .select({ status: trainingCorpusItems.status })
    .from(trainingCorpusItems)
    .where(eq(trainingCorpusItems.id, corpusItemId))
    .limit(1);

  if (!item) {
    throw new Error(`Corpus item ${corpusItemId} not found`);
  }

  if (item.status !== "approved") {
    throw new Error(`Cannot force re-embed non-approved item`);
  }

  await db.delete(corpusChunks).where(eq(corpusChunks.corpusItemId, corpusItemId));

  await db
    .update(trainingCorpusItems)
    .set({
      embedStatus: "queued",
      embedError: null,
      embedAttempts: 0,
      embedNextRetryAt: null,
      lastEmbeddedHash: null,
      embedUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(trainingCorpusItems.id, corpusItemId));

  logger.info({ corpusItemId, message: "Corpus item force re-queued, chunks cleared" });
}

export async function getEmbedStatusSummary(): Promise<{
  not_embedded: number;
  queued: number;
  embedding: number;
  embedded: number;
  failed: number;
}> {
  const result = await db.execute(sql`
    SELECT 
      embed_status,
      COUNT(*) as count
    FROM training_corpus_items
    WHERE status = 'approved'
    GROUP BY embed_status
  `);

  const summary = {
    not_embedded: 0,
    queued: 0,
    embedding: 0,
    embedded: 0,
    failed: 0,
  };

  for (const row of result.rows as any[]) {
    const status = row.embed_status as keyof typeof summary;
    if (status in summary) {
      summary[status] = parseInt(row.count, 10);
    }
  }

  return summary;
}

export async function getItemsByEmbedStatus(
  status: "not_embedded" | "queued" | "embedding" | "embedded" | "failed",
  limit: number = 50
): Promise<any[]> {
  return db
    .select({
      id: trainingCorpusItems.id,
      title: trainingCorpusItems.title,
      status: trainingCorpusItems.status,
      embedStatus: trainingCorpusItems.embedStatus,
      embedError: trainingCorpusItems.embedError,
      embedAttempts: trainingCorpusItems.embedAttempts,
      embedNextRetryAt: trainingCorpusItems.embedNextRetryAt,
      embedUpdatedAt: trainingCorpusItems.embedUpdatedAt,
      trackId: trainingCorpusItems.trackId,
    })
    .from(trainingCorpusItems)
    .where(
      and(
        eq(trainingCorpusItems.status, "approved"),
        eq(trainingCorpusItems.embedStatus, status)
      )
    )
    .limit(limit);
}

let workerInterval: NodeJS.Timeout | null = null;

export function startEmbedWorker(): void {
  const config = getEmbedWorkerConfig();
  
  if (workerInterval) {
    clearInterval(workerInterval);
  }

  logger.info({ 
    pollIntervalMs: config.pollIntervalMs, 
    maxAttempts: config.maxAttempts,
    message: "Starting embed worker" 
  });

  const runWorker = async () => {
    try {
      const processed = await processEmbedQueue();
      if (processed > 0) {
        logger.info({ processed, message: "Embed worker cycle complete" });
      }
    } catch (error: any) {
      logger.error({ error: error.message, message: "Embed worker error" });
    }
  };

  runWorker();
  
  workerInterval = setInterval(runWorker, config.pollIntervalMs);
}

export function stopEmbedWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    logger.info({ message: "Embed worker stopped" });
  }
}
