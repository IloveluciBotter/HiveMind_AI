import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../createApp";
import type { Express } from "express";
import { isDbConfigured } from "../db";
import { storage } from "../storage";
import { createSession, issueNonce, consumeNonce } from "../auth";

const hasDatabase = isDbConfigured();

if (!hasDatabase) {
  console.log("⚠️  Skipping review wallet security tests (DATABASE_URL not set)");
}

describe("Review Wallet Security", () => {
  let app: Express;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.TEST_MODE = "true";
    
    const { app: createdApp } = await createApp();
    app = createdApp;
  });

  // Helper to create an authenticated session
  async function createAuthenticatedSession(walletAddress: string): Promise<string> {
    // Issue nonce
    const { nonce, message } = await issueNonce(walletAddress);
    
    // In test mode, signature verification is bypassed, so we can use any signature
    const verifyRes = await request(app)
      .post("/api/auth/verify")
      .send({
        wallet: walletAddress,
        nonce,
        signature: "test-signature", // Ignored in test mode
      });
    
    if (verifyRes.status !== 200) {
      throw new Error(`Failed to create session: ${verifyRes.body.error}`);
    }
    
    // Extract session token from Set-Cookie header
    const cookies = verifyRes.headers["set-cookie"];
    if (!cookies || !Array.isArray(cookies)) {
      throw new Error("No session cookie returned");
    }
    
    const sidCookie = cookies.find((c: string) => c.startsWith("sid="));
    if (!sidCookie) {
      throw new Error("No sid cookie found");
    }
    
    // Extract token from "sid=TOKEN; ..."
    const match = sidCookie.match(/sid=([^;]+)/);
    if (!match) {
      throw new Error("Could not extract session token from cookie");
    }
    
    return match[1];
  }

  describe("Review submission wallet security", () => {
    it.skipIf(!hasDatabase)("should use session wallet address, not client body wallet", async () => {
      // Create a test user with reviewer access
      const sessionWallet = "SessionWallet1111111111111111111111111111111111";
      const spoofedWallet = "SpoofedWallet2222222222222222222222222222222222";
      
      // Create authenticated session
      const sessionToken = await createAuthenticatedSession(sessionWallet);
      
      // Create a user with reviewer access (use wallet as username for simplicity)
      const user = await storage.createUser({
        username: sessionWallet,
        password: "test-password",
      });
      await storage.updateUserRole(user.id, "reviewer", true);
      
      // Create a test track and attempt
      const track = await storage.createTrack({
        name: "Test Track",
        description: "Test",
      });
      
      // Create a pending attempt
      const cycle = await storage.getCurrentCycle();
      if (!cycle) {
        throw new Error("No current cycle");
      }
      
      const attempt = await storage.createTrainAttempt({
        userId: user.id,
        trackId: track.id,
        difficulty: "low",
        cost: "10",
        content: "Test content",
        cycleId: cycle.id,
      });
      
      // Submit review with spoofed wallet in body
      // The server should ignore the body wallet and use session wallet
      const res = await request(app)
        .post("/api/reviews/submit")
        .set("Cookie", `sid=${sessionToken}`)
        .send({
          attemptId: attempt.id,
          vote: "approve",
          // Attempt to spoof wallet (should be ignored)
          publicKey: spoofedWallet,
          walletAddress: spoofedWallet,
        });
      
      expect(res.status).toBe(200);
      
      // Verify the review was stored with the session wallet, not the spoofed wallet
      const reviews = await storage.getReviewsForAttempt(attempt.id);
      expect(reviews.length).toBe(1);
      expect(reviews[0].reviewerWalletAddress).toBe(sessionWallet);
      expect(reviews[0].reviewerWalletAddress).not.toBe(spoofedWallet);
    });

    it.skipIf(!hasDatabase)("should return 401 if session wallet is missing", async () => {
      // Create a test user with reviewer access
      const wallet = "TestWallet333333333333333333333333333333333333";
      const user = await storage.createUser({
        username: wallet,
        password: "test-password",
      });
      await storage.updateUserRole(user.id, "reviewer", true);
      
      // Create a test track and attempt
      const track = await storage.createTrack({
        name: "Test Track 2",
        description: "Test",
      });
      
      const cycle = await storage.getCurrentCycle();
      if (!cycle) {
        throw new Error("No current cycle");
      }
      
      const attempt = await storage.createTrainAttempt({
        userId: user.id,
        trackId: track.id,
        difficulty: "low",
        cost: "10",
        content: "Test content",
        cycleId: cycle.id,
      });
      
      // Try to submit review without valid session
      const res = await request(app)
        .post("/api/reviews/submit")
        .send({
          attemptId: attempt.id,
          vote: "approve",
          walletAddress: wallet, // Client provides wallet, but no session
        });
      
      // Should reject because session wallet is required
      expect(res.status).toBe(401);
    });

    it.skipIf(!hasDatabase)("should only count reviews with session wallet for rewards", async () => {
      const sessionWallet1 = "RewardWallet1111111111111111111111111111111111";
      const sessionWallet2 = "RewardWallet2222222222222222222222222222222222";
      
      // Create authenticated sessions for both wallets
      const token1 = await createAuthenticatedSession(sessionWallet1);
      const token2 = await createAuthenticatedSession(sessionWallet2);
      
      // Create reviewer users
      const user1 = await storage.createUser({
        username: sessionWallet1,
        password: "test-password",
      });
      await storage.updateUserRole(user1.id, "reviewer", true);
      
      const user2 = await storage.createUser({
        username: sessionWallet2,
        password: "test-password",
      });
      await storage.updateUserRole(user2.id, "reviewer", true);
      
      // Create test track and attempt
      const track = await storage.createTrack({
        name: "Rewards Test Track",
        description: "Test",
      });
      
      const cycle = await storage.getCurrentCycle();
      if (!cycle) {
        throw new Error("No current cycle");
      }
      
      const attempt = await storage.createTrainAttempt({
        userId: user1.id,
        trackId: track.id,
        difficulty: "low",
        cost: "10",
        content: "Test content",
        cycleId: cycle.id,
      });
      
      // Submit first review with session wallet 1
      const res1 = await request(app)
        .post("/api/reviews/submit")
        .set("Cookie", `sid=${token1}`)
        .send({
          attemptId: attempt.id,
          vote: "approve",
        });
      
      expect(res1.status).toBe(200);
      
      // Submit second review with session wallet 2 (with spoofed wallet in body)
      const spoofedWallet = "SpoofedRewardWallet333333333333333333333333333";
      const res2 = await request(app)
        .post("/api/reviews/submit")
        .set("Cookie", `sid=${token2}`)
        .send({
          attemptId: attempt.id,
          vote: "approve",
          publicKey: spoofedWallet, // Attempt to spoof - should be ignored
        });
      
      expect(res2.status).toBe(200);
      
      // Verify both reviews have correct session wallets
      const reviews = await storage.getReviewsForAttempt(attempt.id);
      expect(reviews.length).toBe(2);
      
      const wallets = reviews.map(r => r.reviewerWalletAddress).filter(Boolean);
      expect(wallets).toContain(sessionWallet1);
      expect(wallets).toContain(sessionWallet2);
      expect(wallets).not.toContain(spoofedWallet);
      
      // Verify that only reviews with valid session wallets would be counted for rewards
      const approveReviews = reviews.filter(r => r.vote === "approve" && r.reviewerWalletAddress);
      expect(approveReviews.length).toBe(2);
      expect(approveReviews.every(r => r.reviewerWalletAddress === sessionWallet1 || r.reviewerWalletAddress === sessionWallet2)).toBe(true);
    });
  });
});

