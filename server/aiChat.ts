import { lmstudioChat } from "./services/lmstudio";
import { storage } from "./storage";
import type { TrainingCorpusItem } from "@shared/schema";
import { searchCorpus, type ChunkResult } from "./services/rag";
import {
  sanitizeChunks,
  filterValidChunks,
  formatSanitizedSourcesForPrompt,
  getRAGGuardSystemInstruction,
  sanitizeCitations,
  getRAGGuardConfig,
} from "./services/ragGuard";

const LMSTUDIO_BASE_URL = process.env.LMSTUDIO_BASE_URL || "";
const LMSTUDIO_MODEL = process.env.LMSTUDIO_MODEL || "";

interface IntelligenceStyle {
  maxTokens: number;
  systemPrompt: string;
  temperature: number;
}

export interface OllamaHealthStatus {
  ok: boolean;
  baseUrl: string;
  model?: string;
  error?: string;
}

function getIntelligenceStyle(aiLevel: number): IntelligenceStyle {
  if (aiLevel <= 5) {
    return {
      maxTokens: 150,
      temperature: 0.9,
      systemPrompt: `You are HiveMind AI at early training level ${aiLevel}. 
You're still learning and should give SHORT, SIMPLE responses.
- Use basic vocabulary only
- Keep responses to 1-2 sentences
- Avoid technical jargon
- Be friendly but a bit unsure
- Sometimes say "I'm still learning about this"`,
    };
  } else if (aiLevel <= 15) {
    return {
      maxTokens: 300,
      temperature: 0.7,
      systemPrompt: `You are HiveMind AI at intermediate training level ${aiLevel}.
You're becoming more capable and should give MODERATE responses.
- Use clear explanations with examples
- Can handle some complexity
- Be helpful and conversational
- Show growing confidence`,
    };
  } else if (aiLevel <= 30) {
    return {
      maxTokens: 500,
      temperature: 0.5,
      systemPrompt: `You are HiveMind AI at advanced training level ${aiLevel}.
You're well-trained and should give DETAILED responses.
- Provide thorough explanations
- Use technical terms when appropriate
- Structure answers with clear steps
- Be confident and precise`,
    };
  } else {
    return {
      maxTokens: 800,
      temperature: 0.3,
      systemPrompt: `You are HiveMind AI at elite training level ${aiLevel}.
You're highly trained and should give EXPERT responses.
- Provide comprehensive, structured answers
- Use precise technical language
- Include nuances and edge cases
- Demonstrate deep understanding
- Reference specific knowledge from training`,
    };
  }
}

function buildContextFromCorpus(items: TrainingCorpusItem[]): string {
  if (items.length === 0) {
    return "";
  }
  
  const context = items.map((item, i) => `[${i + 1}] ${item.normalizedText}`).join("\n");
  return `\n\nRelevant knowledge from official HiveMind training corpus:\n${context}\n\nUse this knowledge to inform your response.`;
}


export async function checkOllamaHealth(): Promise<OllamaHealthStatus> {
  if (!LMSTUDIO_BASE_URL || !LMSTUDIO_MODEL) {
    return {
      ok: false,
      baseUrl: LMSTUDIO_BASE_URL || "(not configured)",
      model: LMSTUDIO_MODEL || "(not configured)",
      error: "LM Studio not configured",
    };
  }

  try {
    // Use AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${LMSTUDIO_BASE_URL}/models`, {
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        ok: false,
        baseUrl: LMSTUDIO_BASE_URL,
        model: LMSTUDIO_MODEL,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    console.log(`[LM Studio] Health check passed for ${LMSTUDIO_BASE_URL}`);
    
    return {
      ok: true,
      baseUrl: LMSTUDIO_BASE_URL,
      model: LMSTUDIO_MODEL,
    };
  } catch (error: any) {
    const errorMessage = error.name === "AbortError" 
      ? "Connection timeout (5s)" 
      : error.message || "Unknown error";
    
    console.error(`[LM Studio] Health check failed for ${LMSTUDIO_BASE_URL}:`, errorMessage);
    
    return {
      ok: false,
      baseUrl: LMSTUDIO_BASE_URL,
      model: LMSTUDIO_MODEL,
      error: errorMessage,
    };
  }
}

export interface ChatResponseResult {
  response: string;
  corpusItemsUsed: string[];
  sources: Array<{ chunkText: string; score: number; title: string | null }>;
  isGrounded: boolean;
}

export async function generateChatResponse(
  userMessage: string,
  aiLevel: number,
  trackId?: string
): Promise<ChatResponseResult> {
  const style = getIntelligenceStyle(aiLevel);
  
  let ragSources: ChunkResult[] = [];
  let corpusItemIds: string[] = [];
  let isGrounded = false;
  let systemPrompt = style.systemPrompt;
  
  try {
    ragSources = await searchCorpus(userMessage, 5, trackId);
    
    // Apply RAG guard: sanitize chunks for prompt injection protection
    const guardConfig = getRAGGuardConfig();
    const sanitizedChunks = sanitizeChunks(ragSources, guardConfig);
    const validChunks = filterValidChunks(sanitizedChunks);
    
    // Update corpus items used to only include valid chunks
    corpusItemIds = Array.from(new Set(validChunks.map(s => s.originalChunk?.corpusItemId).filter(Boolean) as string[]));
    isGrounded = validChunks.length > 0;
    
    // Format sanitized sources for prompt
    const ragContext = formatSanitizedSourcesForPrompt(sanitizedChunks);
    
    if (ragContext) {
      systemPrompt += ragContext;
      // Add RAG guard system instruction
      systemPrompt += getRAGGuardSystemInstruction();
      systemPrompt += "\n\nIMPORTANT: Base your response on the provided sources. Cite specific information from them when relevant.";
    } else if (aiLevel < 10) {
      systemPrompt += "\n\nNote: You don't have specific training data for this topic yet. Be honest about this limitation.";
    }
    
    // Update ragSources to only include valid chunks for citation
    ragSources = validChunks
      .map(s => s.originalChunk!)
      .filter(Boolean);
  } catch (error: any) {
    console.warn("[RAG] Search failed, falling back to ungrounded response:", error.message);
  }
  
  if (!LMSTUDIO_BASE_URL || !LMSTUDIO_MODEL) {
    throw new Error("LM Studio not configured");
  }
  
  try {
    // Convert system prompt to user message format (LM Studio models may not support system role)
    // Prepend system instructions to the user message
    const userMessageWithContext = systemPrompt 
      ? `${systemPrompt}\n\nUser question: ${userMessage}`
      : userMessage;
    
    let aiResponse = await lmstudioChat(
      [
        { role: "user", content: userMessageWithContext },
      ],
      {
        temperature: style.temperature,
        max_tokens: style.maxTokens,
      }
    );
    
    if (!isGrounded && aiLevel < 10) {
      aiResponse += "\n\n(Note: This topic isn't in my training corpus yet. The community can help me learn more!)";
    } else if (!isGrounded) {
      aiResponse += "\n\n[Ungrounded response - not based on verified corpus data]";
    }
    
    // Sanitize citations before returning to client (remove secrets, safe truncation)
    const sanitizedSources = sanitizeCitations(ragSources, 240);
    
    return {
      response: aiResponse,
      corpusItemsUsed: corpusItemIds,
      sources: sanitizedSources,
      isGrounded,
    };
  } catch (error: any) {
    console.error(`[LM Studio] Chat error for ${LMSTUDIO_BASE_URL}:`, error.message || error);
    throw new Error("LM Studio not configured or offline");
  }
}

export async function testOllamaConnection(): Promise<boolean> {
  const health = await checkOllamaHealth();
  return health.ok;
}
