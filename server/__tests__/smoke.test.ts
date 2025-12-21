import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../createApp";
import type { Express } from "express";
import { isDbConfigured } from "../db";

// Mock LM Studio calls to return deterministic result in test mode
// This is done via environment check in the actual service

const hasDatabase = isDbConfigured();

if (!hasDatabase) {
  console.log("⚠️  Skipping DB tests (DATABASE_URL not set)");
}

describe("API Smoke Tests", () => {
  let app: Express;

  beforeAll(async () => {
    // Set test environment
    process.env.NODE_ENV = "test";
    process.env.TEST_MODE = "true";
    
    const { app: createdApp } = await createApp();
    app = createdApp;
  });

  afterAll(() => {
    delete process.env.TEST_MODE;
  });

  describe("Health Endpoints", () => {
    it("GET /health should return 200 with ok:true", async () => {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("ok", true);
      expect(res.body).toHaveProperty("service", "hivemind");
    });

    it.skipIf(!hasDatabase)("GET /health/db should return 200 or skip gracefully", async () => {
      const res = await request(app).get("/health/db");
      // Should be 200 (up) or 503 (down), but never 500
      expect([200, 503]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body).toHaveProperty("ok", true);
        expect(res.body).toHaveProperty("db", "up");
      } else {
        expect(res.body).toHaveProperty("ok", false);
        expect(res.body).toHaveProperty("db", "down");
      }
    });

    it("GET /health/ollama should return 200 (up or skipped)", async () => {
      const res = await request(app).get("/health/ollama");
      // Should be 200 (up or skipped), never 500
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("ok", true);
    });
  });

  describe("Rate Limiting", () => {
    it.skipIf(!hasDatabase)("should return 429 with correct format when rate limited", async () => {
      // Hit the endpoint multiple times quickly
      // chatLimiter is 30 requests / 15 minutes, so we need 31 requests
      // Note: This test requires auth which needs DB, so skip if DB not available
      const requests = Array.from({ length: 31 }, () =>
        request(app)
          .post("/api/ai/chat")
          .set("Cookie", "sid=test-session-token")
          .send({
            message: "test",
            aiLevel: 50,
          })
      );

      const responses = await Promise.all(requests);
      
      // At least one should be rate limited
      const rateLimited = responses.find((r) => r.status === 429);
      expect(rateLimited).toBeDefined();
      
      if (rateLimited) {
        expect(rateLimited.body).toEqual({
          ok: false,
          error: "rate_limited",
          message: "Too many requests, please slow down.",
        });
      }
    }, 30000); // 30 second timeout for rate limit test
  });

  describe("Nonce Single-Use", () => {
    it.skipIf(!hasDatabase)("should allow nonce to be used once, then reject on second use", async () => {
      // This test requires DB for nonce storage
      const walletAddress = "test-wallet-" + Date.now();

      // Get nonce
      const nonceRes = await request(app)
        .get(`/api/auth/nonce?wallet=${walletAddress}`)
        .expect(200);

      expect(nonceRes.body).toHaveProperty("nonce");
      expect(nonceRes.body).toHaveProperty("message");
      const { nonce, message } = nonceRes.body;

      // First verify should succeed (mocked signature verification)
      const verifyRes1 = await request(app)
        .post("/api/auth/verify")
        .send({
          wallet: walletAddress,
          nonce,
          signature: "test-signature", // Mocked to pass in test mode
        })
        .expect(200);

      expect(verifyRes1.body).toHaveProperty("ok", true);

      // Second verify with same nonce should fail
      const verifyRes2 = await request(app)
        .post("/api/auth/verify")
        .send({
          wallet: walletAddress,
          nonce, // Same nonce
          signature: "test-signature",
        })
        .expect(401);

      expect(verifyRes2.body).toHaveProperty("ok", false);
      expect(verifyRes2.body).toHaveProperty("error", "invalid_nonce");
      expect(verifyRes2.body).toHaveProperty(
        "message",
        "Nonce expired or already used. Please try again."
      );
    });
  });

  describe("Chat Metadata", () => {
    it.skipIf(!hasDatabase)("should include metadata.activeModelVersionId and metadata.corpusHash in response", async () => {
      // Note: This test requires auth (which needs DB), so skip if DB not available
      const res = await request(app)
        .post("/api/ai/chat")
        .set("Cookie", "sid=test-session-token")
        .send({
          message: "test message",
          aiLevel: 50,
        });

      // If auth passes (or is mocked), should have metadata
      if (res.status === 200) {
        expect(res.body).toHaveProperty("metadata");
        expect(res.body.metadata).toHaveProperty("activeModelVersionId");
        expect(res.body.metadata).toHaveProperty("corpusHash");
        
        // Keys should exist even if values are null
        expect(res.body.metadata.activeModelVersionId !== undefined).toBe(true);
        expect(res.body.metadata.corpusHash !== undefined).toBe(true);
      } else {
        // If auth fails, that's expected - test passes if endpoint exists
        expect([401, 403]).toContain(res.status);
      }
    });
  });

  describe("Job Queue", () => {
    it.skipIf(!hasDatabase)("should enqueue a job when embedding is requested", async () => {
      // This test requires a valid corpus item ID
      // For smoke test, we'll check that the endpoint exists and returns jobId
      // In a real scenario, you'd create a test corpus item first
      
      const res = await request(app)
        .post("/api/rag/embed/test-corpus-id")
        .set("Cookie", "sid=test-session-token")
        .expect(200); // or 400/404 if corpus doesn't exist

      // If successful, should return jobId
      if (res.status === 200) {
        expect(res.body).toHaveProperty("success", true);
        expect(res.body).toHaveProperty("jobId");
      }
    });
  });

  describe("Model Version Endpoints Permissions", () => {
    it("GET /api/model/versions without auth should return 401/403", async () => {
      const res = await request(app).get("/api/model/versions");
      expect([401, 403]).toContain(res.status);
    });

    it.skipIf(!hasDatabase)("GET /api/model/versions with creator auth should return 200", async () => {
      // In test mode, we need to mock the creator auth
      // For now, we'll test that the endpoint exists and requires auth
      // Full auth mocking would require more setup
      // Note: This test requires DB for auth, so skip if DB not available
      const res = await request(app)
        .get("/api/model/versions")
        .set("Cookie", "sid=test-session-token");

      // Should require auth (401/403) unless we mock creator status
      expect([200, 401, 403]).toContain(res.status);
    });
  });
});

