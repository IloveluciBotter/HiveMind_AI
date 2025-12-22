import { captureError } from "./sentry";

const API_BASE = "";

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    credentials: "include",
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: res.statusText }));
    const requestId = res.headers.get("x-request-id") || errorBody.requestId;
    let errorMessage = errorBody.message || errorBody.error || "Request failed";
    
    // Improve error messages for common status codes
    if (res.status === 429) {
      const retryAfter = res.headers.get("retry-after");
      if (retryAfter) {
        errorMessage = `Too many requests. Please wait ${retryAfter} seconds and try again.`;
      } else {
        errorMessage = "Too many requests. Please slow down and try again.";
      }
    }
    
    const error = new Error(errorMessage);
    // Don't log 401 Unauthorized or 429 Rate Limit as errors - they're expected
    if (res.status !== 401 && res.status !== 429) {
      captureError(error, {
        requestId,
        extra: { endpoint, status: res.status, errorBody },
      });
    }
    (error as any).status = res.status;
    (error as any).isUnauthorized = res.status === 401;
    (error as any).isRateLimit = res.status === 429;
    
    throw error;
  }

  return res.json();
}

export const api = {
  auth: {
    getNonce: (wallet: string) =>
      fetchApi<{ nonce: string; message: string; expiresAt: string }>(
        `/api/auth/nonce?wallet=${wallet}`
      ),

    getChallenge: (publicKey: string) =>
      fetchApi<{ nonce: string; message: string; expiresAt: string }>(
        `/api/auth/challenge?publicKey=${publicKey}`
      ),

    verify: (wallet: string, signature: string, nonce: string) =>
      fetchApi<{ ok: boolean; expiresAt: string }>("/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({ wallet, signature, nonce }),
      }),

    logout: () =>
      fetchApi<{ ok: boolean }>("/api/auth/logout", {
        method: "POST",
      }),

    session: () =>
      fetchApi<{ authenticated: boolean; walletAddress: string; domain: string }>(
        "/api/auth/session"
      ),

    isCreator: () => fetchApi<{ isCreator: boolean }>("/api/auth/is-creator"),
  },

  gate: {
    status: () =>
      fetchApi<{
        hasAccess: boolean;
        hiveAmount: number;
        requiredHiveAmount: number;
        hiveUsd: number | null;
        priceUsd: number | null;
        priceMissing: boolean;
      }>("/api/gate/status"),

    checkBalance: (walletAddress: string) =>
      fetchApi<{
        hasAccess: boolean;
        hiveAmount: number;
        requiredHiveAmount: number;
        hiveUsd: number | null;
        priceUsd: number | null;
        priceMissing: boolean;
      }>(`/api/balance/${walletAddress}`),
  },

  tracks: {
    getAll: () =>
      fetchApi<
        Array<{ id: string; name: string; description: string | null }>
      >("/api/tracks"),

    getQuestions: (trackId: string) =>
      fetchApi<
        Array<{
          id: string;
          text: string;
          options: string[];
          correctIndex: number;
          complexity: number;
        }>
      >(`/api/tracks/${trackId}/questions`),
  },

  corpus: {
    getAll: (params?: {
      trackId?: string;
      search?: string;
      page?: number;
      limit?: number;
    }) => {
      const searchParams = new URLSearchParams();
      if (params?.trackId) searchParams.set("trackId", params.trackId);
      if (params?.search) searchParams.set("search", params.search);
      if (params?.page) searchParams.set("page", String(params.page));
      if (params?.limit) searchParams.set("limit", String(params.limit));
      const query = searchParams.toString();
      return fetchApi<{
        items: Array<{
          id: string;
          trackId: string | null;
          cycleId: string | null;
          title: string | null;
          normalizedText: string;
          status: "draft" | "approved" | "rejected";
          embedStatus: "not_embedded" | "queued" | "embedding" | "embedded" | "failed";
          embedError: string | null;
          embedAttempts: number;
          createdByWallet: string | null;
          approvedAt: string | null;
          createdAt: string;
        }>;
        pagination: {
          page: number;
          limit: number;
          total: number;
          totalPages: number;
        };
      }>(`/api/corpus${query ? `?${query}` : ""}`);
    },

    getStats: () =>
      fetchApi<{
        totalItems: number;
        itemsThisCycle: number;
        lastUpdated: string | null;
        currentCycleNumber: number | null;
      }>("/api/corpus/stats"),

    create: (trackId: string, text: string, sourceAttemptId?: string) =>
      fetchApi<{ id: string }>("/api/corpus", {
        method: "POST",
        body: JSON.stringify({ trackId, text, sourceAttemptId }),
      }),

    update: (id: string, data: { text?: string; trackId?: string }) =>
      fetchApi<{ id: string }>(`/api/corpus/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),

    delete: (id: string) =>
      fetchApi<{ success: boolean }>(`/api/corpus/${id}`, {
        method: "DELETE",
      }),

    getEmbedStatus: () =>
      fetchApi<{
        counts: Record<string, number>;
        failedItems: Array<{
          id: string;
          title: string | null;
          embedError: string | null;
          embedAttempts: number;
          updatedAt: string;
        }>;
        queuedItems: Array<{
          id: string;
          title: string | null;
          createdAt: string;
        }>;
        embeddingItems: Array<{
          id: string;
          title: string | null;
        }>;
      }>("/api/corpus/embed-status"),

    retryEmbed: (id: string) =>
      fetchApi<{ success: boolean; message: string }>(`/api/corpus/${id}/retry-embed`, {
        method: "POST",
      }),

    forceReembed: (id: string) =>
      fetchApi<{ success: boolean; message: string }>(`/api/corpus/${id}/force-reembed`, {
        method: "POST",
      }),
  },

  chat: {
    send: (message: string, aiLevel: number, track?: string) =>
      fetchApi<{
        id: string;
        response: string;
        corpusItemsUsed: number;
        aiLevel: number;
        track?: string;
        sources: Array<{ chunkText: string; score: number; title: string | null }>;
        isGrounded: boolean;
        usedCorpus: boolean;
        grounded: boolean;
        level: number;
        policySnapshot: {
          retrievalEnabled: boolean;
          preferCorpus: "off" | "weak" | "strong";
          topK: number;
          minScore: number;
          requireCitations: boolean;
          maxAnswerTokens: number;
          temperature: number;
          simplicityMode: boolean;
        };
      }>("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({ message, aiLevel, track }),
      }),

    getHistory: (limit?: number) =>
      fetchApi<
        Array<{
          id: string;
          userMessage: string;
          aiResponse: string;
          aiLevel: number;
          createdAt: string;
        }>
      >(`/api/ai/chat/history${limit ? `?limit=${limit}` : ""}`),
  },

  train: {
    submit: (data: {
      trackId: string;
      difficulty: string;
      content: string;
      answers: (number | string)[];
      questionIds: string[];
      startTime: number;
    }) =>
      fetchApi<{
        id: string;
        status: string;
        questionResults: Array<{ questionId: string; correct: boolean }>;
        score: {
          correctCount: number;
          total: number;
          percent: number;
        };
        autoReview: {
          decision: "approved" | "rejected" | "pending";
          message: string;
          scorePct: number;
          attemptDurationSec: number;
          styleCreditsEarned: number;
          intelligenceGain: number;
        };
        economy?: {
          feeHive: number;
          costHive: number;
          refundHive: number;
          stakeAfter: number;
        };
      }>("/api/train-attempts/submit", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },

  stake: {
    getStatus: () =>
      fetchApi<{
        stakeHive: number;
        level?: number;
        vaultAddress: string;
        mintAddress: string;
      }>("/api/stake/status"),

    getDepositInfo: () =>
      fetchApi<{
        vaultAddress: string;
        mintAddress: string;
        instructions: string;
      }>("/api/stake/deposit-info"),

    confirmDeposit: (txSignature: string, amount: number) =>
      fetchApi<{
        success: boolean;
        credited: number;
        stakeAfter: number;
      }>("/api/stake/confirm", {
        method: "POST",
        body: JSON.stringify({ txSignature, amount }),
      }),
  },

  rewards: {
    getStatus: () =>
      fetchApi<{
        pendingHive: number;
        totalSweptHive: number;
        rewardsWalletAddress: string | null;
      }>("/api/rewards/status"),
  },

  economy: {
    getConfig: () =>
      fetchApi<{
        baseFeeHive: number;
        passThreshold: number;
        fees: {
          low: number;
          medium: number;
          high: number;
          extreme: number;
        };
      }>("/api/economy/config"),
  },

  health: {
    check: () => fetchApi<{ status: string }>("/api/health"),
    ollamaCheck: () =>
      fetchApi<{ ok: boolean; baseUrl: string; model?: string; error?: string }>(
        "/api/health/ollama"
      ),
  },

  cycles: {
    getCurrent: () =>
      fetchApi<{ id: string; cycleNumber: number; isActive: boolean } | null>(
        "/api/cycles/current"
      ),
  },

  rankup: {
    getActive: () =>
      fetchApi<{
        ok: boolean;
        trial: {
          id: string;
          fromLevel: number;
          toLevel: number;
          questionCount: number;
          minAccuracy: number;
          minAvgDifficulty: number;
          startedAt: string;
          status: string;
        } | null;
      }>("/api/rankup/active"),

    start: (data: {
      currentLevel: number;
      targetLevel: number;
    }) =>
      fetchApi<{
        ok: boolean;
        trial: {
          id: string;
          fromLevel: number;
          toLevel: number;
          questionCount: number;
          minAccuracy: number;
          minAvgDifficulty: number;
          startedAt: string;
        };
        requirements: {
          walletHold: number;
          vaultStake: number;
        };
        trialStakeHive: number;
      }>("/api/rankup/start", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    getQuestions: () =>
      fetchApi<{
        ok: boolean;
        questions: Array<{
          id: string;
          text: string;
          options: string[];
          correctIndex: number;
          complexity: number;
          questionType?: "mcq" | "numeric";
          numericTolerance?: number | null;
          numericUnit?: string | null;
        }>;
        trialId: string;
      }>("/api/rankup/questions", {
        method: "POST",
      }),

    complete: (data: {
      trialId: string;
      questionIds: string[];
      answers: (number | string)[];
    }) =>
      fetchApi<{
        ok: boolean;
        result: "passed" | "failed";
        correctCount: number;
        totalCount: number;
        accuracy: number;
        avgDifficulty: number;
        newLevel?: number;
        failedReason?: string;
        failStreak?: number;
        rollbackApplied?: boolean;
      }>("/api/rankup/complete", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },

  progression: {
    getRequirements: (level: number) =>
      fetchApi<{
        ok: boolean;
        requirements: {
          level: number;
          walletHold: number;
          vaultStake: number;
        };
      }>(`/api/progression/requirements?level=${level}`),
  },
};
