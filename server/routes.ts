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
  // Production rate limiters (15 minute windows)
  defaultLimiter,
  chatLimiter,
  writeLimiter,
  authLimiter,
} from "./middleware/rateLimit";
import { createAuditHelper } from "./services/audit";
import { logger } from "./middleware/logger";
import { getFullHealth, isReady, isLive, isAiFallbackAllowed } from "./services/health";
import { captureError } from "./sentry";
import { seedDefaultTracks } from "./seed";
import { getAutoReviewConfig, computeAutoReview, calculateStyleCredits, calculateIntelligenceGain } from "./services/autoReview";
import { getDb, isDbConfigured } from "./db";
import { sql } from "drizzle-orm";
import { registerSolanaProxyRoutes } from "./routes/solanaProxy";

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

/**
 * Estimate question complexity (1-5) based on message content
 * Simple heuristic: check for advanced keywords and concepts
 */
function estimateQuestionComplexity(message: string): number {
  const lowerMessage = message.toLowerCase();
  
  // Complexity 5 indicators (advanced/elite topics)
  const complexity5Keywords = [
    "quantum", "relativity", "calculus", "derivative", "integral", "theorem", "proof",
    "algorithm", "complexity", "optimization", "distributed", "concurrency", "race condition",
    "heisenberg", "entropy", "thermodynamics", "wave function", "eigenvalue",
  ];
  
  // Complexity 4 indicators (advanced topics)
  const complexity4Keywords = [
    "algebra", "quadratic", "polynomial", "logarithm", "exponential", "trigonometry",
    "chemistry", "molecular", "atomic", "bond", "reaction", "oxidation",
    "physics", "electromagnetic", "frequency", "wavelength", "energy",
    "database", "index", "query", "transaction", "acid",
  ];
  
  // Complexity 3 indicators (intermediate topics)
  const complexity3Keywords = [
    "equation", "solve", "variable", "function", "graph", "slope",
    "biology", "cell", "organism", "evolution", "genetics",
    "programming", "code", "function", "variable", "loop", "array",
  ];
  
  // Complexity 2 indicators (basic intermediate)
  const complexity2Keywords = [
    "calculate", "percent", "fraction", "decimal", "multiply", "divide",
    "science", "experiment", "hypothesis", "theory",
  ];
  
  // Check for complexity 5
  if (complexity5Keywords.some(keyword => lowerMessage.includes(keyword))) {
    return 5;
  }
  
  // Check for complexity 4
  if (complexity4Keywords.some(keyword => lowerMessage.includes(keyword))) {
    return 4;
  }
  
  // Check for complexity 3
  if (complexity3Keywords.some(keyword => lowerMessage.includes(keyword))) {
    return 3;
  }
  
  // Check for complexity 2
  if (complexity2Keywords.some(keyword => lowerMessage.includes(keyword))) {
    return 2;
  }
  
  // Default to complexity 1 (basic)
  return 1;
}

/**
 * Generate learning steps to reach the required complexity level
 */
function generateLearningSteps(
  currentLevel: number,
  requiredComplexity: number,
  currentMaxComplexity: number
): string[] {
  const steps: string[] = [];
  
  // Calculate target level (complexity * 20, roughly)
  const targetLevel = requiredComplexity * 20;
  const levelsNeeded = Math.max(1, targetLevel - currentLevel);
  
  steps.push(`Complete ${Math.ceil(levelsNeeded / 5)} training sessions to increase your intelligence level`);
  steps.push(`Focus on ${getComplexityTrackName(requiredComplexity)} track questions`);
  steps.push(`Achieve high scores (≥80%) on difficulty ${getDifficultyForComplexity(requiredComplexity)} training attempts`);
  
  if (requiredComplexity >= 4) {
    steps.push(`Consider starting a rank-up trial to unlock level ${targetLevel}`);
  }
  
  if (requiredComplexity === 5) {
    steps.push(`Master advanced concepts through consistent practice and high-quality submissions`);
  }
  
  return steps;
}

function getComplexityTrackName(complexity: number): string {
  if (complexity >= 4) return "Mathematics or Science";
  if (complexity >= 3) return "Mathematics, Science, or Programming";
  return "any track";
}

function getDifficultyForComplexity(complexity: number): string {
  if (complexity >= 5) return "extreme";
  if (complexity >= 4) return "high";
  if (complexity >= 3) return "medium";
  return "low";
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

  // ===== PRODUCTION HEALTH CHECKS =====
  // These endpoints are used by load balancers and monitoring systems
  // They do NOT require authentication

  // GET /health - Basic app health check
  app.get("/health", (req: Request, res: Response) => {
    const version = process.env.APP_VERSION || "dev";
    const env = process.env.NODE_ENV || "development";
    res.status(200).json({
      ok: true,
      service: "hivemind",
      version,
      env,
      time: new Date().toISOString(),
    });
  });

  // GET /health/db - Database health check
  app.get("/health/db", async (req: Request, res: Response) => {
    try {
      if (!isDbConfigured()) {
        return res.status(503).json({
          ok: false,
          db: "down",
          error: "DATABASE_URL not configured",
          requestId: req.requestId,
        });
      }
      const { sql } = await import("drizzle-orm");
      const db = getDb();
      await db.execute(sql`SELECT 1`);
      res.status(200).json({ ok: true, db: "up" });
    } catch (error: any) {
      // Don't leak database connection details
      const safeError = error.message || "Database connection failed";
      res.status(503).json({ ok: false, db: "down", error: safeError });
    }
  });

  // GET /health/ollama - Ollama service health check
  app.get("/health/ollama", async (req: Request, res: Response) => {
    const ollamaBaseUrl = process.env.OLLAMA_BASE_URL;
    
    if (!ollamaBaseUrl) {
      return res.status(200).json({
        ok: true,
        ollama: "skipped",
        reason: "OLLAMA_BASE_URL not set",
      });
    }

    try {
      // Use /api/tags endpoint - lightweight, doesn't require model specification
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

      const response = await fetch(`${ollamaBaseUrl}/api/tags`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.OLLAMA_API_KEY ? { Authorization: `Bearer ${process.env.OLLAMA_API_KEY}` } : {}),
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return res.status(503).json({
          ok: false,
          ollama: "down",
          error: `HTTP ${response.status}: ${response.statusText}`,
        });
      }

      // If we get a response (even empty), Ollama is up
      res.status(200).json({ ok: true, ollama: "up" });
    } catch (error: any) {
      // Don't leak API keys or full URLs in errors
      const errorMessage = error.name === "AbortError"
        ? "Connection timeout"
        : error.message || "Ollama service unavailable";
      
      res.status(503).json({
        ok: false,
        ollama: "down",
        error: errorMessage,
      });
    }
  });

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

  // Register Solana RPC proxy routes (must be before other routes to avoid conflicts)
  registerSolanaProxyRoutes(app);

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
  // Apply auth rate limiter (15 min window) + legacy 1 min limiter for extra protection
  app.get("/api/auth/nonce", authLimiter, authNonceLimiter, async (req: Request, res: Response) => {
    try {
      const wallet = req.query.wallet as string;
      if (!wallet || wallet.length < 32) {
        return res.status(400).json({ error: "Valid wallet address required", code: "INVALID_WALLET" });
      }

      const { nonce, message, expiresAt } = await issueNonce(wallet, req);
      res.json({ nonce, message, expiresAt: expiresAt.toISOString() });
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      const errorStack = error?.stack;
      logger.error({ 
        requestId: req.requestId, 
        error: "Nonce generation error", 
        message: errorMessage,
        stack: errorStack,
        details: error 
      });
      // Include error message in response for debugging (in development)
      const responseError = process.env.NODE_ENV === "development" 
        ? { error: "Failed to generate nonce", message: errorMessage }
        : { error: "Failed to generate nonce" };
      res.status(500).json(responseError);
    }
  });

  // Legacy challenge endpoint (redirects to nonce)
  app.get("/api/auth/challenge", authLimiter, authNonceLimiter, async (req: Request, res: Response) => {
    try {
      const publicKey = req.query.publicKey as string;
      if (!publicKey || publicKey.length < 32) {
        return res.status(400).json({ error: "Valid publicKey query parameter required" });
      }

      const { nonce, message, expiresAt } = await issueNonce(publicKey, req);
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

  app.post("/api/auth/verify", authLimiter, authVerifyLimiter, async (req: Request, res: Response) => {
    const audit = createAuditHelper(req);
    try {
      const body = verifySchema.parse(req.body);
      const walletAddress = body.wallet || body.publicKey!;

      // Consume nonce (single-use, validates expiry, checks IP hash)
      const nonceResult = await consumeNonce(walletAddress, body.nonce, req);
      if (!nonceResult.valid || !nonceResult.message) {
        await audit.log("login_failure", {
          targetType: "session",
          metadata: { reason: "invalid_nonce", wallet: walletAddress },
          overrideWallet: walletAddress,
        });
        return res.status(401).json({ 
          ok: false,
          error: "invalid_nonce",
          message: "Nonce expired or already used. Please try again."
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
        return res.status(401).json({ 
          ok: false,
          error: "invalid_signature",
          message: "Invalid signature"
        });
      }

      // Create server-side session
      const { sessionToken, expiresAt } = await createSession(walletAddress);

      // Regenerate session ID to prevent session fixation attacks
      // Clear any existing session cookie first
      res.clearCookie("sid", { path: "/" });

      // Set secure httpOnly cookie with raw session token
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
  app.get("/api/tracks", defaultLimiter, publicReadLimiter, async (req: Request, res: Response) => {
    try {
      const tracks = await storage.getAllTracks();
      res.json(tracks);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tracks" });
    }
  });

  app.get("/api/tracks/:trackId/questions", defaultLimiter, publicReadLimiter, async (req: Request, res: Response) => {
    try {
      // Check if user is authenticated (optional for this endpoint)
      const publicKey = (req as any).publicKey;
      
      if (publicKey) {
        // Authenticated: use question selector with level enforcement
        const balance = await storage.getOrCreateWalletBalance(publicKey);
        const intelligenceLevel = balance.level;
        
        const { selectQuestions } = await import("./services/questionSelector");
        const count = parseInt(req.query.count as string) || 50; // Default 50 questions
        
        const result = await selectQuestions({
          walletAddress: publicKey,
          trackId: req.params.trackId,
          intelligenceLevel,
          count,
          avoidRecentDays: 30,
          allowSeen: false,
        });
        
        // Record question history immediately (user has "seen" these questions)
        for (const question of result.questions) {
          try {
            await storage.recordQuestionHistory({
              walletAddress: publicKey,
              questionId: question.id,
              trackId: req.params.trackId,
              attemptId: null, // No attempt yet - just viewing
            });
          } catch (error: any) {
            // Non-blocking: log but don't fail the request
            logger.warn({
              requestId: req.requestId,
              error: "Failed to record question history (non-blocking)",
              questionId: question.id,
              details: error.message,
            });
          }
        }
        
        // Exclude numericAnswer from response (security)
        const sanitized = result.questions.map(q => {
          const { numericAnswer, ...rest } = q;
          return rest;
        });
        
        res.json(sanitized);
      } else {
        // Unauthenticated: return all questions (backward compatibility)
        const questions = await storage.getQuestionsByTrack(req.params.trackId);
        const sanitized = questions.map(q => {
          const { numericAnswer, ...rest } = q;
          return rest;
        });
        res.json(sanitized);
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch questions" });
    }
  });

  app.get("/api/benchmark-questions", defaultLimiter, publicReadLimiter, async (req: Request, res: Response) => {
    try {
      const questions = await storage.getBenchmarkQuestions();
      // Exclude numericAnswer from response (security: don't send correct answers to client)
      const sanitized = questions.map(q => {
        const { numericAnswer, ...rest } = q;
        return rest;
      });
      res.json(sanitized);
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
  app.get("/api/cycles/current", defaultLimiter, publicReadLimiter, async (req: Request, res: Response) => {
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

  app.post("/api/corpus", requireAuthMiddleware, requireCreator, writeLimiter, corpusLimiter, async (req: Request, res: Response) => {
    const audit = createAuditHelper(req);
    try {
      const body = addCorpusItemSchema.parse(req.body);
      const currentCycle = await storage.getCurrentCycle();
      if (!currentCycle) {
        return res.status(400).json({ error: "No active cycle" });
      }
      
      // Normalize the text
      const normalizedText = normalizeText(body.text);
      
      // Get submitter wallet from authenticated session (never from client body)
      const submitterWalletPubkey = (req as any).walletAddress;
      
      const item = await storage.addCorpusItem({
        trackId: body.trackId,
        cycleId: currentCycle.id,
        normalizedText,
        sourceAttemptId: body.sourceAttemptId,
        submitterWalletPubkey, // Store session wallet (server source of truth)
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

  app.put("/api/corpus/:id", requireAuthMiddleware, requireCreator, writeLimiter, corpusLimiter, async (req: Request, res: Response) => {
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
  app.delete("/api/corpus/:id", requireAuthMiddleware, requireCreator, writeLimiter, corpusLimiter, async (req: Request, res: Response) => {
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

  // Embed a corpus item (admin only) - now enqueues a job
  app.post("/api/rag/embed/:id", requireAuthMiddleware, requireCreator, async (req: Request, res: Response) => {
    try {
      const { enqueueJob } = await import("./services/jobQueue");
      const jobId = await enqueueJob("embed_corpus_item", { corpusItemId: req.params.id });
      res.json({ success: true, jobId, message: "Embedding job enqueued" });
    } catch (error: any) {
      logger.error({ requestId: req.requestId, error: "Job enqueue error", details: error.message });
      res.status(500).json({ error: error.message || "Failed to enqueue embedding job" });
    }
  });

  // Approve corpus item and auto-embed (admin only)
  app.post("/api/corpus/:id/approve", requireAuthMiddleware, requireCreator, writeLimiter, async (req: Request, res: Response) => {
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

  app.post("/api/corpus/:id/retry-embed", requireAuthMiddleware, requireCreator, writeLimiter, async (req: Request, res: Response) => {
    const audit = createAuditHelper(req);
    try {
      // Enqueue a new embedding job instead of using legacy retry
      const { enqueueJob } = await import("./services/jobQueue");
      const jobId = await enqueueJob("embed_corpus_item", { corpusItemId: req.params.id });
      
      await audit.log("corpus_embed_retry", {
        targetType: "corpus_item",
        targetId: req.params.id,
        metadata: { jobId },
      });
      
      res.json({ success: true, jobId, message: "Embedding job enqueued for retry" });
    } catch (error: any) {
      logger.error({ requestId: req.requestId, error: "Retry embed error", details: error.message });
      res.status(400).json({ error: error.message || "Failed to enqueue embedding job" });
    }
  });

  app.post("/api/corpus/:id/force-reembed", requireAuthMiddleware, requireCreator, writeLimiter, async (req: Request, res: Response) => {
    const audit = createAuditHelper(req);
    try {
      // Clear existing chunks first
      const { db } = await import("./db");
      const { corpusChunks } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      await db.delete(corpusChunks).where(eq(corpusChunks.corpusItemId, req.params.id));
      
      // Enqueue a new embedding job
      const { enqueueJob } = await import("./services/jobQueue");
      const jobId = await enqueueJob("embed_corpus_item", { corpusItemId: req.params.id });
      
      await audit.log("corpus_force_reembed", {
        targetType: "corpus_item",
        targetId: req.params.id,
        metadata: { jobId },
      });
      
      res.json({ success: true, jobId, message: "Corpus item queued for re-embedding, old chunks cleared" });
    } catch (error: any) {
      logger.error({ requestId: req.requestId, error: "Force re-embed error", details: error.message });
      res.status(400).json({ error: error.message || "Failed to force re-embed" });
    }
  });

  // ===== JOB QUEUE MANAGEMENT (Admin/Creator Only) =====
  
  // Get jobs by status
  app.get("/api/jobs", requireAuthMiddleware, requireCreator, async (req: Request, res: Response) => {
    try {
      const { getJobsByStatus } = await import("./services/jobQueue");
      const status = req.query.status as "pending" | "running" | "succeeded" | "failed" | undefined;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      
      const jobs = await getJobsByStatus(status, limit);
      res.json({ jobs, count: jobs.length });
    } catch (error: any) {
      logger.error({ requestId: req.requestId, error: "Get jobs error", details: error.message });
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });

  // Retry a failed job
  app.post("/api/jobs/:id/retry", requireAuthMiddleware, requireCreator, async (req: Request, res: Response) => {
    const audit = createAuditHelper(req);
    try {
      const { retryJob } = await import("./services/jobQueue");
      await retryJob(req.params.id);
      
      await audit.log("job_retry", {
        targetType: "job",
        targetId: req.params.id,
      });
      
      res.json({ success: true, message: "Job reset for retry" });
    } catch (error: any) {
      logger.error({ requestId: req.requestId, error: "Retry job error", details: error.message });
      res.status(400).json({ error: error.message || "Failed to retry job" });
    }
  });

  // ===== AI CHAT =====
  const chatMessageSchema = z.object({
    message: z.string().min(1).max(2000),
    track: z.string().optional(),
    aiLevel: z.number().int().min(1).max(100),
  });

  app.post("/api/ai/chat", requireAuthMiddleware, requireHiveAccess, chatLimiter, chatLimiterWallet, chatLimiterIp, async (req: Request, res: Response) => {
    try {
      const body = chatMessageSchema.parse(req.body);
      const publicKey = (req as any).publicKey;
      
      // Fetch user's actual intelligence level from database (enforce server-side)
      const balance = await storage.getOrCreateWalletBalance(publicKey);
      const intelligenceLevel = balance.level; // Server-side level (1-100)
      
      // Look up trackId if track name provided
      let trackId: string | undefined;
      if (body.track) {
        const tracks = await storage.getAllTracks();
        const matchedTrack = tracks.find(t => t.name.toLowerCase() === body.track!.toLowerCase());
        trackId = matchedTrack?.id;
      }
      
      // Check if question is above user's level (simple heuristic)
      const { allowedComplexity } = await import("./services/questionSelector");
      const userMaxComplexity = allowedComplexity(intelligenceLevel);
      const questionComplexity = estimateQuestionComplexity(body.message);
      const isQuestionAboveLevel = questionComplexity > userMaxComplexity;
      
      // Generate response using Ollama (always use server-side intelligence level)
      const { generateChatResponse } = await import("./aiChat");
      
      let response: string;
      let corpusItemsUsed: string[];
      
      let sources: Array<{ chunkText: string; score: number; title: string | null }> = [];
      let isGrounded = false;
      let usedCorpus = false;
      let grounded = false;
      let level = intelligenceLevel;
      let policySnapshot: any = null;
      let isGated = false;
      let learningSteps: string[] = [];
      
      try {
        const result = await generateChatResponse(
          body.message,
          intelligenceLevel, // Use server-side level, not client-provided
          trackId
        );
        
        // If question is above level, gate the response
        if (isQuestionAboveLevel) {
          isGated = true;
          learningSteps = generateLearningSteps(intelligenceLevel, questionComplexity, userMaxComplexity);
          
          // Modify response to include gating message
          response = `I understand you're asking about an advanced topic. At your current intelligence level (${intelligenceLevel}), this topic requires complexity level ${questionComplexity}, but you currently have access up to level ${userMaxComplexity}.\n\n` +
            `Here's a simplified answer based on your current level:\n\n${result.response}\n\n` +
            `**To unlock this topic, here's what you need to do:**\n${learningSteps.map((step, i) => `${i + 1}. ${step}`).join('\n')}`;
        } else {
          response = result.response;
        }
        
        corpusItemsUsed = result.corpusItemsUsed;
        sources = result.sources;
        isGrounded = result.isGrounded;
        usedCorpus = result.usedCorpus;
        grounded = result.grounded;
        level = result.level;
        policySnapshot = result.policySnapshot;
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
        usedCorpus = false;
        grounded = false;
        logger.warn({ requestId: req.requestId, message: "Using fallback AI response in development mode" });
      }
      
      // Track usage for corpus items (increment usageCountCycle)
      if (corpusItemsUsed.length > 0) {
        try {
          const { incrementCorpusItemUsage } = await import("./services/rewardsDistributionV2");
          await incrementCorpusItemUsage(corpusItemsUsed);
        } catch (error: any) {
          logger.error({ 
            requestId: req.requestId, 
            error: "Failed to track corpus item usage (non-blocking)", 
            details: error.message 
          });
        }
      }
      
      // Save to chat history (use server-side intelligence level)
      const chatMessage = await storage.saveChatMessage({
        walletAddress: publicKey,
        trackId,
        aiLevel: intelligenceLevel, // Use server-side level
        userMessage: body.message,
        aiResponse: response,
        corpusItemsUsed,
      });
      
      // Get active model version metadata
      const { getActiveModelVersion, getCurrentCorpusHash } = await import("./services/modelVersioning");
      const activeVersion = await getActiveModelVersion();
      const corpusHash = await getCurrentCorpusHash();

      res.json({
        id: chatMessage.id,
        response,
        corpusItemsUsed: corpusItemsUsed.length,
        aiLevel: intelligenceLevel, // Server-side level
        track: body.track,
        sources,
        isGrounded, // Keep for backwards compatibility
        usedCorpus,
        grounded,
        level: intelligenceLevel, // Server-side level
        policySnapshot,
        isGated, // Whether response was gated due to level
        learningSteps: isGated ? learningSteps : undefined,
        metadata: {
          activeModelVersionId: activeVersion?.id || null,
          corpusHash,
        },
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
        level: balance.level,
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
    answers: z.array(z.union([z.number(), z.string()])),
    questionIds: z.array(z.string()),
    startTime: z.number().optional(),
    levelAtTime: z.number().optional(),
    // correctAnswers is explicitly NOT accepted - server is source of truth
  });

  app.post("/api/train-attempts/submit", requireAuthMiddleware, requireHiveAccess, writeLimiter, submitLimiter, async (req: Request, res: Response) => {
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
      
      // Validate questionIds and answers match
      if (!body.questionIds || !body.answers || body.questionIds.length !== body.answers.length) {
        return res.status(400).json({ 
          error: "Invalid payload",
          message: "questionIds and answers arrays must have the same length"
        });
      }

      if (body.questionIds.length === 0) {
        return res.status(400).json({ 
          error: "Invalid payload",
          message: "At least one question is required"
        });
      }

      // Validate questionIds are valid UUIDs and exist
      const questions = await Promise.all(
        body.questionIds.map(id => storage.getQuestionById(id))
      );

      const invalidQuestions = questions.filter((q, idx) => !q);
      if (invalidQuestions.length > 0) {
        const invalidIds = body.questionIds.filter((_, idx) => !questions[idx]);
        return res.status(400).json({ 
          error: "Invalid question IDs",
          message: `Questions not found: ${invalidIds.join(", ")}`
        });
      }

      // Calculate score server-side (ANTI-CHEAT: ignore any client-provided correctness)
      const questionResults: Array<{ questionId: string; correct: boolean }> = [];
      let correctCount = 0;

      for (let i = 0; i < body.answers.length; i++) {
        const question = questions[i]!;
        const userAnswer = body.answers[i];
        let isCorrect = false;

        if (question.questionType === "numeric") {
          // Numeric grading
          const { gradeNumeric } = await import("./utils/numericGrade");
          const tolerance = question.numericTolerance ? parseFloat(question.numericTolerance) : null;
          const result = gradeNumeric(
            typeof userAnswer === "string" ? userAnswer : String(userAnswer),
            question.numericAnswer || null,
            tolerance
          );
          isCorrect = result.correct;
        } else {
          // MCQ grading
          const correctIndex = question.correctIndex;
          const userIndex = typeof userAnswer === "number" ? userAnswer : parseInt(String(userAnswer), 10);
          isCorrect = userIndex === correctIndex;
        }

        questionResults.push({
          questionId: question.id,
          correct: isCorrect,
        });

        if (isCorrect) {
          correctCount++;
        }
      }

      const scorePct = correctCount / body.answers.length;
      let attemptDurationSec = 0;
      
      if (body.startTime) {
        attemptDurationSec = Math.floor((Date.now() - body.startTime) / 1000);
      }
      
      // Generate evidence packet
      const evidencePacket = {
        phrases: [],
        topics: [],
        timestamp: new Date().toISOString(),
        answersGiven: body.answers,
        questionIds: body.questionIds,
        questionResults, // Server-calculated results
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
      // Store submitter wallet from authenticated session (never from client body)
      const submitterWalletPubkey = publicKey; // Already validated from session via requireAuthMiddleware
      const attempt = await storage.createTrainAttempt({
        userId: publicKey, // Note: This seems to be used as wallet address, may need refactor
        trackId: body.trackId,
        difficulty: body.difficulty,
        cost,
        content: body.content,
        cycleId: currentCycle.id,
        scorePct: scorePct.toFixed(4),
        attemptDurationSec,
        submitterWalletPubkey, // Store session wallet (server source of truth)
      });

      // Record question history (user has seen these questions)
      try {
        for (const questionId of body.questionIds) {
          await storage.recordQuestionHistory({
            walletAddress: publicKey,
            questionId,
            trackId: body.trackId,
            attemptId: attempt.id,
          });
        }
      } catch (error: any) {
        // Non-blocking: log but don't fail the submission
        logger.error({
          requestId: req.requestId,
          error: "Failed to record question history (non-blocking)",
          attemptId: attempt.id,
          details: error.message,
        });
      }
      
      await audit.log("submission_created", {
        targetType: "submission",
        targetId: attempt.id,
        metadata: { trackId: body.trackId, difficulty: body.difficulty, cycleId: currentCycle.id, feeHive },
      });
      
      // Apply auto-review logic
      const autoReviewConfig = getAutoReviewConfig();
      const reviewResult = computeAutoReview(scorePct, attemptDurationSec, autoReviewConfig);
      
      // Calculate style credits and intelligence gain
      const { calculateStyleCredits, calculateIntelligenceGain } = await import("./services/autoReview");
      const styleCreditsEarnedValue = reviewResult.decision === "approved" 
        ? calculateStyleCredits(scorePct, body.difficulty)
        : 0;
      const intelligenceGainValue = reviewResult.decision === "approved"
        ? calculateIntelligenceGain(scorePct, body.difficulty)
        : 0;
      
      // Update attempt with auto-review result
      const updatedAttempt = await storage.updateAttemptAutoReview(attempt.id, {
        status: reviewResult.decision,
        scorePct: scorePct.toFixed(4),
        attemptDurationSec,
        autoReviewedAt: reviewResult.autoReviewedAt,
        evidencePacket,
      });

      // Calculate fee settlement based on score (BEFORE sending response)
      const { settleTrainingAttempt } = await import("./services/settlement");
      const settlementResult = await settleTrainingAttempt(
        attempt.id,
        publicKey,
        feeHive,
        scorePct,
        stakeAfterReserve
      );

      if (!settlementResult.success) {
        logger.error({
          requestId: req.requestId,
          error: "Settlement failed",
          attemptId: attempt.id,
          details: settlementResult.error,
        });
        // Continue anyway - settlement failure shouldn't block response
      }

      // Return results including per-question grading (server-calculated, anti-cheat)
      res.json({
        id: updatedAttempt.id,
        status: updatedAttempt.status,
        questionResults, // Per-question correctness (server-calculated)
        score: {
          correctCount,
          total: body.answers.length,
          percent: scorePct,
        },
        autoReview: {
          decision: reviewResult.decision,
          message: reviewResult.message,
          scorePct,
          attemptDurationSec,
          styleCreditsEarned: styleCreditsEarnedValue,
          intelligenceGain: intelligenceGainValue,
        },
        economy: {
          feeHive,
          costHive: settlementResult.costHive,
          refundHive: settlementResult.refundHive,
          stakeAfter: settlementResult.stakeAfter,
        },
      });
      
      // Calculate rewards if approved
      let styleCreditsEarned = 0;
      let intelligenceGain = 0;
      
      if (reviewResult.decision === "approved") {
        styleCreditsEarned = calculateStyleCredits(scorePct, body.difficulty);
        intelligenceGain = calculateIntelligenceGain(scorePct, body.difficulty);
        
        // Record reward shares for approved submission (v2 system)
        try {
          if (process.env.REWARDS_SHARES_ENABLED !== "false") {
            const { 
              calculateDifficultyScore, 
              calculateQualityScore, 
              calculateUsageScore, 
              calculateShares,
              recordSharesV2,
              getCorpusItemUsageCount
            } = await import("./services/rewardsDistributionV2");
            
            if (currentCycle && publicKey) {
              // Get corpus item if this attempt created one (check by sourceAttemptId = attempt.id)
              let corpusItem = null;
              try {
                const { trainingCorpusItems } = await import("@shared/schema");
                const { db } = await import("./db");
                const { eq } = await import("drizzle-orm");
                const [item] = await db
                  .select()
                  .from(trainingCorpusItems)
                  .where(eq(trainingCorpusItems.sourceAttemptId, attempt.id))
                  .limit(1);
                corpusItem = item || null;
              } catch (error: any) {
                // Ignore errors, corpusItem will be null
              }
              
              // Calculate component scores
              const difficultyMap: Record<string, number> = {
                low: 1,
                medium: 2,
                high: 3,
                extreme: 5,
              };
              const complexity = difficultyMap[body.difficulty] || 1;
              const difficultyScore = calculateDifficultyScore(complexity);
              
              // Quality score: use auto-review score and consensus if available
              const consensus = await storage.checkReviewConsensus(attempt.id, body.difficulty);
              const qualityScore = calculateQualityScore({
                autoReviewScore: scorePct,
                consensusApproveCount: consensus.approveCount,
                consensusTotalCount: consensus.approveCount + consensus.rejectCount,
              });
              
              // Usage count: if corpus item exists, get current usage; otherwise 0
              // This is just a snapshot for reference - final usage computed at payout time
              const usageCountSnapshot = corpusItem 
                ? await getCorpusItemUsageCount(corpusItem.id)
                : 0;
              
              // Record baseShares (difficulty × quality) - usage computed at payout time
              const refId = corpusItem?.id || attempt.id;
              await recordSharesV2(
                currentCycle.id,
                publicKey,
                "corpus_approved",
                refId,
                difficultyScore,
                qualityScore,
                usageCountSnapshot // Optional snapshot for reference
              );
            }
          }
        } catch (error: any) {
          logger.error({ 
            error: error.message, 
            attemptId: attempt.id, 
            message: "Failed to record reward shares v2 (non-blocking)" 
          });
        }
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
          // Use server-calculated questionResults for isCorrect (anti-cheat)
          const answerEvents = body.answers.map((answer, idx) => {
            const questionResult = questionResults[idx];
            const question = questions[idx];
            // Convert answer to number for answerEvents (numeric answers need encoding)
            // For MCQ: answer is already a number (index)
            // For numeric: convert string to a hash-like number (simple approach: use char codes sum)
            let selectedAnswerNum: number;
            if (typeof answer === "string") {
              // For numeric answers, create a numeric representation
              // Simple hash: sum of char codes mod a large number
              selectedAnswerNum = answer.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) % 1000000;
            } else {
              selectedAnswerNum = answer;
            }
            
            return {
              walletAddress: publicKey,
              attemptId: attempt.id,
              trackId: body.trackId,
              questionId: body.questionIds![idx],
              selectedAnswer: selectedAnswerNum,
              isCorrect: questionResult ? questionResult.correct : false, // Server-calculated
              scorePct: scorePct.toFixed(4),
              attemptDurationSec,
              levelAtTime: body.levelAtTime,
              autoDecision: reviewResult.decision,
              cycleNumber: currentCycle.cycleNumber,
            };
          });
          
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

  app.post("/api/reviews/submit", requireAuthMiddleware, writeLimiter, reviewLimiter, async (req: Request, res: Response) => {
    const audit = createAuditHelper(req);
    const reviewerId = await requireReviewer(req, res);
    if (!reviewerId) return;
    
    try {
      const body = submitReviewSchema.parse(req.body);
      
      // Get reviewer wallet address from authenticated session (never from client body)
      const reviewerWalletAddress = (req as any).walletAddress;
      if (!reviewerWalletAddress) {
        return res.status(401).json({ error: "Unauthorized: Session wallet address required" });
      }
      
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
      
      // Store review with session wallet address (never trust client body)
      const review = await storage.createReview(body.attemptId, reviewerId, body.vote, reviewerWalletAddress);
      
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
        
        // Record reviewer shares for reviewers who helped approve
        try {
          if (process.env.REWARDS_SHARES_ENABLED !== "false") {
            const { recordReviewerSharesByWallet } = await import("./services/rewardsDistributionV2");
            const currentCycle = await storage.getCurrentCycle();
            
            if (currentCycle) {
              // Get all approve votes for this attempt
              const reviews = await storage.getReviewsForAttempt(body.attemptId);
              const approveReviews = reviews.filter(r => r.vote === "approve");
              
              // Collect reviewer wallet addresses from reviews that have them
              // Security: Only reviews with reviewerWalletAddress are counted for rewards.
              // All new reviews have reviewerWalletAddress from authenticated session (never from client body).
              // Historical reviews with null wallets are skipped (cannot earn rewards).
              const reviewerWalletPubkeys: string[] = [];
              for (const review of approveReviews) {
                if (review.reviewerWalletAddress) {
                  reviewerWalletPubkeys.push(review.reviewerWalletAddress);
                }
              }
              
              // Get submitter's wallet address from the attempt
              // Attempts now store submitterWalletPubkey from session wallet at creation time
              const submitterWalletPubkey = attempt.submitterWalletPubkey || null;
              
              // Warn if submitterWalletPubkey is null (legacy row) - self-review protection won't apply
              if (!submitterWalletPubkey) {
                logger.warn({
                  requestId: req.requestId,
                  message: "Attempt missing submitterWalletPubkey (legacy row) - self-review protection not enforced",
                  attemptId: body.attemptId,
                });
              }
              
              // Map difficulty to complexity
              const difficultyMap: Record<string, number> = {
                low: 1,
                medium: 2,
                high: 3,
                extreme: 5,
              };
              const complexity = difficultyMap[attempt.difficulty] || 1;
              
              // Record reviewer shares (if we have wallet addresses)
              if (reviewerWalletPubkeys.length > 0) {
                await recordReviewerSharesByWallet(
                  currentCycle.id,
                  body.attemptId,
                  reviewerWalletPubkeys,
                  submitterWalletPubkey,
                  complexity
                );
              }
            }
          }
        } catch (error: any) {
          logger.error({ 
            requestId: req.requestId,
            error: "Failed to record reviewer shares (non-blocking)", 
            details: error.message 
          });
        }
        
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
  app.get("/api/hub/posts", defaultLimiter, async (req: Request, res: Response) => {
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

  app.post("/api/rewards/cycles/:cycleId/calculate", requireAuthMiddleware, requireCreator, async (req: Request, res: Response) => {
    try {
      const cycleId = req.params.cycleId;
      // Use v2 system if enabled, otherwise fall back to v1
      const useV2 = process.env.REWARDS_SHARES_ENABLED !== "false";
      
      if (useV2) {
        const { calculateCyclePayoutsV2 } = await import("./services/rewardsDistributionV2");
        const result = await calculateCyclePayoutsV2(cycleId);
        
        if (!result.success) {
          if (result.error?.includes("already calculated")) {
            return res.status(409).json({
              ok: false,
              error: "Payouts already calculated for this cycle",
              payoutCount: result.payoutCount,
            });
          }
          return res.status(400).json({
            ok: false,
            error: result.error || "Failed to calculate payouts",
          });
        }
        
        res.json({
          ok: true,
          payoutCount: result.payoutCount,
          totalPool: result.totalPool,
          totalShares: result.totalShares,
        });
      } else {
        const { calculateCyclePayouts } = await import("./services/rewardsDistribution");
        const result = await calculateCyclePayouts(cycleId);
        
        if (!result.success) {
          if (result.error?.includes("already calculated")) {
            return res.status(409).json({
              ok: false,
              error: "Payouts already calculated for this cycle",
              payoutCount: result.payoutCount,
            });
          }
          return res.status(400).json({
            ok: false,
            error: result.error || "Failed to calculate payouts",
          });
        }
        
        res.json({
          ok: true,
          payoutCount: result.payoutCount,
          totalPool: result.totalPool,
          totalShares: result.totalShares,
        });
      }
    } catch (error: any) {
      logger.error({ requestId: req.requestId, error: "Failed to calculate cycle payouts", details: error });
      res.status(500).json({ error: "Failed to calculate cycle payouts" });
    }
  });

  app.get("/api/rewards/me", requireAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const publicKey = (req as any).publicKey;
      // Use v2 system if enabled, otherwise fall back to v1
      const useV2 = process.env.REWARDS_SHARES_ENABLED !== "false";
      
      if (useV2) {
        const { getUserRewardsV2 } = await import("./services/rewardsDistributionV2");
        const rewards = await getUserRewardsV2(publicKey);
        
        res.json({
          ok: true,
          currentCycleShares: rewards.currentCycleShares,
          estimatedPayout: rewards.estimatedPayout,
          recentPayouts: rewards.recentPayouts,
        });
      } else {
        const { getUserRewards } = await import("./services/rewardsDistribution");
        const rewards = await getUserRewards(publicKey);
        
        res.json({
          ok: true,
          currentCycleShares: rewards.currentCycleShares,
          estimatedPayout: rewards.estimatedPayout,
          recentPayouts: rewards.recentPayouts,
        });
      }
    } catch (error: any) {
      logger.error({ requestId: req.requestId, error: "Failed to get user rewards", details: error });
      res.status(500).json({ error: "Failed to get user rewards" });
    }
  });

  app.get("/api/rewards/pool", requireAuthMiddleware, requireCreator, async (req: Request, res: Response) => {
    try {
      const { rewardsPoolLedger } = await import("@shared/schema");
      const { db } = await import("./db");
      const { sql, eq, desc } = await import("drizzle-orm");
      
      // Get totals
      const totals = await db
        .select({
          totalRecorded: sql<number>`COALESCE(SUM(${rewardsPoolLedger.amountHive}::numeric), 0)`,
          totalTransferred: sql<number>`COALESCE(SUM(CASE WHEN ${rewardsPoolLedger.status} = 'transferred' THEN ${rewardsPoolLedger.amountHive}::numeric ELSE 0 END), 0)`,
          pendingCount: sql<number>`COUNT(CASE WHEN ${rewardsPoolLedger.status} IN ('recorded', 'pending_transfer') THEN 1 END)`,
        })
        .from(rewardsPoolLedger);

      // Get recent entries
      const recent = await db
        .select()
        .from(rewardsPoolLedger)
        .orderBy(desc(rewardsPoolLedger.createdAt))
        .limit(50);

      res.json({
        ok: true,
        totalRecorded: parseFloat(totals[0].totalRecorded.toString()),
        totalTransferred: parseFloat(totals[0].totalTransferred.toString()),
        pendingCount: parseInt(totals[0].pendingCount.toString(), 10),
        recent: recent.map((entry) => ({
          id: entry.id,
          source: entry.source,
          amountHive: parseFloat(entry.amountHive),
          status: entry.status,
          txSignature: entry.txSignature,
          walletPubkey: entry.walletPubkey,
          createdAt: entry.createdAt,
        })),
      });
    } catch (error: any) {
      logger.error({ requestId: req.requestId, error: "Failed to fetch rewards pool", details: error });
      res.status(500).json({ error: "Failed to fetch rewards pool" });
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

  // ===== MODEL VERSIONING =====
  
  // Finalize cycle and create model version candidate
  app.post("/api/cycles/:id/finalize", requireAuthMiddleware, requireCreator, async (req: Request, res: Response) => {
    const audit = createAuditHelper(req);
    try {
      // Reset usage counts for next cycle
      try {
        const { resetCycleUsageCounts } = await import("./services/rewardsDistributionV2");
        await resetCycleUsageCounts();
        logger.info({ cycleId: req.params.id, message: "Reset corpus item usage counts for new cycle" });
      } catch (error: any) {
        logger.error({ 
          requestId: req.requestId, 
          error: "Failed to reset usage counts (non-blocking)", 
          details: error.message 
        });
      }
      
      const { createModelVersionForCycle } = await import("./services/modelVersioning");
      const cycleId = req.params.id;
      const notes = req.body.notes as string | undefined;

      const version = await createModelVersionForCycle(cycleId, notes);

      await audit.log("cycle_finalize", {
        targetType: "cycle",
        targetId: cycleId,
        metadata: { versionId: version.id, status: version.status },
      });

      res.json({
        success: true,
        version,
        message: `Model version created with status: ${version.status}`,
      });
    } catch (error: any) {
      logger.error({ requestId: req.requestId, error: "Cycle finalize error", details: error.message });
      res.status(500).json({ error: error.message || "Failed to finalize cycle" });
    }
  });

  // Get all model versions
  app.get("/api/model/versions", requireAuthMiddleware, requireCreator, async (req: Request, res: Response) => {
    try {
      const { getAllModelVersions } = await import("./services/modelVersioning");
      const versions = await getAllModelVersions();
      res.json({ versions, count: versions.length });
    } catch (error: any) {
      logger.error({ requestId: req.requestId, error: "Get model versions error", details: error.message });
      res.status(500).json({ error: "Failed to fetch model versions" });
    }
  });

  // Activate a model version
  app.post("/api/model/activate/:versionId", requireAuthMiddleware, requireCreator, async (req: Request, res: Response) => {
    const audit = createAuditHelper(req);
    try {
      const { activateModelVersion } = await import("./services/modelVersioning");
      await activateModelVersion(req.params.versionId);

      await audit.log("model_activate", {
        targetType: "model_version",
        targetId: req.params.versionId,
      });

      res.json({ success: true, message: "Model version activated" });
    } catch (error: any) {
      logger.error({ requestId: req.requestId, error: "Activate model version error", details: error.message });
      res.status(400).json({ error: error.message || "Failed to activate model version" });
    }
  });

  // Rollback to previous model version
  app.post("/api/model/rollback", requireAuthMiddleware, requireCreator, async (req: Request, res: Response) => {
    const audit = createAuditHelper(req);
    try {
      const { rollbackModelVersion } = await import("./services/modelVersioning");
      await rollbackModelVersion();

      await audit.log("model_rollback", {
        targetType: "model_version",
      });

      res.json({ success: true, message: "Model version rolled back" });
    } catch (error: any) {
      logger.error({ requestId: req.requestId, error: "Rollback model version error", details: error.message });
      res.status(400).json({ error: error.message || "Failed to rollback model version" });
    }
  });

  // ===== PROGRESSION REQUIREMENTS =====
  
  app.get("/api/progression/requirements", defaultLimiter, publicReadLimiter, async (req: Request, res: Response) => {
    try {
      const levelParam = req.query.level;
      if (!levelParam) {
        return res.status(400).json({ error: "level query parameter is required" });
      }
      
      const level = parseInt(String(levelParam), 10);
      if (isNaN(level) || level < 1 || level > 100) {
        return res.status(400).json({ 
          error: "Invalid level", 
          message: "Level must be an integer between 1 and 100" 
        });
      }
      
      const { getRequirements } = await import("./utils/progression");
      const requirements = getRequirements(level);
      
      res.json({
        ok: true,
        requirements,
      });
    } catch (error: any) {
      logger.error({ requestId: req.requestId, error: "Progression requirements error", details: error.message });
      res.status(500).json({ error: "Failed to fetch progression requirements" });
    }
  });

  // ===== RANK-UP TRIALS =====
  
  const startRankupSchema = z.object({
    targetLevel: z.number().int().min(1).max(100),
    currentLevel: z.number().int().min(1).max(100), // Client-provided current level
  });

  app.post("/api/rankup/start", requireAuthMiddleware, async (req: Request, res: Response) => {
    const audit = createAuditHelper(req);
    try {
      const publicKey = (req as any).publicKey;
      const body = startRankupSchema.parse(req.body);

      // Validate targetLevel === currentLevel + 1
      if (body.targetLevel !== body.currentLevel + 1) {
        return res.status(400).json({
          error: "Invalid target level",
          message: `Target level must be current level + 1 (current: ${body.currentLevel}, target: ${body.targetLevel})`,
        });
      }

      // Check for existing active trial
      const activeTrial = await storage.getActiveRankupTrial(publicKey);
      if (activeTrial) {
        return res.status(409).json({
          ok: false,
          error: "trial_already_active",
          trialId: activeTrial.id,
          message: "You already have an active rank-up trial",
        });
      }

      // Get requirements for target level
      const { getRequirements } = await import("./utils/progression");
      const requirements = getRequirements(body.targetLevel);

      // Check wallet hold (HIVE balance)
      const { getHiveBalance } = await import("./solana");
      const walletHold = await getHiveBalance(publicKey);

      // Check vault stake (from wallet_balances table)
      const balance = await storage.getOrCreateWalletBalance(publicKey);
      const vaultStake = parseFloat(balance.trainingStakeHive);
      const trialStakeHive = requirements.vaultStake; // Trial stake = required vault stake

      // Validate requirements
      if (walletHold < requirements.walletHold) {
        return res.status(403).json({
          ok: false,
          error: "insufficient_wallet_hold",
          required: requirements.walletHold,
          current: walletHold,
          message: `Insufficient wallet hold. Required: ${requirements.walletHold} HIVE, Current: ${walletHold} HIVE`,
        });
      }

      if (vaultStake < trialStakeHive) {
        return res.status(403).json({
          ok: false,
          error: "insufficient_vault_stake",
          required: trialStakeHive,
          current: vaultStake,
          message: `Insufficient vault stake to escrow. Required: ${trialStakeHive} HIVE, Available: ${vaultStake} HIVE`,
        });
      }

      // Escrow trial stake
      await storage.escrowTrialStake(publicKey, trialStakeHive.toFixed(8));

      // Create trial
      const trial = await storage.createRankupTrial({
        walletAddress: publicKey,
        fromLevel: body.currentLevel,
        toLevel: body.targetLevel,
        requiredWalletHold: requirements.walletHold.toFixed(8),
        requiredVaultStake: requirements.vaultStake.toFixed(8),
        walletHoldAtStart: walletHold.toFixed(8),
        vaultStakeAtStart: vaultStake.toFixed(8),
        questionCount: 20,
        minAccuracy: "0.8",
        minAvgDifficulty: "3",
        trialStakeHive: trialStakeHive.toFixed(8),
      });

      await audit.log("rankup_trial_started", {
        targetType: "rankup_trial",
        targetId: trial.id,
        metadata: {
          fromLevel: body.currentLevel,
          toLevel: body.targetLevel,
          walletHold,
          vaultStake,
        },
      });

      res.json({
        ok: true,
        trial: {
          id: trial.id,
          fromLevel: trial.fromLevel,
          toLevel: trial.toLevel,
          questionCount: trial.questionCount,
          minAccuracy: parseFloat(trial.minAccuracy),
          minAvgDifficulty: parseFloat(trial.minAvgDifficulty),
          startedAt: trial.startedAt,
        },
        requirements: {
          walletHold: requirements.walletHold,
          vaultStake: requirements.vaultStake,
        },
        trialStakeHive: parseFloat(trial.trialStakeHive),
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "Invalid request format",
          details: error.errors,
        });
      }
      logger.error({ requestId: req.requestId, error: "Rank-up start error", details: error.message });
      res.status(500).json({ error: "Failed to start rank-up trial" });
    }
  });

  app.get("/api/rankup/active", requireAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const publicKey = (req as any).publicKey;
      const trial = await storage.getActiveRankupTrial(publicKey);

      if (!trial) {
        return res.json({
          ok: true,
          trial: null,
        });
      }

      res.json({
        ok: true,
        trial: {
          id: trial.id,
          fromLevel: trial.fromLevel,
          toLevel: trial.toLevel,
          questionCount: trial.questionCount,
          minAccuracy: parseFloat(trial.minAccuracy),
          minAvgDifficulty: parseFloat(trial.minAvgDifficulty),
          startedAt: trial.startedAt,
          status: trial.status,
        },
      });
    } catch (error: any) {
      logger.error({ requestId: req.requestId, error: "Rank-up active error", details: error.message });
      res.status(500).json({ error: "Failed to fetch active rank-up trial" });
    }
  });

  // Get questions for active rank-up trial
  app.post("/api/rankup/questions", requireAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const publicKey = (req as any).publicKey;
      const trial = await storage.getActiveRankupTrial(publicKey);

      if (!trial) {
        return res.status(404).json({
          error: "No active trial",
          message: "You must start a rank-up trial first",
        });
      }

      // Get user's intelligence level
      const balance = await storage.getOrCreateWalletBalance(publicKey);
      const intelligenceLevel = balance.level;

      // Use question selector for rank-up questions
      const { selectRankupQuestions } = await import("./services/questionSelector");
      const minDifficulty = Math.ceil(parseFloat(trial.minAvgDifficulty));
      const needed = trial.questionCount; // Preferred count (typically 20)
      const minRequired = 5; // Minimum required questions

      const result = await selectRankupQuestions({
        walletAddress: publicKey,
        trackId: undefined, // All tracks for rank-up
        intelligenceLevel,
        count: needed,
        avoidRecentDays: 30,
        allowSeen: false, // Prefer unseen questions
        minComplexity: minDifficulty,
      });

      // Check if we have the minimum required
      if (result.questions.length < minRequired) {
        return res.status(400).json({
          error: "Insufficient questions",
          minDifficulty,
          found: result.questions.length,
          needed: minRequired,
          totalAvailable: result.totalAvailable,
          filteredByComplexity: result.filteredByComplexity,
          filteredByHistory: result.filteredByHistory,
        });
      }

      // Record question history immediately (user has "seen" these questions)
      for (const question of result.questions) {
        try {
          await storage.recordQuestionHistory({
            walletAddress: publicKey,
            questionId: question.id,
            trackId: undefined, // Rank-up uses all tracks
            attemptId: null, // No attempt yet - just viewing
          });
        } catch (error: any) {
          // Non-blocking: log but don't fail the request
          logger.warn({
            requestId: req.requestId,
            error: "Failed to record question history (non-blocking)",
            questionId: question.id,
            details: error.message,
          });
        }
      }

      // Exclude numericAnswer (security)
      const sanitized = result.questions.map(q => {
        const { numericAnswer, ...rest } = q;
        return rest;
      });

      res.json({
        ok: true,
        questions: sanitized,
        trialId: trial.id,
      });
    } catch (error: any) {
      logger.error({ requestId: req.requestId, error: "Rank-up questions error", details: error.message });
      res.status(500).json({ error: "Failed to fetch rank-up questions" });
    }
  });

  // Complete rank-up trial
  const completeRankupSchema = z.object({
    trialId: z.string().uuid(),
    questionIds: z.array(z.string().uuid()),
    answers: z.array(z.union([z.number(), z.string()])),
  });

  app.post("/api/rankup/complete", requireAuthMiddleware, async (req: Request, res: Response) => {
    const audit = createAuditHelper(req);
    try {
      const publicKey = (req as any).publicKey;
      const body = completeRankupSchema.parse(req.body);

      // Get trial
      const trial = await storage.getRankupTrialById(body.trialId);
      if (!trial) {
        return res.status(404).json({ error: "Trial not found" });
      }

      // Validate trial belongs to user and is active
      if (trial.walletAddress !== publicKey) {
        return res.status(403).json({ error: "Trial does not belong to you" });
      }

      if (trial.status !== "active") {
        return res.status(400).json({
          error: "Trial not active",
          message: `Trial status is ${trial.status}, expected active`,
        });
      }

      // Validate question/answer counts
      // questionIds and answers must match in length
      if (body.questionIds.length !== body.answers.length) {
        return res.status(400).json({
          error: "Invalid answer count",
          message: `Question IDs count (${body.questionIds.length}) does not match answers count (${body.answers.length})`,
        });
      }
      
      // Must have at least 1 answer, and cannot exceed trial.questionCount
      if (body.answers.length === 0) {
        return res.status(400).json({
          error: "Invalid answer count",
          message: "Must provide at least 1 answer",
        });
      }
      
      if (body.answers.length > trial.questionCount) {
        return res.status(400).json({
          error: "Invalid answer count",
          message: `Received ${body.answers.length} answers, but trial only has ${trial.questionCount} questions`,
        });
      }

      // Fetch questions and grade
      const questions = await Promise.all(
        body.questionIds.map(id => storage.getQuestionById(id))
      );

      if (questions.some(q => !q)) {
        return res.status(400).json({ error: "Invalid question ID(s)" });
      }

      let correctCount = 0;
      let totalDifficulty = 0;
      const questionResults: { questionId: string; correct: boolean }[] = [];

      for (let i = 0; i < body.answers.length; i++) {
        const question = questions[i]!;
        const userAnswer = body.answers[i];
        let isCorrect = false;

        totalDifficulty += question.complexity;

        if (question.questionType === "numeric") {
          const { gradeNumeric } = await import("./utils/numericGrade");
          const tolerance = question.numericTolerance ? parseFloat(question.numericTolerance) : null;
          const result = gradeNumeric(
            typeof userAnswer === "string" ? userAnswer : String(userAnswer),
            question.numericAnswer || null,
            tolerance
          );
          isCorrect = result.correct;
        } else {
          const correctIndex = question.correctIndex;
          const userIndex = typeof userAnswer === "number" ? userAnswer : parseInt(String(userAnswer), 10);
          isCorrect = userIndex === correctIndex;
        }

        if (isCorrect) {
          correctCount++;
        }

        questionResults.push({
          questionId: question.id,
          correct: isCorrect,
        });
      }

      const totalCount = body.answers.length;
      const accuracy = correctCount / totalCount;
      const avgDifficulty = totalDifficulty / totalCount;

      // Check pass conditions
      const minAccuracy = parseFloat(trial.minAccuracy);
      const minAvgDifficulty = parseFloat(trial.minAvgDifficulty);
      const passed = accuracy >= minAccuracy && avgDifficulty >= minAvgDifficulty;

      const LOCK_CYCLES = parseInt(process.env.RANKUP_LOCK_CYCLES || "4", 10);
      const trialStakeAmount = parseFloat(trial.trialStakeHive);

      if (passed) {
        // PASS: Promote level, reset streak, move escrow to locked
        const currentLevel = await storage.getWalletLevel(publicKey);
        if (currentLevel !== trial.fromLevel) {
          return res.status(400).json({
            error: "Level mismatch",
            message: `Current level is ${currentLevel}, but trial is for ${trial.fromLevel} -> ${trial.toLevel}`,
          });
        }

        // Update trial
        await storage.updateRankupTrial(trial.id, {
          status: "passed",
          correctCount,
          totalCount,
          accuracy: accuracy.toFixed(4),
          avgDifficulty: avgDifficulty.toFixed(2),
          completedAt: new Date(),
        });

        // Promote level
        await storage.updateWalletLevel(publicKey, trial.toLevel);

        // Reset fail streak
        await storage.updateRankupFailStreak(publicKey, 0, null);

        // Release escrow to locked stake
        await storage.releaseEscrowToLocked(publicKey, trialStakeAmount.toFixed(8));
        
        const currentCycle = await storage.getCurrentCycle();
        if (currentCycle) {
          const userId = publicKey;
          
          await storage.createLock({
            userId,
            attemptId: trial.id,
            amount: trialStakeAmount.toFixed(8),
            originalAmount: trialStakeAmount.toFixed(8),
            cycleCreated: currentCycle.cycleNumber,
          });
        }

        await audit.log("rankup_trial_passed", {
          targetType: "rankup_trial",
          targetId: trial.id,
          metadata: {
            fromLevel: trial.fromLevel,
            toLevel: trial.toLevel,
            accuracy,
            avgDifficulty,
            trialStakeHive: trialStakeAmount,
          },
        });

        res.json({
          ok: true,
          result: "passed",
          correctCount,
          totalCount,
          accuracy,
          avgDifficulty,
          newLevel: trial.toLevel,
          failStreak: 0,
        });
      } else {
        // FAIL: Forfeit escrow, update streak, rollback on 3rd fail
        const failedReason = accuracy < minAccuracy
          ? `Accuracy ${(accuracy * 100).toFixed(1)}% below required ${(minAccuracy * 100).toFixed(1)}%`
          : `Average difficulty ${avgDifficulty.toFixed(2)} below required ${minAvgDifficulty.toFixed(2)}`;

        // Forfeit escrow (100% loss)
        await storage.forfeitEscrow(publicKey, trialStakeAmount.toFixed(8));
        
        // Record in rewards pool ledger and attempt transfer
        const { recordPoolDeposit, tryTransferToRewardsWallet } = await import("./services/rewardsPool");
        const currentCycle = await storage.getCurrentCycle();
        
        try {
          const ledgerId = await recordPoolDeposit({
            source: "rankup_forfeit",
            amountHive: trialStakeAmount.toFixed(8),
            walletPubkey: publicKey,
            cycleId: currentCycle?.id || undefined,
          });
          
          // Attempt transfer (best-effort, don't fail the request if it fails)
          tryTransferToRewardsWallet(ledgerId).catch((error) => {
            console.error("Failed to transfer to rewards wallet (non-blocking):", error);
          });
        } catch (error: any) {
          console.error("Failed to record pool deposit (non-blocking):", error);
          // Still add to legacy rewards pool as fallback
          await storage.addToRewardsPool(trialStakeAmount.toFixed(8));
        }

        // Get current fail streak
        const balance = await storage.getOrCreateWalletBalance(publicKey);
        let failStreak = balance.rankupFailStreak || 0;
        const streakTargetLevel = balance.rankupFailStreakTargetLevel;
        let rollbackApplied = false;
        let newLevel = balance.level;

        // Update fail streak
        if (streakTargetLevel !== trial.toLevel) {
          // New target level, reset streak
          failStreak = 1;
          await storage.updateRankupFailStreak(publicKey, 1, trial.toLevel);
        } else {
          // Same target level, increment streak
          failStreak += 1;
          await storage.updateRankupFailStreak(publicKey, failStreak, trial.toLevel);
        }

        // Check for rollback on 3rd fail
        if (failStreak >= 3) {
          const currentLevel = balance.level;
          newLevel = Math.max(1, currentLevel - 1);
          await storage.updateWalletLevel(publicKey, newLevel);
          await storage.updateRankupFailStreak(publicKey, 0, null);
          rollbackApplied = true;
          failStreak = 0; // Reset after rollback
        }

        // Update trial
        await storage.updateRankupTrial(trial.id, {
          status: "failed",
          correctCount,
          totalCount,
          accuracy: accuracy.toFixed(4),
          avgDifficulty: avgDifficulty.toFixed(2),
          failedReason,
          slashedHive: trialStakeAmount.toFixed(8), // Record forfeited amount
          rollbackApplied,
          completedAt: new Date(),
        });

        await audit.log("rankup_trial_failed", {
          targetType: "rankup_trial",
          targetId: trial.id,
          metadata: {
            fromLevel: trial.fromLevel,
            toLevel: trial.toLevel,
            accuracy,
            avgDifficulty,
            failedReason,
            trialStakeHive: trialStakeAmount,
            failStreak,
            rollbackApplied,
            newLevel: rollbackApplied ? newLevel : undefined,
          },
        });

        res.json({
          ok: true,
          result: "failed",
          correctCount,
          totalCount,
          accuracy,
          avgDifficulty,
          failedReason,
          failStreak,
          rollbackApplied,
          newLevel: rollbackApplied ? newLevel : undefined,
        });
      }
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "Invalid request format",
          details: error.errors,
        });
      }
      logger.error({ requestId: req.requestId, error: "Rank-up complete error", details: error.message });
      res.status(500).json({ error: "Failed to complete rank-up trial" });
    }
  });

  // ===== BULK QUESTION IMPORT =====
  
  const bulkImportSchema = z.object({
    trackId: z.string().uuid(),
    questions: z.array(z.object({
      prompt: z.string().max(2000),
      difficulty: z.number().int().min(1).max(5),
      questionType: z.enum(["mcq", "numeric"]),
      numericAnswer: z.string().optional(),
      numericTolerance: z.number().min(0).nullable().optional(),
      numericUnit: z.string().nullable().optional(),
      choices: z.array(z.string()).optional(),
      correctChoiceIndex: z.number().int().min(0).optional(),
    })),
  });

  app.post("/api/questions/bulk-import", requireAuthMiddleware, requireCreator, async (req: Request, res: Response) => {
    const audit = createAuditHelper(req);
    try {
      const body = bulkImportSchema.parse(req.body);

      // Verify track exists
      const track = await storage.getTrack(body.trackId);
      if (!track) {
        return res.status(404).json({ error: "Track not found" });
      }

      // Validate questions
      const { validateBulkImport, convertToDbQuestion } = await import("./services/bulkImport");
      const validationErrors = validateBulkImport(body.questions);

      if (validationErrors.length > 0) {
        return res.status(400).json({
          error: "Validation failed",
          errors: validationErrors,
        });
      }

      // Convert and batch insert
      const dbQuestions = body.questions.map(q => convertToDbQuestion(q, body.trackId));
      
      // Use batch insert via storage
      const results = await storage.createQuestionsBatch(dbQuestions);

      await audit.log("bulk_import_questions", {
        targetType: "track",
        targetId: body.trackId,
        metadata: { 
          questionCount: results.length,
          trackName: track.name,
        },
      });

      res.json({
        ok: true,
        createdCount: results.length,
        trackId: body.trackId,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "Invalid request format",
          details: error.errors,
        });
      }
      logger.error({ requestId: req.requestId, error: "Bulk import error", details: error.message });
      res.status(500).json({ error: "Failed to import questions" });
    }
  });

  return httpServer;
}
