import { db } from "../db";
import { corpusChunks, trainingCorpusItems } from "@shared/schema";
import { eq, sql, and, desc } from "drizzle-orm";
import { generateEmbedding, chunkText, getEmbeddingConfig } from "./embedding";
import { logger } from "../middleware/logger";

export interface ChunkResult {
  id: string;
  corpusItemId: string;
  chunkText: string;
  score: number;
  trackId: string | null;
  title: string | null;
}

export interface RAGConfig {
  defaultK: number;
  minScore: number;
}

export function getRAGConfig(): RAGConfig {
  return {
    defaultK: parseInt(process.env.RAG_DEFAULT_K || "5", 10),
    minScore: parseFloat(process.env.RAG_MIN_SCORE || "0.5"),
  };
}

export async function embedCorpusItem(corpusItemId: string): Promise<number> {
  const items = await db
    .select()
    .from(trainingCorpusItems)
    .where(and(eq(trainingCorpusItems.id, corpusItemId), eq(trainingCorpusItems.status, "approved")))
    .limit(1);

  if (items.length === 0) {
    throw new Error(`Corpus item ${corpusItemId} not found or not approved`);
  }

  const item = items[0];
  const chunks = chunkText(item.normalizedText);
  const config = getEmbeddingConfig();

  await db.delete(corpusChunks).where(eq(corpusChunks.corpusItemId, corpusItemId));

  let embeddedCount = 0;
  for (let i = 0; i < chunks.length; i++) {
    try {
      const { embedding, model } = await generateEmbedding(chunks[i]);
      const embeddingJson = JSON.stringify(embedding);

      await db.insert(corpusChunks).values({
        corpusItemId,
        chunkIndex: i,
        chunkText: chunks[i],
        embeddingModel: model,
      });

      await db.execute(
        sql`UPDATE corpus_chunks SET embedding = ${embeddingJson}::vector WHERE corpus_item_id = ${corpusItemId} AND chunk_index = ${i}`
      );

      embeddedCount++;
    } catch (error: any) {
      logger.error({ error: error.message, chunkIndex: i, corpusItemId, message: "Failed to embed chunk" });
    }
  }

  logger.info({ corpusItemId, chunksCreated: embeddedCount, message: "Corpus item embedded" });
  return embeddedCount;
}

export async function searchCorpus(
  query: string,
  k: number = 5,
  trackId?: string
): Promise<ChunkResult[]> {
  const config = getRAGConfig();
  const { embedding } = await generateEmbedding(query);
  const embeddingStr = `[${embedding.join(",")}]`;

  let queryResult: any;
  
  if (trackId) {
    queryResult = await db.execute(
      sql`
        SELECT 
          cc.id,
          cc.corpus_item_id as "corpusItemId",
          cc.chunk_text as "chunkText",
          1 - (cc.embedding <=> ${embeddingStr}::vector) as score,
          tci.track_id as "trackId",
          tci.title
        FROM corpus_chunks cc
        JOIN training_corpus_items tci ON cc.corpus_item_id = tci.id
        WHERE tci.status = 'approved'
          AND tci.track_id = ${trackId}
          AND cc.embedding IS NOT NULL
        ORDER BY cc.embedding <=> ${embeddingStr}::vector
        LIMIT ${k}
      `
    );
  } else {
    queryResult = await db.execute(
      sql`
        SELECT 
          cc.id,
          cc.corpus_item_id as "corpusItemId",
          cc.chunk_text as "chunkText",
          1 - (cc.embedding <=> ${embeddingStr}::vector) as score,
          tci.track_id as "trackId",
          tci.title
        FROM corpus_chunks cc
        JOIN training_corpus_items tci ON cc.corpus_item_id = tci.id
        WHERE tci.status = 'approved'
          AND cc.embedding IS NOT NULL
        ORDER BY cc.embedding <=> ${embeddingStr}::vector
        LIMIT ${k}
      `
    );
  }

  const rows = queryResult.rows || queryResult;
  
  return rows
    .filter((r: any) => r.score >= config.minScore)
    .map((r: any) => ({
      id: r.id,
      corpusItemId: r.corpusItemId,
      chunkText: r.chunkText,
      score: parseFloat(r.score),
      trackId: r.trackId,
      title: r.title,
    }));
}

export async function getApprovedCorpusItems(trackId?: string) {
  if (trackId) {
    return await db
      .select()
      .from(trainingCorpusItems)
      .where(and(eq(trainingCorpusItems.status, "approved"), eq(trainingCorpusItems.trackId, trackId)))
      .orderBy(desc(trainingCorpusItems.approvedAt));
  }
  
  return await db
    .select()
    .from(trainingCorpusItems)
    .where(eq(trainingCorpusItems.status, "approved"))
    .orderBy(desc(trainingCorpusItems.approvedAt));
}

export async function approveCorpusItem(id: string): Promise<boolean> {
  const { queueForEmbedding, computeContentHash } = await import("./embedWorker");
  
  const [item] = await db
    .select({ title: trainingCorpusItems.title, normalizedText: trainingCorpusItems.normalizedText })
    .from(trainingCorpusItems)
    .where(eq(trainingCorpusItems.id, id))
    .limit(1);

  if (!item) {
    return false;
  }

  const contentHash = computeContentHash(item.title, item.normalizedText);

  const result = await db
    .update(trainingCorpusItems)
    .set({ 
      status: "approved", 
      approvedAt: new Date(),
      contentHash,
      updatedAt: new Date(),
    })
    .where(eq(trainingCorpusItems.id, id))
    .returning();

  if (result.length === 0) {
    return false;
  }

  try {
    await queueForEmbedding(id);
  } catch (error: any) {
    logger.error({ error: error.message, corpusItemId: id, message: "Failed to queue for embedding after approval" });
  }

  return true;
}

export async function createCorpusItem(data: {
  title?: string;
  content: string;
  trackId?: string;
  createdByWallet?: string;
  autoApprove?: boolean;
}): Promise<{ id: string; status: string }> {
  const status = data.autoApprove ? "approved" : "draft";
  
  const result = await db
    .insert(trainingCorpusItems)
    .values({
      title: data.title,
      normalizedText: data.content,
      trackId: data.trackId,
      createdByWallet: data.createdByWallet,
      status,
      approvedAt: data.autoApprove ? new Date() : null,
    })
    .returning();

  const item = result[0];

  if (data.autoApprove) {
    try {
      await embedCorpusItem(item.id);
    } catch (error: any) {
      logger.error({ error: error.message, corpusItemId: item.id, message: "Failed to embed auto-approved item" });
    }
  }

  return { id: item.id, status };
}

export function formatSourcesForPrompt(sources: ChunkResult[]): string {
  if (sources.length === 0) {
    return "";
  }

  const formattedSources = sources
    .map((s, i) => `[Source ${i + 1}${s.title ? `: ${s.title}` : ""}]\n${s.chunkText}`)
    .join("\n\n");

  return `\n\n---\nRelevant Knowledge Base Sources:\n${formattedSources}\n---\n`;
}
