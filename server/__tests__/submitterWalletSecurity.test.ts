import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../createApp";
import type { Express } from "express";
import { isDbConfigured } from "../db";
import { storage } from "../storage";
import { createSession, issueNonce } from "../auth";

const hasDatabase = isDbConfigured();

if (!hasDatabase) {
  console.log("⚠️  Skipping submitter wallet security tests (DATABASE_URL not set)");
}

describe("Submitter Wallet Security", () => {
  let app: Express;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.TEST_MODE = "true";
    
    const { app: createdApp } = await createApp();
    app = createdApp;
  });

  // Helper to create an authenticated session
  async function createAuthenticatedSession(walletAddress: string): Promise<string> {
    const { nonce } = await issueNonce(walletAddress);
    
    const verifyRes = await request(app)
      .post("/api/auth/verify")
      .send({
        wallet: walletAddress,
        nonce,
        signature: "test-signature",
      });
    
    if (verifyRes.status !== 200) {
      throw new Error(`Failed to create session: ${verifyRes.body.error}`);
    }
    
    const cookies = verifyRes.headers["set-cookie"];
    if (!cookies || !Array.isArray(cookies)) {
      throw new Error("No session cookie returned");
    }
    
    const sidCookie = cookies.find((c: string) => c.startsWith("sid="));
    if (!sidCookie) {
      throw new Error("No sid cookie found");
    }
    
    const match = sidCookie.match(/sid=([^;]+)/);
    if (!match) {
      throw new Error("Could not extract session token from cookie");
    }
    
    return match[1];
  }

  describe("Corpus item submitter wallet", () => {
    it.skipIf(!hasDatabase)("should store submitter wallet from session, not client body", async () => {
      const sessionWallet = "CorpusWallet1111111111111111111111111111111111";
      const spoofedWallet = "SpoofedCorpusWallet22222222222222222222222222";
      
      // Create authenticated session
      const sessionToken = await createAuthenticatedSession(sessionWallet);
      
      // Create a user with creator access
      const user = await storage.createUser({
        username: sessionWallet,
        password: "test-password",
      });
      await storage.updateUserRole(user.id, "admin", true);
      
      // Create test track
      const track = await storage.createTrack({
        name: "Test Track",
        description: "Test",
      });
      
      const cycle = await storage.getCurrentCycle();
      if (!cycle) {
        throw new Error("No current cycle");
      }
      
      // Submit corpus item with spoofed wallet in body
      const res = await request(app)
        .post("/api/corpus")
        .set("Cookie", `sid=${sessionToken}`)
        .send({
          text: "Test corpus item text",
          trackId: track.id,
          // Attempt to spoof wallet (should be ignored)
          submitterWalletPubkey: spoofedWallet,
          createdByWallet: spoofedWallet,
        });
      
      expect(res.status).toBe(200);
      
      // Verify the corpus item was stored with the session wallet, not the spoofed wallet
      const items = await storage.getAllCorpusItems();
      const createdItem = items.find(item => item.normalizedText.includes("test corpus item"));
      expect(createdItem).toBeDefined();
      expect(createdItem!.submitterWalletPubkey).toBe(sessionWallet);
      expect(createdItem!.submitterWalletPubkey).not.toBe(spoofedWallet);
      // Legacy field should also be set
      expect(createdItem!.createdByWallet).toBe(sessionWallet);
    });
  });

  describe("Train attempt submitter wallet", () => {
    it.skipIf(!hasDatabase)("should store submitter wallet from session, not client body", async () => {
      const sessionWallet = "AttemptWallet1111111111111111111111111111111111";
      const spoofedWallet = "SpoofedAttemptWallet2222222222222222222222222";
      
      // Create authenticated session
      const sessionToken = await createAuthenticatedSession(sessionWallet);
      
      // Create test track and questions
      const track = await storage.createTrack({
        name: "Attempt Test Track",
        description: "Test",
      });
      
      const question = await storage.createQuestion({
        trackId: track.id,
        text: "Test question?",
        options: ["A", "B", "C", "D"],
        correctIndex: 0,
        complexity: 1,
      });
      
      const cycle = await storage.getCurrentCycle();
      if (!cycle) {
        throw new Error("No current cycle");
      }
      
      // Create wallet balance for stake
      await storage.getOrCreateWalletBalance(sessionWallet);
      await storage.updateStakeBalance(sessionWallet, "1000");
      
      // Submit train attempt with spoofed wallet in body
      const res = await request(app)
        .post("/api/train-attempts/submit")
        .set("Cookie", `sid=${sessionToken}`)
        .send({
          trackId: track.id,
          difficulty: "low",
          content: "Test attempt content",
          answers: [0],
          questionIds: [question.id],
          startTime: Date.now(),
          // Attempt to spoof wallet (should be ignored)
          submitterWalletPubkey: spoofedWallet,
          walletAddress: spoofedWallet,
        });
      
      expect(res.status).toBe(200);
      
      // Get the created attempt from database
      const pendingAttempts = await storage.getPendingAttempts();
      const createdAttempt = pendingAttempts.find(a => a.content === "Test attempt content");
      expect(createdAttempt).toBeDefined();
      expect(createdAttempt!.submitterWalletPubkey).toBe(sessionWallet);
      expect(createdAttempt!.submitterWalletPubkey).not.toBe(spoofedWallet);
    });
  });

  describe("Self-review protection", () => {
    it.skipIf(!hasDatabase)("should skip reviewer shares when submitter reviews own attempt and self-review disabled", async () => {
      // Temporarily disable self-review
      const originalEnv = process.env.REWARDS_REVIEWER_SELF_REVIEW;
      process.env.REWARDS_REVIEWER_SELF_REVIEW = "false";
      
      try {
        const submitterWallet = "SelfReviewWallet1111111111111111111111111111";
        const reviewerWallet = submitterWallet; // Same wallet
        
        // Create authenticated sessions
        const submitterToken = await createAuthenticatedSession(submitterWallet);
        const reviewerToken = await createAuthenticatedSession(reviewerWallet);
        
        // Create reviewer user
        const reviewer = await storage.createUser({
          username: reviewerWallet,
          password: "test-password",
        });
        await storage.updateUserRole(reviewer.id, "reviewer", true);
        
        // Create test track and questions
        const track = await storage.createTrack({
          name: "Self Review Test Track",
          description: "Test",
        });
        
        const question = await storage.createQuestion({
          trackId: track.id,
          text: "Self review question?",
          options: ["A", "B", "C", "D"],
          correctIndex: 0,
          complexity: 1,
        });
        
        const cycle = await storage.getCurrentCycle();
        if (!cycle) {
          throw new Error("No current cycle");
        }
        
        // Create wallet balance for stake
        await storage.getOrCreateWalletBalance(submitterWallet);
        await storage.updateStakeBalance(submitterWallet, "1000");
        
        // Submit train attempt
        const attemptRes = await request(app)
          .post("/api/train-attempts/submit")
          .set("Cookie", `sid=${submitterToken}`)
          .send({
            trackId: track.id,
            difficulty: "low",
            content: "Self review attempt",
            answers: [0],
            questionIds: [question.id],
            startTime: Date.now(),
          });
        
        expect(attemptRes.status).toBe(200);
        
        // Get the created attempt
        const pendingAttempts = await storage.getPendingAttempts();
        const attempt = pendingAttempts.find(a => a.content === "Self review attempt");
        expect(attempt).toBeDefined();
        expect(attempt!.submitterWalletPubkey).toBe(submitterWallet);
        
        // Submit review from the same wallet (self-review)
        const reviewRes = await request(app)
          .post("/api/reviews/submit")
          .set("Cookie", `sid=${reviewerToken}`)
          .send({
            attemptId: attempt!.id,
            vote: "approve",
          });
        
        expect(reviewRes.status).toBe(200);
        
        // Verify review was created
        const reviews = await storage.getReviewsForAttempt(attempt!.id);
        expect(reviews.length).toBe(1);
        expect(reviews[0].reviewerWalletAddress).toBe(reviewerWallet);
        
        // Manually trigger consensus check by submitting enough reviews
        // For low difficulty, we need 2 approve votes
        const reviewer2 = await storage.createUser({
          username: "Reviewer2Wallet2222222222222222222222222222222",
          password: "test-password",
        });
        await storage.updateUserRole(reviewer2.id, "reviewer", true);
        const reviewer2Token = await createAuthenticatedSession("Reviewer2Wallet2222222222222222222222222222222");
        
        const review2Res = await request(app)
          .post("/api/reviews/submit")
          .set("Cookie", `sid=${reviewer2Token}`)
          .send({
            attemptId: attempt!.id,
            vote: "approve",
          });
        
        expect(review2Res.status).toBe(200);
        
        // Check reviewer shares - submitter's review should NOT generate shares
        const { db } = await import("../db");
        const { contributorSharesV2 } = await import("@shared/schema");
        const { eq, and } = await import("drizzle-orm");
        
        const reviewerShares = await db
          .select()
          .from(contributorSharesV2)
          .where(
            and(
              eq(contributorSharesV2.cycleId, cycle.id),
              eq(contributorSharesV2.source, "review_reward"),
              eq(contributorSharesV2.refId, attempt!.id)
            )
          );
        
        // Should only have shares for reviewer2, not for submitter
        expect(reviewerShares.length).toBe(1);
        expect(reviewerShares[0].walletPubkey).toBe("Reviewer2Wallet2222222222222222222222222222222");
        expect(reviewerShares[0].walletPubkey).not.toBe(submitterWallet);
      } finally {
        // Restore original env
        if (originalEnv !== undefined) {
          process.env.REWARDS_REVIEWER_SELF_REVIEW = originalEnv;
        } else {
          delete process.env.REWARDS_REVIEWER_SELF_REVIEW;
        }
      }
    });

    it.skipIf(!hasDatabase)("should allow reviewer shares when different wallet reviews", async () => {
      const submitterWallet = "SubmitterWallet3333333333333333333333333333333";
      const reviewerWallet = "ReviewerWallet4444444444444444444444444444444";
      
      // Create authenticated sessions
      const submitterToken = await createAuthenticatedSession(submitterWallet);
      const reviewerToken = await createAuthenticatedSession(reviewerWallet);
      
      // Create reviewer user
      const reviewer = await storage.createUser({
        username: reviewerWallet,
        password: "test-password",
      });
      await storage.updateUserRole(reviewer.id, "reviewer", true);
      
      // Create test track and questions
      const track = await storage.createTrack({
        name: "Different Reviewer Test Track",
        description: "Test",
      });
      
      const question = await storage.createQuestion({
        trackId: track.id,
        text: "Different reviewer question?",
        options: ["A", "B", "C", "D"],
        correctIndex: 0,
        complexity: 1,
      });
      
      const cycle = await storage.getCurrentCycle();
      if (!cycle) {
        throw new Error("No current cycle");
      }
      
      // Create wallet balance for stake
      await storage.getOrCreateWalletBalance(submitterWallet);
      await storage.updateStakeBalance(submitterWallet, "1000");
      
      // Submit train attempt
      const attemptRes = await request(app)
        .post("/api/train-attempts/submit")
        .set("Cookie", `sid=${submitterToken}`)
        .send({
          trackId: track.id,
          difficulty: "low",
          content: "Different reviewer attempt",
          answers: [0],
          questionIds: [question.id],
          startTime: Date.now(),
        });
      
      expect(attemptRes.status).toBe(200);
      
      // Get the created attempt
      const pendingAttempts = await storage.getPendingAttempts();
      const attempt = pendingAttempts.find(a => a.content === "Different reviewer attempt");
      expect(attempt).toBeDefined();
      expect(attempt!.submitterWalletPubkey).toBe(submitterWallet);
      
      // Submit review from different wallet
      const reviewRes = await request(app)
        .post("/api/reviews/submit")
        .set("Cookie", `sid=${reviewerToken}`)
        .send({
          attemptId: attempt!.id,
          vote: "approve",
        });
      
      expect(reviewRes.status).toBe(200);
      
      // Add another reviewer to reach consensus
      const reviewer2 = await storage.createUser({
        username: "Reviewer2Wallet5555555555555555555555555555555",
        password: "test-password",
      });
      await storage.updateUserRole(reviewer2.id, "reviewer", true);
      const reviewer2Token = await createAuthenticatedSession("Reviewer2Wallet5555555555555555555555555555555");
      
      const review2Res = await request(app)
        .post("/api/reviews/submit")
        .set("Cookie", `sid=${reviewer2Token}`)
        .send({
          attemptId: attempt!.id,
          vote: "approve",
        });
      
      expect(review2Res.status).toBe(200);
      
      // Check reviewer shares - both reviewers should get shares
      const { db } = await import("../db");
      const { contributorSharesV2 } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      
      const reviewerShares = await db
        .select()
        .from(contributorSharesV2)
        .where(
          and(
            eq(contributorSharesV2.cycleId, cycle.id),
            eq(contributorSharesV2.source, "review_reward"),
            eq(contributorSharesV2.refId, attempt!.id)
          )
        );
      
      // Should have shares for both reviewers, not for submitter
      expect(reviewerShares.length).toBe(2);
      const walletPubkeys = reviewerShares.map(s => s.walletPubkey);
      expect(walletPubkeys).toContain(reviewerWallet);
      expect(walletPubkeys).toContain("Reviewer2Wallet5555555555555555555555555555555");
      expect(walletPubkeys).not.toContain(submitterWallet);
    });
  });
});

