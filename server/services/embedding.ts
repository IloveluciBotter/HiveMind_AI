import { logger } from "../middleware/logger";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "https://ollama.replit.dev";
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || "";
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
const EMBEDDING_DIMENSION = 1024;

export interface EmbeddingResult {
  embedding: number[];
  model: string;
}

export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  const url = `${OLLAMA_BASE_URL}/api/embed`;
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(OLLAMA_API_KEY ? { Authorization: `Bearer ${OLLAMA_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: OLLAMA_EMBED_MODEL,
        input: text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Embedding API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    if (data.embeddings && data.embeddings.length > 0) {
      return {
        embedding: data.embeddings[0],
        model: OLLAMA_EMBED_MODEL,
      };
    }
    
    if (data.embedding) {
      return {
        embedding: data.embedding,
        model: OLLAMA_EMBED_MODEL,
      };
    }

    throw new Error("No embedding returned from API");
  } catch (error: any) {
    logger.error({ error: error.message, model: OLLAMA_EMBED_MODEL, message: "Embedding generation failed" });
    throw error;
  }
}

export async function generateEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
  const results: EmbeddingResult[] = [];
  
  for (const text of texts) {
    const result = await generateEmbedding(text);
    results.push(result);
  }
  
  return results;
}

export function chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
  const chunks: string[] = [];
  
  if (text.length <= chunkSize) {
    return [text.trim()];
  }
  
  let start = 0;
  while (start < text.length) {
    let end = start + chunkSize;
    
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf(".", end);
      const lastNewline = text.lastIndexOf("\n", end);
      const breakPoint = Math.max(lastPeriod, lastNewline);
      
      if (breakPoint > start + chunkSize / 2) {
        end = breakPoint + 1;
      }
    }
    
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    
    start = end - overlap;
    if (start >= text.length) break;
  }
  
  return chunks;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have same length");
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function getEmbeddingConfig() {
  return {
    model: OLLAMA_EMBED_MODEL,
    dimension: EMBEDDING_DIMENSION,
    baseUrl: OLLAMA_BASE_URL,
  };
}
