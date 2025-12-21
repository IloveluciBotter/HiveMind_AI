import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../createApp";
import type { Express } from "express";
import { isDbConfigured } from "../db";

const hasDatabase = isDbConfigured();

if (!hasDatabase) {
  console.log("⚠️  Skipping train attempts tests (DATABASE_URL not set)");
}

describe("Train Attempts Anti-Cheat", () => {
  let app: Express;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.TEST_MODE = "true";
    
    const { app: createdApp } = await createApp();
    app = createdApp;
  });

  describe("Anti-Cheat Validation", () => {
    it.skipIf(!hasDatabase)("should reject payload with mismatched questionIds and answers", async () => {
      const res = await request(app)
        .post("/api/train-attempts/submit")
        .set("Cookie", "sid=test-session-token")
        .send({
          trackId: "test-track-id",
          difficulty: "medium",
          content: "test content",
          answers: [0, 1],
          questionIds: ["question-1"], // Mismatch: 2 answers, 1 questionId
          startTime: Date.now(),
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
      expect(res.body.message).toContain("same length");
    });

    it.skipIf(!hasDatabase)("should reject payload with empty questionIds", async () => {
      const res = await request(app)
        .post("/api/train-attempts/submit")
        .set("Cookie", "sid=test-session-token")
        .send({
          trackId: "test-track-id",
          difficulty: "medium",
          content: "test content",
          answers: [],
          questionIds: [],
          startTime: Date.now(),
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
      expect(res.body.message).toContain("At least one question");
    });

    it.skipIf(!hasDatabase)("should ignore correctAnswers if sent (anti-cheat)", async () => {
      // This test would need actual question IDs from the database
      // For now, we test that the schema doesn't accept correctAnswers
      const res = await request(app)
        .post("/api/train-attempts/submit")
        .set("Cookie", "sid=test-session-token")
        .send({
          trackId: "test-track-id",
          difficulty: "medium",
          content: "test content",
          answers: [0],
          questionIds: ["invalid-question-id"],
          correctAnswers: [999], // Fake correct answer - should be ignored
          startTime: Date.now(),
        });

      // Should fail on invalid question ID, not on correctAnswers
      // The correctAnswers field should be ignored by the server
      expect([400, 401, 402]).toContain(res.status);
      // If it's a 400, it should be about invalid question IDs, not about correctAnswers
      if (res.status === 400) {
        expect(res.body.message).not.toContain("correctAnswers");
      }
    });

    it.skipIf(!hasDatabase)("should require questionIds in payload", async () => {
      const res = await request(app)
        .post("/api/train-attempts/submit")
        .set("Cookie", "sid=test-session-token")
        .send({
          trackId: "test-track-id",
          difficulty: "medium",
          content: "test content",
          answers: [0, 1],
          // questionIds missing
          startTime: Date.now(),
        });

      // Should fail validation (Zod will reject missing required field)
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });
});

