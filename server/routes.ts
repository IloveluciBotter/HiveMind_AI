import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { readdir, readFile, writeFile, stat } from "fs/promises";
import { join } from "path";
import {
  issueNonce,
  consumeNonce,
  verifySignature,
  createSession,
  requireAuth as requireAuthMiddleware,
  requireHiveAccess,
  checkHiveAccess,
  requireCreator,
  isCreator,
  getPublicAppDomain,
  revokeSession,
} from "./auth";
import {
  authNonceLimiter,
  authVerifyLimiter,
  publicReadLimiter,
  chatLimiterWallet,
  chatLimiterIp,
  submitLimiter,
  corpusLimiter,
  reviewLimiter,
} from "./middleware/rateLimit";
import { createAuditHelper } from "./services/audit";
import { logger } from "./middleware/logger";
import { getFullHealth, isReady, isLive, isAiFallbackAllowed } from "./services/health";
import { captureError } from "./sentry";
import { seedDefaultTracks } from "./seed";
import { getAutoReviewConfig, computeAutoReview, calculateStyleCredits, calculateIntelligenceGain } from "./services/autoReview";

// Helper to get user ID from session (simplified - you may want to add proper auth)
function getUserId(req: Request): string | null {
  return (req as any).userId || null;
}

function requireAuth(req: Request, res: Response): string | null {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return userId;
}

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  const userId = requireAuth(req, res);
  if (!userId) return false;
  
  const user = await storage.getUser(userId);
  if (!user || !user.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return false;
  }
  return true;
}

async function requireReviewer(req: Request, res: Response): Promise<string | null> {
  const userId = requireAuth(req, res);
  if (!userId) return null;
  
  const user = await storage.getUser(userId);
  if (!user || !user.isReviewer) {
    res.status(403).json({ error: "Reviewer access required" });
    return null;
  }
  return userId;
}

// Cost calculation by difficulty
function getCostByDifficulty(difficulty: string): string {
  const costs: Record<string, string> = {
    low: "10",
    medium: "50",
    high: "200",
    extreme: "1000",
  };
  return costs[difficulty] || "10";
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Seed default tracks on startup (idempotent - won't duplicate)
  try {
    await seedDefaultTracks();
  } catch (error) {
    logger.error({ error, message: "Failed to seed default tracks" });
  }

  app.get("/api/health", async (req: Request, res: Response) => {
    try {
      const health = await getFullHealth();
      const statusCode = health.status === "down" ? 503 : 200;
      res.status(statusCode).json(health);
    } catch (error: any) {
      captureError(error, { requestId: req.requestId });
      res.status(500).json({ 
        status: "down", 
        error: error.message,
        requestId: req.requestId 
      });
    }
  });

  app.get("/api/health/ready", async (req: Request, res: Response) => {
    const ready = await isReady();
    if (ready) {
      res.status(200).json({ status: "ready" });
    } else {
      res.status(503).json({ status: "not_ready", requestId: req.requestId });
    }
  });

  app.get("/api/health/live", (req: Request, res: Response) => {
    res.status(200).json({ status: "alive" });
  });

  app.get("/api/health/ollama", async (req: Request, res: Response) => {
    try {
      const { checkOllamaHealth } = await import("./aiChat");
      const status = await checkOllamaHealth();
      res.json(status);
    } catch (error: any) {
      console.error("[Ollama] Health endpoint error:", error);
      res.json({
        ok: false,
        baseUrl: process.env.OLLAMA_BASE_URL || "(not configured)",
        model: process.env.OLLAMA_MODEL || "llama3.1:8b",
        error: error.message || "Health check failed",
      });
    }
  });

  // Ollama health check (alias endpoint)
  app.get("/api/ai/ollama/health", async (req: Request, res: Response) => {
    try {
      const { checkOllamaHealth } = await import("./aiChat");
      const status = await checkOllamaHealth();
      res.json(status);
    } catch (error: any) {
      console.error("[Ollama] Health endpoint error:", error);
      res.json({
        ok: false,
        baseUrl: process.env.OLLAMA_BASE_URL || "(not configured)",
        model: process.env.OLLAMA_MODEL || "llama3.1:8b",
        error: error.message || "Health check failed",
      });
    }
  });

  // ===== AUTHENTICATION =====
  
  // Nonce endpoint - generates a secure, single-use nonce for wallet authentication
  app.get("/api/auth/nonce", authNonceLimiter, async (req: Request, res: Response) => {
    try {
      const wallet = req.query.wallet as string;
      if (!wallet || wallet.length < 32) {
        return res.status(400).json({ error: "Valid wallet address required", code: "INVALID_WALLET" });
      }

      const { nonce, message, expiresAt } = await issueNonce(wallet);
      res.json({ nonce, message, expiresAt: expiresAt.toISOString() });
    } catch (error) {
      logger.error({ requestId: req.requestId, error: "Nonce generation error", details: error });
      res.status(500).json({ error: "Failed to generate nonce" });
    }
  });

  // Legacy challenge endpoint (redirects to nonce)
  app.get("/api/auth/challenge", authNonceLimiter, async (req: Request, res: Response) => {
    try {
      const publicKey = req.query.publicKey as string;
      if (!publicKey || publicKey.length < 32) {
        return res.status(400).json({ error: "Valid publicKey query parameter required" });
      }

      const { nonce, message, expiresAt } = await issueNonce(publicKey);
      res.json({ nonce, message, expiresAt: expiresAt.toISOString() });
    } catch (error) {
      logger.error({ requestId: req.requestId, error: "Challenge generation error", details: error });
      res.status(500).json({ error: "Failed to generate challenge" });
    }
  });

  const verifySchema = z.object({
    wallet: z.string().min(32).optional(),
    publicKey: z.string().min(32).optional(),
    signature: z.string(),
    nonce: z.string(),
  }).refine((data) => data.wallet || data.publicKey, {
    message: "Either wallet or publicKey is required",
  });

  app.post("/api/auth/verify", authVerifyLimiter, async (req: Request, res: Response) => {
    const audit = createAuditHelper(req);
    try {
      const body = verifySchema.parse(req.body);
      const walletAddress = body.wallet || body.publicKey!;

      // Consume nonce (single-use, validates expiry)
      const nonceResult = await consumeNonce(walletAddress, body.nonce);
      if (!nonceResult.valid || !nonceResult.message) {
        await audit.log("login_failure", {
          targetType: "session",
          metadata: { reason: "invalid_nonce", wallet: walletAddress },
          overrideWallet: walletAddress,
        });
        return res.status(400).json({ 
          error: nonceResult.error || "Invalid or expired nonce",
          code: "INVALID_NONCE"
        });
      }

      // Verify signature against the exact server-generated message
      const isValid = await verifySignature(walletAddress, body.signature, nonceResult.message);
      if (!isValid) {
        await audit.log("login_failure", {
          targetType: "session",
          metadata: { reason: "invalid_signature", wallet: walletAddress },
          overrideWallet: walletAddress,
        });
        return res.status(401).json({ error: "Invalid signature", code: "INVALID_SIGNATURE" });
      }

      // Create server-side session
      const { sessionToken, expiresAt } = await createSession(walletAddress);

      // Set httpOnly cookie with raw session token
      res.cookie("sid", sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: "/",
      });

      await audit.log("login_success", {
        targetType: "session",
        overrideWallet: walletAddress,
      });

      res.json({ ok: true, expiresAt: expiresAt.toISOString() });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors, code: "VALIDATION_ERROR" });
      }
      logger.error({ requestId: req.requestId, error: "Auth verify error", details: error });
      res.status(500).json({ error: "Failed to verify authentication" });
    }
  });

  // Logout endpoint
  app.post("/api/auth/logout", requireAuthMiddleware, async (req: Request, res: Response) => {
    const audit = createAuditHelper(req);
    try {
      const sessionId = (req as any).sessionId;
      if (sessionId) {
        await revokeSession(sessionId);
      }
      await audit.log("logout", { targetType: "session" });
      res.clearCookie("sid", { path: "/" });
      res.json({ ok: true });
    } catch (error) {
      logger.error({ requestId: req.requestId, error: "Logout error", details: error });
      res.status(500).json({ error: "Failed to logout" });
    }
  });

  // Session status endpoint
  app.get("/api/auth/session", requireAuthMiddleware, (req: Request, res: Response) => {
    const walletAddress = (req as any).walletAddress;
    res.json({ 
      authenticated: true, 
      walletAddress,
      domain: getPublicAppDomain()
    });
  });

  // ===== GATE STATUS =====
  app.get("/api/gate/status", requireAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const publicKey = (req as any).publicKey;
      const access = await checkHiveAccess(publicKey);
      res.json(access);
    } catch (error) {
      console.error("Gate status error:", error);
      res.status(500).json({ error: "Failed to check gate status" });
    }
  });

  // Public balance check (no auth required - used by client before full auth)
  app.get("/api/balance/:walletAddress", async (req: Request, res: Response) => {
    try {
      const { walletAddress } = req.params;
      if (!walletAddress || walletAddress.length < 32) {
        return res.status(400).json({ error: "Invalid wallet address" });
      }
      const access = await checkHiveAccess(walletAddress);
      res.json(access);
    } catch (error) {
      console.error("Balance check error:", error);
      res.status(500).json({ error: "Failed to check balance" });
    }
  });

  // ===== TRACKS & QUESTIONS =====
  app.get("/api/tracks", publicReadLimiter, async (req: Request, res: Response) => {
    try {
      const tracks = await storage.getAllTracks();
      res.json(tracks);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tracks" });
    }
  });

  app.get("/api/tracks/:trackId/questions", publicReadLimiter, async (req: Request, res: Response) => {
    try {
      const questions = await storage.getQuestionsByTrack(req.params.trackId);
      res.json(questions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch questions" });
    }
  });

  app.get("/api/benchmark-questions", publicReadLimiter, async (req: Request, res: Response) => {
    try {
      const questions = await storage.getBenchmarkQuestions();
      res.json(questions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch benchmark questions" });
    }
  });

  // ===== ADMIN: TRACK MANAGEMENT =====
  app.post("/api/tracks", requireAuthMiddleware, requireCreator, async (req: Request, res: Response) => {
    const audit = createAuditHelper(req);
    try {
      const { name, description } = req.body;
      if (!name || typeof name !== "string") {
        return res.status(400).json({ error: "Track name is required" });
      }
      
      const track = await storage.createTrack(name, description);
      
      await audit.log("admin_action", {
        targetType: "track",
        targetId: track.id,
        metadata: { action: "create", name, description },
      });
      
      logger.info({ trackId: track.id, trackName: name, message: "Track created by admin" });
      res.status(201).json(track);
    } catch (error: any) {
      logger.error({ error: error.message, message: "Failed to create track" });
      res.status(500).json({ error: "Failed to create track" });
    }
  });

  app.put("/api/tracks/:id", requireAuthMiddleware, requireCreator, async (req: Request, res: Response) => {
    const audit = createAuditHelper(req);
    try {
      const { id } = req.params;
      const { name, description } = req.body;
      
      if (!name || typeof name !== "string") {
        return res.status(400).json({ error: "Track name is required" });
      }
      
      const existingTrack = await storage.getTrack(id);
      if (!existingTrack) {
        return res.status(404).json({ error: "Track not found" });
      }
      
      const track = await storage.updateTrack(id, name, description);
      
      await audit.log("admin_action", {
        targetType: "track",
        targetId: id,
        metadata: { 
          action: "update", 
          oldName: existingTrack.name, 
          newName: name,
          oldDescription: existingTrack.description,
          newDescription: description,
        },
      });
      
      logger.info({ trackId: id, trackName: name, message: "Track updated by admin" });
      res.json(track);
    } catch (error: any) {
      logger.error({ error: error.message, message: "Failed to update track" });
      res.status(500).json({ error: "Failed to update track" });
    }
  });

  app.delete("/api/tracks/:id", requireAuthMiddleware, requireCreator, async (req: Request, res: Response) => {
    const audit = createAuditHelper(req);
    try {
      const { id } = req.params;
      
      const existingTrack = await storage.getTrack(id);
      if (!existingTrack) {
        return res.status(404).json({ error: "Track not found" });
      }
      
      const deleted = await storage.deleteTrack(id);
      
      if (deleted) {
        await audit.log("admin_action", {
          targetType: "track",
          targetId: id,
          metadata: { action: "delete", name: existingTrack.name },
        });
        
        logger.info({ trackId: id, trackName: existingTrack.name, message: "Track deleted by admin" });
        res.json({ success: true, message: "Track deleted" });
      } else {
        res.status(500).json({ error: "Failed to delete track" });
      }
    } catch (error: any) {
      logger.error({ error: error.message, message: "Failed to delete track" });
      res.status(500).json({ error: "Failed to delete track" });
    }
  });

  // ===== CYCLES =====
  app.get("/api/cycles/current", publicReadLimiter, async (req: Request, res: Response) => {
    try {
      const cycle = await storage.getCurrentCycle();
      res.json(cycle);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch current cycle" });
    }
  });

  app.post("/api/cycles/rollover", requireAuthMiddleware, requireCreator, async (req: Request, res: Response) => {
    const audit = createAuditHelper(req);
    try {
      const currentCycle = await storage.getCurrentCycle();
      const nextCycleNumber = currentCycle ? currentCycle.cycleNumber + 1 : 1;
      
      // End current cycle
      if (currentCycle) {
        await storage.endCycle(currentCycle.id);
      }
      
      // Create new cycle
      const newCycle = await storage.createCycle(nextCycleNumber);
      
      // Unlock locks from 4 cycles ago
      await storage.unlockLocksForCycle(nextCycleNumber);
      
      // Process phrase mining (phrases with ≥50 mentions)
      const phrases = await storage.getPhrasesByMentions(50);
      await storage.resetPhraseCounts(nextCycleNumber);
      
      // Create model version from last 4 cycles
      const last4Cycles = [];
      for (let i = 0; i < 4; i++) {
        const cycle = await storage.getCycleByNumber(nextCycleNumber - 1 - i);
        if (cycle) last4Cycles.push(cycle.cycleNumber);
      }
      
      const approvedAttempts = await storage.getApprovedAttemptsForCycles(last4Cycles);
      const newModel = await storage.createModelVersion(newCycle.id, approvedAttempts.length);
      
      // Run benchmark
      const previousModel = await storage.getActiveModelVersion();
      const benchmarkQuestions = await storage.getBenchmarkQuestions();
      // Simulate benchmark score (in real implementation, run actual model)
      const score = (85 + Math.random() * 10).toFixed(2);
      const previousScore = previousModel ? "90.00" : null;
      
      const benchmark = await storage.createBenchmark({
        modelVersionId: newModel.id,
        previousModelVersionId: previousModel?.id || undefined,
        score,
        previousScore: previousScore || undefined,
      });
      
      // Check for rollback (score drop ≥10%)
      if (previousScore) {
        const scoreDrop = parseFloat(previousScore) - parseFloat(score);
        if (scoreDrop >= 10) {
          await storage.updateBenchmarkRollback(benchmark.id, true, newCycle.id);
          await storage.deactivateAllModelVersions();
          // Reactivate previous model
          if (previousModel) {
            await storage.activateModelVersion(previousModel.id);
          }
        } else {
          await storage.activateModelVersion(newModel.id);
        }
      } else {
        await storage.activateModelVersion(newModel.id);
      }
      
      await audit.log("cycle_rollover", {
        targetType: "cycle",
        targetId: newCycle.id,
        metadata: { 
          previousCycleId: currentCycle?.id, 
          cycleNumber: nextCycleNumber,
          modelVersionId: newModel.id,
        },
      });
      
      res.json({ cycle: newCycle, model: newModel, benchmark });
    } catch (error) {
      logger.error({ requestId: req.requestId, error: "Cycle rollover error", details: error });
      res.status(500).json({ error: "Failed to rollover cycle" });
    }
  });

  // ===== TRAINING CORPUS =====
  // Text normalization helper
  function normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Get corpus items with pagination, filtering, search (requires HIVE access)
  app.get("/api/corpus", requireAuthMiddleware, requireHiveAccess, async (req: Request, res: Response) => {
    try {
      const { trackId, cycleId, search, page = "1", limit = "50" } = req.query;
      const pageNum = parseInt(page as string, 10);
      const limitNum = Math.min(parseInt(limit as string, 10), 100);
      
      let items = await storage.getAllCorpusItems();
      
      // Filter by track
      if (trackId && typeof trackId === 'string') {
        items = items.filter(item => item.trackId === trackId);
      }
      
      // Filter by cycle
      if (cycleId && typeof cycleId === 'string') {
        items = items.filter(item => item.cycleId === cycleId);
      }
      
      // Search by keyword
      if (search && typeof search === 'string') {
        const searchLower = search.toLowerCase();
        items = items.filter(item => 
          item.normalizedText.toLowerCase().includes(searchLower)
        );
      }
      
      // Pagination
      const total = items.length;
      const totalPages = Math.ceil(total / limitNum);
      const offset = (pageNum - 1) * limitNum;
      const paginatedItems = items.slice(offset, offset + limitNum);
      
      res.json({
        items: paginatedItems,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages,
        },
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch corpus items" });
    }
  });

  // Get corpus stats (requires HIVE access)
  app.get("/api/corpus/stats", requireAuthMiddleware, requireHiveAccess, async (req: Request, res: Response) => {
    try {
      const stats = await storage.getCorpusStats();
      const currentCycle = await storage.getCurrentCycle();
      
      // Get items this cycle
      let itemsThisCycle = 0;
      if (currentCycle) {
        const allItems = await storage.getAllCorpusItems();
        itemsThisCycle = allItems.filter(item => item.cycleId === currentCycle.id).length;
      }
      
      // Get last updated
      const allItems = await storage.getAllCorpusItems();
      const lastUpdated = allItems.length > 0 ? allItems[0].createdAt : null;
      
      res.json({
        ...stats,
        itemsThisCycle,
        lastUpdated,
        currentCycleId: currentCycle?.id,
        currentCycleNumber: currentCycle?.cycleNumber,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch corpus stats" });
    }
  });

  // Add corpus item (Creator only)
  const addCorpusItemSchema = z.object({
    trackId: z.string(),
    text: z.string().min(1),
    sourceAttemptId: z.string().optional(),
  });

  app.post("/api/corpus", requireAuthMiddleware, requireCreator, corpusLimiter, async (req: Request, res: Response) => {
    const audit = createAuditHelper(req);
    try {
      const body = addCorpusItemSchema.parse(req.body);
      const currentCycle = await storage.getCurrentCycle();
      if (!currentCycle) {
        return res.status(400).json({ error: "No active cycle" });
      }
      
      // Normalize the text
      const normalizedText = normalizeText(body.text);
      
      const item = await storage.addCorpusItem({
        trackId: body.trackId,
        cycleId: currentCycle.id,
        normalizedText,
        sourceAttemptId: body.sourceAttemptId,
      });
      
      await audit.log("corpus_item_added", {
        targetType: "corpus_item",
        targetId: item.id,
        metadata: { trackId: body.trackId, cycleId: currentCycle.id },
      });
      
      res.json(item);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      logger.error({ requestId: req.requestId, error: "Add corpus item error", details: error });
      res.status(500).json({ error: "Failed to add corpus item" });
    }
  });

  // Update corpus item (Creator only)
  const updateCorpusItemSchema = z.object({
    text: z.string().optional(),
    trackId: z.string().optional(),
  });

  app.put("/api/corpus/:id", requireAuthMiddleware, requireCreator, corpusLimiter, async (req: Request, res: Response) => {
    const audit = createAuditHelper(req);
    try {
      const body = updateCorpusItemSchema.parse(req.body);
      
      if (!body.text && !body.trackId) {
        return res.status(400).json({ error: "text or trackId required" });
      }
      
      // Normalize text if provided and validate it's not empty after normalization
      let normalizedText: string | undefined;
      if (body.text) {
        normalizedText = normalizeText(body.text);
        if (!normalizedText || normalizedText.length === 0) {
          return res.status(400).json({ error: "Text cannot be empty after normalization" });
        }
      }
      
      // Ensure we have at least one valid update
      if (!normalizedText && !body.trackId) {
        return res.status(400).json({ error: "No valid updates provided" });
      }
      
      const item = await storage.updateCorpusItem(req.params.id, normalizedText, body.trackId);
      if (!item) {
        return res.status(404).json({ error: "Corpus item not found" });
      }
      
      if (normalizedText && item.status === "approved") {
        const { checkAndQueueOnEdit } = await import("./services/embedWorker");
        const requeued = await checkAndQueueOnEdit(req.params.id, item.title, normalizedText);
        if (requeued) {
          logger.info({ requestId: req.requestId, corpusItemId: req.params.id, message: "Content changed, re-queued for embedding" });
        }
      }
      
      await audit.log("corpus_item_updated", {
        targetType: "corpus_item",
        targetId: req.params.id,
        metadata: { trackId: body.trackId },
      });
      
      res.json(item);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      logger.error({ requestId: req.requestId, error: "Update corpus item error", details: error });
      res.status(500).json({ error: "Failed to update corpus item" });
    }
  });

  // Delete corpus item (Creator only)
  app.delete("/api/corpus/:id", requireAuthMiddleware, requireCreator, corpusLimiter, async (req: Request, res: Response) => {
    const audit = createAuditHelper(req);
    try {
      await audit.log("corpus_item_deleted", {
        targetType: "corpus_item",
        targetId: req.params.id,
      });
      await storage.deleteCorpusItem(req.params.id);
      res.json({ success: true });
    } catch (error) {
      logger.error({ requestId: req.requestId, error: "Delete corpus item error", details: error });
      res.status(500).json({ error: "Failed to delete corpus item" });
    }
  });

  // Check if current user is creator
  app.get("/api/auth/is-creator", requireAuthMiddleware, (req: Request, res: Response) => {
    const publicKey = (req as any).publicKey;
    res.json({ isCreator: isCreator(publicKey) });
  });

  // ===== RAG SEARCH =====
  const ragSearchSchema = z.object({
    query: z.string().min(1).max(2000),
    k: z.number().int().min(1).max(20).optional(),
    trackId: z.string().optional(),
  });

  app.post("/api/rag/search", requireAuthMiddleware, requireHiveAccess, async (req: Request, res: Response) => {
    try {
      const body = ragSearchSchema.parse(req.body);
      const { searchCorpus, getRAGConfig } = await import("./services/rag");
      const config = getRAGConfig();
      
      const k = body.k || config.defaultK;
      const results = await searchCorpus(body.query, k, body.trackId);
      
      res.json({
        query: body.query,
        k,
        trackId: body.trackId || null,
        results: results.map(r => ({
          corpusItemId: r.corpusItemId,
          chunkText: r.chunkText,
          score: r.score,
          title: r.title,
        })),
        totalResults: results.length,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      logger.error({ requestId: req.requestId, error: "RAG search error", details: error });
      res.status(500).json({ error: "Failed to search corpus" });
    }
  });

  // Embed a corpus item (admin only)
  app.post("/api/rag/embed/:id", requireAuthMiddleware, requireCreator, async (req: Request, res: Response) => {
    try {
      const { embedCorpusItem } = await import("./services/rag");
      const chunksCreated = await embedCorpusItem(req.params.id);
      res.json({ success: true, chunksCreated });
    } catch (error: any) {
      logger.error({ requestId: req.requestId, error: "Embedding error", details: error.message });
      res.status(500).json({ error: error.message || "Failed to embed corpus item" });
    }
  });

  // Approve corpus item and auto-embed (admin only)
  app.post("/api/corpus/:id/approve", requireAuthMiddleware, requireCreator, async (req: Request, res: Response) => {
    const audit = createAuditHelper(req);
    try {
      const { approveCorpusItem } = await import("./services/rag");
      const success = await approveCorpusItem(req.params.id);
      
      if (!success) {
        return res.status(404).json({ error: "Corpus item not found" });
      }
      
      await audit.log("corpus_item_approved", {
        targetType: "corpus_item",
        targetId: req.params.id,
      });
      
      res.json({ success: true, message: "Corpus item approved and queued for embedding" });
    } catch (error: any) {
      logger.error({ requestId: req.requestId, error: "Approval error", details: error.message });
      res.status(500).json({ error: "Failed to approve corpus item" });
    }
  });

  // ===== EMBED STATUS ADMIN ENDPOINTS =====

  app.get("/api/corpus/embed-status", requireAuthMiddleware, requireCreator, async (req: Request, res: Response) => {
    try {
      const { getEmbedStatusSummary, getItemsByEmbedStatus } = await import("./services/embedWorker");
      const summary = await getEmbedStatusSummary();
      
      const status = req.query.status as string | undefined;
      let items: any[] = [];
      
      if (status && ["not_embedded", "queued", "embedding", "embedded", "failed"].includes(status)) {
        items = await getItemsByEmbedStatus(status as any);
      }
      
      res.json({ summary, items });
    } catch (error: any) {
      logger.error({ requestId: req.requestId, error: "Embed status error", details: error.message });
      res.status(500).json({ error: "Failed to get embed status" });
    }
  });

  app.post("/api/corpus/:id/retry-embed", requireAuthMiddleware, requireCreator, async (req: Request, res: Response) => {
    const audit = createAuditHelper(req);
    try {
      const { retryEmbedding } = await import("./services/embedWorker");
      await retryEmbedding(req.params.id);
      
      await audit.log("corpus_embed_retry", {
        targetType: "corpus_item",
        targetId: req.params.id,
      });
      
      res.json({ success: true, message: "Corpus item reset for retry" });
    } catch (error: any) {
      logger.error({ requestId: req.requestId, error: "Retry embed error", details: error.message });
      res.status(400).json({ error: error.message || "Failed to retry embedding" });
    }
  });

  app.post("/api/corpus/:id/force-reembed", requireAuthMiddleware, requireCreator, async (req: Request, res: Response) => {
    const audit = createAuditHelper(req);
    try {
      const { forceReembed } = await import("./services/embedWorker");
      await forceReembed(req.params.id);
      
      await audit.log("corpus_force_reembed", {
        targetType: "corpus_item",
        targetId: req.params.id,
      });
      
      res.json({ success: true, message: "Corpus item queued for re-embedding, old chunks cleared" });
    } catch (error: any) {
      logger.error({ requestId: req.requestId, error: "Force re-embed error", details: error.message });
      res.status(400).json({ error: error.message || "Failed to force re-embed" });
    }
  });

  // ===== AI CHAT =====
  const chatMessageSchema = z.object({
    message: z.string().min(1).max(2000),
    track: z.string().optional(),
    aiLevel: z.number().int().min(1).max(100),
  });

  app.post("/api/ai/chat", requireAuthMiddleware, requireHiveAccess, chatLimiterWallet, chatLimiterIp, async (req: Request, res: Response) => {
    try {
      const body = chatMessageSchema.parse(req.body);
      const publicKey = (req as any).publicKey;
      
      // Validate aiLevel server-side: clamp to reasonable range (1-100)
      // In a production system, this would be fetched from stored user progress
      const aiLevel = Math.max(1, Math.min(100, body.aiLevel));
      
      // Look up trackId if track name provided
      let trackId: string | undefined;
      if (body.track) {
        const tracks = await storage.getAllTracks();
        const matchedTrack = tracks.find(t => t.name.toLowerCase() === body.track!.toLowerCase());
        trackId = matchedTrack?.id;
      }
      
      // Generate response using Ollama
      const { generateChatResponse } = await import("./aiChat");
      
      let response: string;
      let corpusItemsUsed: string[];
      
      let sources: Array<{ chunkText: string; score: number; title: string | null }> = [];
      let isGrounded = false;
      
      try {
        const result = await generateChatResponse(
          body.message,
          aiLevel,
          trackId
        );
        response = result.response;
        corpusItemsUsed = result.corpusItemsUsed;
        sources = result.sources;
        isGrounded = result.isGrounded;
      } catch (error: any) {
        logger.error({ requestId: req.requestId, error: "[AI Chat] Ollama error", details: error.message });
        captureError(error, { requestId: req.requestId, walletAddress: publicKey });
        
        if (!isAiFallbackAllowed()) {
          return res.status(503).json({ 
            error: "ai_unavailable",
            message: "AI service is offline",
            requestId: req.requestId
          });
        }
        
        response = `[Development Mode] AI service is currently offline. Your message was: "${body.message.slice(0, 100)}${body.message.length > 100 ? '...' : ''}"`;
        corpusItemsUsed = [];
        logger.warn({ requestId: req.requestId, message: "Using fallback AI response in development mode" });
      }
      
      // Save to chat history
      const chatMessage = await storage.saveChatMessage({
        walletAddress: publicKey,
        trackId,
        aiLevel: body.aiLevel,
        userMessage: body.message,
        aiResponse: response,
        corpusItemsUsed,
      });
      
      res.json({
        id: chatMessage.id,
        response,
        corpusItemsUsed: corpusItemsUsed.length,
        aiLevel,
        track: body.track,
        sources,
        isGrounded,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      logger.error({ requestId: req.requestId, error: "AI chat error", details: error });
      res.status(500).json({ error: "Failed to generate response" });
    }
  });

  app.get("/api/ai/chat/history", requireAuthMiddleware, requireHiveAccess, async (req: Request, res: Response) => {
    try {
      const publicKey = (req as any).publicKey;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      
      const history = await storage.getChatHistory(publicKey, limit);
      res.json(history);
    } catch (error) {
      console.error("Chat history error:", error);
      res.status(500).json({ error: "Failed to fetch chat history" });
    }
  });

  // ===== STAKE ECONOMY =====
  const { getEconomyConfig, getFeeForDifficulty, calculateFeeSettlement } = await import("./services/economy");

  app.get("/api/stake/status", requireAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const publicKey = (req as any).publicKey;
      const balance = await storage.getOrCreateWalletBalance(publicKey);
      const config = getEconomyConfig();
      
      res.json({
        stakeHive: parseFloat(balance.trainingStakeHive),
        vaultAddress: config.vaultAddress,
        mintAddress: config.mintAddress,
      });
    } catch (error) {
      logger.error({ requestId: req.requestId, error: "Stake status error", details: error });
      res.status(500).json({ error: "Failed to get stake status" });
    }
  });

  app.get("/api/stake/deposit-info", requireAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const config = getEconomyConfig();
      
      res.json({
        vaultAddress: config.vaultAddress,
        mintAddress: config.mintAddress,
        instructions: "Send HIVE tokens to the vault address, then call POST /api/stake/confirm with the transaction signature",
      });
    } catch (error) {
      logger.error({ requestId: req.requestId, error: "Deposit info error", details: error });
      res.status(500).json({ error: "Failed to get deposit info" });
    }
  });

  const confirmDepositSchema = z.object({
    txSignature: z.string().min(32).max(128),
    amount: z.number().positive(),
  });

  app.post("/api/stake/confirm", requireAuthMiddleware, async (req: Request, res: Response) => {
    const audit = createAuditHelper(req);
    try {
      const publicKey = (req as any).publicKey;
      const body = confirmDepositSchema.parse(req.body);
      const config = getEconomyConfig();
      
      const existingEntry = await storage.getStakeLedgerByTxSignature(body.txSignature);
      if (existingEntry) {
        return res.status(409).json({ 
          error: "duplicate_deposit", 
          message: "This transaction has already been credited" 
        });
      }
      
      const { verifyDeposit } = await import("./services/solanaVerify");
      const verification = await verifyDeposit(
        body.txSignature,
        config.vaultAddress,
        config.mintAddress,
        body.amount,
        publicKey
      );
      
      if (!verification.valid) {
        logger.warn({
          requestId: req.requestId,
          error: "Deposit verification failed",
          reason: verification.error,
          txSignature: body.txSignature,
          claimedAmount: body.amount,
        });
        return res.status(400).json({
          error: "verification_failed",
          message: verification.error || "Could not verify deposit on chain",
        });
      }
      
      const verifiedAmount = verification.verifiedAmount || body.amount;
      
      const balance = await storage.getOrCreateWalletBalance(publicKey);
      const currentStake = parseFloat(balance.trainingStakeHive);
      const newStake = currentStake + verifiedAmount;
      const newStakeStr = newStake.toFixed(8);
      
      await storage.updateStakeBalance(publicKey, newStakeStr);
      
      await storage.createStakeLedgerEntry({
        walletAddress: publicKey,
        txSignature: body.txSignature,
        amount: verifiedAmount.toFixed(8),
        balanceAfter: newStakeStr,
        reason: "deposit",
        metadata: { 
          fromTx: body.txSignature,
          sender: verification.sender,
          verified: true,
        },
      });
      
      await audit.log("deposit_confirmed", {
        targetType: "stake",
        metadata: { 
          txSignature: body.txSignature, 
          amount: verifiedAmount, 
          newStake,
          sender: verification.sender,
        },
      });
      
      res.json({
        success: true,
        credited: verifiedAmount,
        stakeAfter: newStake,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      logger.error({ requestId: req.requestId, error: "Confirm deposit error", details: error });
      res.status(500).json({ error: "Failed to confirm deposit" });
    }
  });

  app.get("/api/rewards/status", requireAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const pool = await storage.getRewardsPool();
      const config = getEconomyConfig();
      
      res.json({
        pendingHive: parseFloat(pool.pendingHive),
        totalSweptHive: parseFloat(pool.totalSweptHive),
        rewardsWalletAddress: pool.rewardsWalletAddress || config.rewardsWalletAddress,
      });
    } catch (error) {
      logger.error({ requestId: req.requestId, error: "Rewards status error", details: error });
      res.status(500).json({ error: "Failed to get rewards status" });
    }
  });

  app.get("/api/economy/config", requireAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const config = getEconomyConfig();
      
      res.json({
        baseFeeHive: config.baseFeeHive,
        passThreshold: config.passThreshold,
        fees: {
          low: getFeeForDifficulty("low"),
          medium: getFeeForDifficulty("medium"),
          high: getFeeForDifficulty("high"),
          extreme: getFeeForDifficulty("extreme"),
        },
      });
    } catch (error) {
      logger.error({ requestId: req.requestId, error: "Economy config error", details: error });
      res.status(500).json({ error: "Failed to get economy config" });
    }
  });

  // ===== TRAIN ATTEMPTS =====
  const submitAttemptSchema = z.object({
    trackId: z.string(),
    difficulty: z.enum(["low", "medium", "high", "extreme"]),
    content: z.string().min(1),
    answers: z.array(z.number()).optional(),
    correctAnswers: z.array(z.number()).optional(),
    questionIds: z.array(z.string()).optional(),
    startTime: z.number().optional(),
    levelAtTime: z.number().optional(),
  });

  app.post("/api/train-attempts/submit", requireAuthMiddleware, requireHiveAccess, submitLimiter, async (req: Request, res: Response) => {
    const audit = createAuditHelper(req);
    const publicKey = (req as any).publicKey;
    if (!publicKey) {
      return res.status(401).json({ error: "Wallet address required" });
    }
    
    try {
      const body = submitAttemptSchema.parse(req.body);
      const currentCycle = await storage.getCurrentCycle();
      if (!currentCycle) {
        return res.status(400).json({ error: "No active cycle" });
      }
      
      const feeHive = getFeeForDifficulty(body.difficulty);
      
      const balance = await storage.getOrCreateWalletBalance(publicKey);
      const currentStake = parseFloat(balance.trainingStakeHive);
      
      if (currentStake < feeHive) {
        return res.status(402).json({ 
          error: "insufficient_stake",
          message: `Insufficient stake. Required: ${feeHive} HIVE, Available: ${currentStake} HIVE`,
          required: feeHive,
          available: currentStake,
        });
      }
      
      const stakeAfterReserve = currentStake - feeHive;
      await storage.updateStakeBalance(publicKey, stakeAfterReserve.toFixed(8));
      
      const cost = getCostByDifficulty(body.difficulty);
      
      // Calculate score and duration
      let scorePct = 0;
      let attemptDurationSec = 0;
      
      if (body.answers && body.correctAnswers && body.answers.length > 0) {
        const correctCount = body.answers.reduce((count, answer, idx) => {
          return count + (answer === body.correctAnswers![idx] ? 1 : 0);
        }, 0);
        scorePct = correctCount / body.answers.length;
      }
      
      if (body.startTime) {
        attemptDurationSec = Math.floor((Date.now() - body.startTime) / 1000);
      }
      
      // Generate evidence packet
      const evidencePacket = {
        phrases: [],
        topics: [],
        timestamp: new Date().toISOString(),
        answersGiven: body.answers || [],
        correctAnswers: body.correctAnswers || [],
        scorePct,
        attemptDurationSec,
      };
      
      await storage.createStakeLedgerEntry({
        walletAddress: publicKey,
        amount: (-feeHive).toFixed(8),
        balanceAfter: stakeAfterReserve.toFixed(8),
        reason: "fee_reserve",
        metadata: { difficulty: body.difficulty, feeHive },
      });
      
      await audit.log("fee_reserved", {
        targetType: "stake",
        metadata: { feeHive, stakeAfterReserve },
      });
      
      // Create the attempt
      const attempt = await storage.createTrainAttempt({
        userId: publicKey,
        trackId: body.trackId,
        difficulty: body.difficulty,
        cost,
        content: body.content,
        cycleId: currentCycle.id,
        scorePct: scorePct.toFixed(4),
        attemptDurationSec,
      });
      
      await audit.log("submission_created", {
        targetType: "submission",
        targetId: attempt.id,
        metadata: { trackId: body.trackId, difficulty: body.difficulty, cycleId: currentCycle.id, feeHive },
      });
      
      // Apply auto-review logic
      const autoReviewConfig = getAutoReviewConfig();
      const reviewResult = computeAutoReview(scorePct, attemptDurationSec, autoReviewConfig);
      
      // Update attempt with auto-review result
      const updatedAttempt = await storage.updateAttemptAutoReview(attempt.id, {
        status: reviewResult.decision,
        scorePct: scorePct.toFixed(4),
        attemptDurationSec,
        autoReviewedAt: reviewResult.autoReviewedAt,
        evidencePacket,
      });
      
      // Calculate fee settlement based on score
      const economyConfig = getEconomyConfig();
      const passed = scorePct >= economyConfig.passThreshold;
      const feeSettlement = calculateFeeSettlement(feeHive, scorePct, passed);
      
      // Refund portion back to stake
      let stakeAfter = stakeAfterReserve;
      if (feeSettlement.refundHive > 0) {
        stakeAfter = stakeAfterReserve + feeSettlement.refundHive;
        await storage.updateStakeBalance(publicKey, stakeAfter.toFixed(8));
        
        await storage.createStakeLedgerEntry({
          walletAddress: publicKey,
          amount: feeSettlement.refundHive.toFixed(8),
          balanceAfter: stakeAfter.toFixed(8),
          reason: "fee_refund",
          attemptId: attempt.id,
          metadata: { scorePct, refundHive: feeSettlement.refundHive },
        });
        
        await audit.log("fee_refunded", {
          targetType: "stake",
          targetId: attempt.id,
          metadata: { refundHive: feeSettlement.refundHive, scorePct, stakeAfter },
        });
      }
      
      // Route cost to rewards pool
      if (feeSettlement.costHive > 0) {
        await storage.addToRewardsPool(feeSettlement.costHive.toFixed(8));
        
        await storage.createStakeLedgerEntry({
          walletAddress: publicKey,
          amount: (-feeSettlement.costHive).toFixed(8),
          balanceAfter: stakeAfter.toFixed(8),
          reason: "fee_cost_to_rewards",
          attemptId: attempt.id,
          metadata: { costHive: feeSettlement.costHive, scorePct },
        });
        
        await audit.log("fee_routed_to_rewards", {
          targetType: "rewards_pool",
          targetId: attempt.id,
          metadata: { costHive: feeSettlement.costHive, scorePct },
        });
      }
      
      // Calculate rewards if approved
      let styleCreditsEarned = 0;
      let intelligenceGain = 0;
      
      if (reviewResult.decision === "approved") {
        styleCreditsEarned = calculateStyleCredits(scorePct, body.difficulty);
        intelligenceGain = calculateIntelligenceGain(scorePct, body.difficulty);
      }
      
      // Log audit based on decision
      const auditAction = reviewResult.decision === "approved" 
        ? "auto_review_approved" 
        : reviewResult.decision === "rejected" 
          ? "auto_review_rejected" 
          : "auto_review_pending";
      
      await audit.log(auditAction, {
        targetType: "submission",
        targetId: attempt.id,
        metadata: { 
          trackId: body.trackId, 
          difficulty: body.difficulty, 
          cycleId: currentCycle.id,
          scorePct,
          attemptDurationSec,
          feeHive,
          costHive: feeSettlement.costHive,
          refundHive: feeSettlement.refundHive,
        },
      });
      
      // Log answer events for telemetry (only if all arrays have matching lengths)
      if (body.answers && body.questionIds && 
          body.questionIds.length === body.answers.length &&
          body.answers.length > 0) {
        try {
          const answerEvents = body.answers.map((answer, idx) => ({
            walletAddress: publicKey,
            attemptId: attempt.id,
            trackId: body.trackId,
            questionId: body.questionIds![idx],
            selectedAnswer: answer,
            isCorrect: body.correctAnswers ? answer === body.correctAnswers[idx] : false,
            scorePct: scorePct.toFixed(4),
            attemptDurationSec,
            levelAtTime: body.levelAtTime,
            autoDecision: reviewResult.decision,
            cycleNumber: currentCycle.cycleNumber,
          }));
          
          const loggedCount = await storage.createAnswerEventsBatch(answerEvents);
          
          await audit.log("answer_events_logged", {
            targetType: "answer_event",
            targetId: attempt.id,
            metadata: { count: loggedCount, trackId: body.trackId },
          });
        } catch (telemetryError) {
          // Log error but don't fail the submission
          logger.error({
            requestId: req.requestId,
            error: "Failed to log answer events",
            details: telemetryError,
          });
        }
      }
      
      res.json({
        ...updatedAttempt,
        autoReview: {
          decision: reviewResult.decision,
          message: reviewResult.message,
          scorePct,
          attemptDurationSec,
          styleCreditsEarned,
          intelligenceGain,
        },
        economy: {
          feeHive,
          costHive: feeSettlement.costHive,
          refundHive: feeSettlement.refundHive,
          stakeAfter,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      logger.error({ requestId: req.requestId, error: "Submit attempt error", details: error });
      res.status(500).json({ error: "Failed to submit attempt" });
    }
  });

  app.get("/api/train-attempts/pending", async (req: Request, res: Response) => {
    if (!(await requireReviewer(req, res))) return;
    
    try {
      const attempts = await storage.getPendingAttempts();
      res.json(attempts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pending attempts" });
    }
  });

  app.get("/api/train-attempts/:id", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    
    try {
      const attempt = await storage.getAttemptById(req.params.id);
      if (!attempt) {
        return res.status(404).json({ error: "Attempt not found" });
      }
      
      // Users can only see their own attempts, reviewers can see all
      const user = await storage.getUser(userId);
      if (attempt.userId !== userId && !user?.isReviewer) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      res.json(attempt);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch attempt" });
    }
  });

  // ===== REVIEWS =====
  const submitReviewSchema = z.object({
    attemptId: z.string(),
    vote: z.enum(["approve", "reject"]),
  });

  app.post("/api/reviews/submit", reviewLimiter, async (req: Request, res: Response) => {
    const audit = createAuditHelper(req);
    const reviewerId = await requireReviewer(req, res);
    if (!reviewerId) return;
    
    try {
      const body = submitReviewSchema.parse(req.body);
      
      // Check if already voted
      const hasVoted = await storage.hasReviewerVoted(body.attemptId, reviewerId);
      if (hasVoted) {
        return res.status(400).json({ error: "Already voted on this attempt" });
      }
      
      const attempt = await storage.getAttemptById(body.attemptId);
      if (!attempt) {
        return res.status(404).json({ error: "Attempt not found" });
      }
      
      if (attempt.status !== "pending") {
        return res.status(400).json({ error: "Attempt already reviewed" });
      }
      
      const review = await storage.createReview(body.attemptId, reviewerId, body.vote);
      
      await audit.log("review_vote", {
        targetType: "review",
        targetId: review.id,
        metadata: { attemptId: body.attemptId, vote: body.vote },
      });
      
      // Check consensus
      const consensus = await storage.checkReviewConsensus(body.attemptId, attempt.difficulty);
      
      if (consensus.met) {
        // Approve attempt
        await storage.updateAttemptStatus(body.attemptId, "approved");
        
        // Process economics: refund 80%, lock 20%, add 5% from pool
        const cost = parseFloat(attempt.cost);
        const refundAmount = (cost * 0.8).toString();
        const lockAmount = (cost * 0.2).toString();
        const poolBonus = (cost * 0.05).toString();
        const totalLock = (parseFloat(lockAmount) + parseFloat(poolBonus)).toString();
        
        const currentCycle = await storage.getCurrentCycle();
        if (currentCycle && attempt.userId) {
          await storage.createLock({
            userId: attempt.userId,
            attemptId: attempt.id,
            amount: totalLock,
            originalAmount: lockAmount,
            cycleCreated: currentCycle.cycleNumber,
          });
          
          await storage.subtractFromTrainingPool(poolBonus);
        }
      } else {
        // Check if we have enough reject votes to reject
        const requiredRejects = attempt.difficulty === "low" || attempt.difficulty === "medium" ? 2 : 3;
        if (consensus.rejectCount >= requiredRejects) {
          // Reject attempt
          await storage.updateAttemptStatus(body.attemptId, "rejected");
          
          // Process economics: 50% burn, 50% to pool
          const cost = parseFloat(attempt.cost);
          const poolAmount = (cost * 0.5).toString();
          await storage.addToTrainingPool(poolAmount);
        }
      }
      
      res.json({ review, consensus });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Submit review error:", error);
      res.status(500).json({ error: "Failed to submit review" });
    }
  });

  app.get("/api/reviews/attempt/:attemptId", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    
    try {
      const reviews = await storage.getReviewsForAttempt(req.params.attemptId);
      res.json(reviews);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch reviews" });
    }
  });

  // ===== HUB =====
  app.get("/api/hub/posts", async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const posts = await storage.getHubPosts(limit);
      res.json(posts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch hub posts" });
    }
  });

  const submitHubPostSchema = z.object({
    content: z.string().min(1),
  });

  app.post("/api/hub/submit", requireAuthMiddleware, requireHiveAccess, async (req: Request, res: Response) => {
    // For backward compatibility, try to get userId from old system
    const userId = (req as any).userId || (req as any).publicKey || null;
    if (!userId) {
      return res.status(401).json({ error: "User ID required" });
    }
    
    try {
      const body = submitHubPostSchema.parse(req.body);
      const fee = "5"; // Fixed fee Y
      
      const submission = await storage.createHubSubmission(userId, body.content, fee);
      res.json(submission);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to submit hub post" });
    }
  });

  app.get("/api/hub/submissions/pending", async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    
    try {
      const submissions = await storage.getPendingHubSubmissions();
      res.json(submissions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pending submissions" });
    }
  });

  app.post("/api/hub/submissions/:id/approve", async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    
    try {
      const submission = await storage.getHubSubmissionById(req.params.id);
      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }
      if (submission.status !== "pending") {
        return res.status(400).json({ error: "Submission already reviewed" });
      }
      
      const updated = await storage.updateHubSubmissionStatus(req.params.id, "approved");
      
      // Create hub post
      const currentCycle = await storage.getCurrentCycle();
      if (currentCycle && submission.userId) {
        await storage.createHubPost(submission.userId, submission.content, currentCycle.id);
      }
      
      // Process economics: 50% burn, 50% to pool
      const fee = parseFloat(submission.fee);
      const poolAmount = (fee * 0.5).toString();
      await storage.addToTrainingPool(poolAmount);
      
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to approve submission" });
    }
  });

  app.post("/api/hub/submissions/:id/reject", async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    
    try {
      const updated = await storage.updateHubSubmissionStatus(req.params.id, "rejected");
      // Rejected = full refund (handled on frontend)
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to reject submission" });
    }
  });

  // ===== ADMIN =====
  app.get("/api/admin/users", async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    
    // Simplified - in real app, add pagination
    res.json({ message: "User list endpoint - implement as needed" });
  });

  app.post("/api/admin/users/:id/role", async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    
    try {
      const { role, value } = req.body;
      if (!["reviewer", "hubPoster", "admin"].includes(role)) {
        return res.status(400).json({ error: "Invalid role" });
      }
      
      const user = await storage.updateUserRole(req.params.id, role, value);
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to update user role" });
    }
  });

  app.get("/api/admin/model-status", async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    
    try {
      const activeModel = await storage.getActiveModelVersion();
      const allModels = await storage.getAllModelVersions();
      const latestBenchmark = await storage.getLatestBenchmark();
      
      res.json({
        activeModel,
        allModels,
        latestBenchmark,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch model status" });
    }
  });

  app.get("/api/admin/training-pool", async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    
    try {
      const amount = await storage.getTrainingPoolAmount();
      res.json({ amount });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch training pool" });
    }
  });

  app.get("/api/admin/pending-attempts", async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    
    try {
      const pendingAttempts = await storage.getPendingAttempts();
      const { getAutoReviewConfig } = await import("./services/autoReview");
      const config = getAutoReviewConfig();
      
      res.json({
        attempts: pendingAttempts,
        autoReviewMode: config.mode,
        totalPending: pendingAttempts.length,
      });
    } catch (error) {
      logger.error({ requestId: req.requestId, error: "Failed to fetch pending attempts", details: error });
      res.status(500).json({ error: "Failed to fetch pending attempts" });
    }
  });

  app.get("/api/admin/rewards-pool", async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    
    try {
      const pool = await storage.getRewardsPool();
      res.json({
        pendingHive: pool.pendingHive,
        totalSweptHive: pool.totalSweptHive,
        rewardsWalletAddress: pool.rewardsWalletAddress,
      });
    } catch (error) {
      logger.error({ requestId: req.requestId, error: "Failed to fetch rewards pool", details: error });
      res.status(500).json({ error: "Failed to fetch rewards pool" });
    }
  });

  app.get("/api/admin/auto-review-config", async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    
    try {
      const { getAutoReviewConfig } = await import("./services/autoReview");
      const config = getAutoReviewConfig();
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch auto-review config" });
    }
  });

  // ===== CODE EDITOR (Admin Only) =====
  const ADMIN_EDIT_KEY = process.env.ADMIN_EDIT_KEY || "";

  function checkAdminKey(req: Request): boolean {
    const providedKey = req.headers["x-admin-key"] as string;
    if (!ADMIN_EDIT_KEY) {
      return false; // No key set, deny access
    }
    return providedKey === ADMIN_EDIT_KEY;
  }

  // List files in client/src directory
  const scanDirectory = async (
    dir: string,
    basePath: string,
    files: Array<{ path: string; type: "file" | "directory" }>
  ): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
      
      // Skip node_modules, .git, dist, build, etc.
      if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist" || entry.name === "build") {
        continue;
      }

      if (entry.isDirectory()) {
        await scanDirectory(fullPath, relativePath, files);
      } else if (entry.isFile() && (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts") || entry.name.endsWith(".css") || entry.name.endsWith(".json"))) {
        files.push({ path: `client/src/${relativePath}`, type: "file" });
      }
    }
  };

  app.get("/api/admin/files/list", async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    
    try {
      const clientSrcPath = join(process.cwd(), "client", "src");
      const files: Array<{ path: string; type: "file" | "directory" }> = [];

      await scanDirectory(clientSrcPath, "", files);
      res.json({ files: files.sort((a, b) => a.path.localeCompare(b.path)) });
    } catch (error) {
      console.error("List files error:", error);
      res.status(500).json({ error: "Failed to list files" });
    }
  });

  // Read a file
  app.get("/api/admin/files/read", async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    if (!checkAdminKey(req)) {
      return res.status(403).json({ error: "Admin key required" });
    }

    try {
      const filePath = req.query.path as string;
      if (!filePath) {
        return res.status(400).json({ error: "Path parameter required" });
      }

      // Security: Only allow files in client/src
      // Normalize path - handle both "client/src/..." and relative paths
      let safePath = filePath;
      if (!safePath.startsWith("client/src/")) {
        safePath = `client/src/${safePath}`;
      }

      // Prevent directory traversal
      if (safePath.includes("..")) {
        return res.status(403).json({ error: "Access denied: Invalid path" });
      }

      const fullPath = join(process.cwd(), safePath);
      const normalizedPath = fullPath.replace(/\\/g, "/");
      const clientSrcPath = join(process.cwd(), "client", "src").replace(/\\/g, "/");
      
      if (!normalizedPath.startsWith(clientSrcPath)) {
        return res.status(403).json({ error: "Access denied: File outside allowed directory" });
      }

      const content = await readFile(fullPath, "utf-8");
      res.json({ content, path: safePath });
    } catch (error: any) {
      if (error.code === "ENOENT") {
        return res.status(404).json({ error: "File not found" });
      }
      console.error("Read file error:", error);
      res.status(500).json({ error: "Failed to read file" });
    }
  });

  // Save a file
  app.post("/api/admin/files/save", async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;
    if (!checkAdminKey(req)) {
      return res.status(403).json({ error: "Admin key required" });
    }

    try {
      const { path: filePath, content } = req.body;
      if (!filePath || typeof content !== "string") {
        return res.status(400).json({ error: "Path and content required" });
      }

      // Security: Only allow files in client/src
      const safePath = filePath.startsWith("client/src/") 
        ? filePath 
        : `client/src/${filePath}`;
      const fullPath = join(process.cwd(), safePath);
      const normalizedPath = fullPath.replace(/\\/g, "/");
      const clientSrcPath = join(process.cwd(), "client", "src").replace(/\\/g, "/");
      
      if (!normalizedPath.startsWith(clientSrcPath)) {
        return res.status(403).json({ error: "Access denied: File outside allowed directory" });
      }

      // Prevent saving outside allowed extensions
      if (!filePath.match(/\.(tsx?|css|json)$/)) {
        return res.status(403).json({ error: "Only .ts, .tsx, .css, and .json files can be edited" });
      }

      await writeFile(fullPath, content, "utf-8");
      res.json({ success: true, path: safePath });
    } catch (error: any) {
      console.error("Save file error:", error);
      res.status(500).json({ error: "Failed to save file" });
    }
  });

  // ===== STATS API =====
  app.get("/api/stats/tracks", async (req: Request, res: Response) => {
    try {
      const aggregates = await storage.getTrackAggregates();
      res.json(aggregates);
    } catch (error) {
      logger.error({ requestId: req.requestId, error: "Track stats error", details: error });
      res.status(500).json({ error: "Failed to fetch track stats" });
    }
  });

  app.get("/api/stats/questions", async (req: Request, res: Response) => {
    try {
      const trackId = req.query.trackId as string | undefined;
      const aggregates = await storage.getQuestionAggregates(trackId);
      res.json(aggregates);
    } catch (error) {
      logger.error({ requestId: req.requestId, error: "Question stats error", details: error });
      res.status(500).json({ error: "Failed to fetch question stats" });
    }
  });

  app.get("/api/stats/cycle/current", async (req: Request, res: Response) => {
    try {
      const currentCycle = await storage.getCurrentCycle();
      if (!currentCycle) {
        return res.status(404).json({ error: "No active cycle" });
      }
      const aggregate = await storage.getCycleAggregate(currentCycle.cycleNumber);
      res.json({
        cycleNumber: currentCycle.cycleNumber,
        isActive: currentCycle.isActive,
        startDate: currentCycle.startDate,
        aggregate: aggregate || {
          attemptsTotal: 0,
          accuracyPct: "0",
          lastCalculatedAt: null,
        },
      });
    } catch (error) {
      logger.error({ requestId: req.requestId, error: "Cycle stats error", details: error });
      res.status(500).json({ error: "Failed to fetch cycle stats" });
    }
  });

  app.get("/api/stats/cycles", async (req: Request, res: Response) => {
    try {
      const aggregates = await storage.getCycleAggregates();
      res.json(aggregates);
    } catch (error) {
      logger.error({ requestId: req.requestId, error: "Cycles stats error", details: error });
      res.status(500).json({ error: "Failed to fetch cycles stats" });
    }
  });

  // ===== USER LOCKS =====
  app.get("/api/locks", async (req: Request, res: Response) => {
    const userId = requireAuth(req, res);
    if (!userId) return;
    
    try {
      const userLocks = await storage.getActiveLocks(userId);
      res.json(userLocks);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch locks" });
    }
  });

  return httpServer;
}
