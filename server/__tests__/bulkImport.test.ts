import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../createApp";
import type { Express } from "express";
import { isDbConfigured } from "../db";

const hasDatabase = isDbConfigured();

if (!hasDatabase) {
  console.log("⚠️  Skipping bulk import tests (DATABASE_URL not set)");
}

describe("Bulk Question Import", () => {
  let app: Express;
  let testTrackId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.TEST_MODE = "true";
    
    const { app: createdApp } = await createApp();
    app = createdApp;

    // Create a test track if database is available
    if (hasDatabase) {
      const { storage } = await import("../storage");
      const track = await storage.createTrack("Test Track for Bulk Import", "Test description");
      testTrackId = track.id;
    }
  });

  describe("Validation", () => {
    it.skipIf(!hasDatabase)("should reject requests with over 200 questions", async () => {
      const questions = Array.from({ length: 201 }, () => ({
        prompt: "Test question",
        difficulty: 1,
        questionType: "numeric" as const,
        numericAnswer: "42",
      }));

      const res = await request(app)
        .post("/api/questions/bulk-import")
        .set("Cookie", "sid=test-session-token")
        .send({
          trackId: testTrackId,
          questions,
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("errors");
      expect(res.body.errors.some((e: any) => e.message.includes("200"))).toBe(true);
    });

    it.skipIf(!hasDatabase)("should reject invalid numericAnswer", async () => {
      const res = await request(app)
        .post("/api/questions/bulk-import")
        .set("Cookie", "sid=test-session-token")
        .send({
          trackId: testTrackId,
          questions: [
            {
              prompt: "What is 2+2?",
              difficulty: 1,
              questionType: "numeric",
              numericAnswer: "not-a-number", // Invalid
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("errors");
      const errors = res.body.errors as Array<{ index: number; field: string; message: string }>;
      expect(errors.some(e => e.field === "numericAnswer" && e.index === 0)).toBe(true);
    });

    it.skipIf(!hasDatabase)("should reject MCQ without choices", async () => {
      const res = await request(app)
        .post("/api/questions/bulk-import")
        .set("Cookie", "sid=test-session-token")
        .send({
          trackId: testTrackId,
          questions: [
            {
              prompt: "What is 2+2?",
              difficulty: 1,
              questionType: "mcq",
              // Missing choices
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("errors");
      const errors = res.body.errors as Array<{ index: number; field: string; message: string }>;
      expect(errors.some(e => e.field === "choices" && e.index === 0)).toBe(true);
    });

    it.skipIf(!hasDatabase)("should reject invalid difficulty", async () => {
      const res = await request(app)
        .post("/api/questions/bulk-import")
        .set("Cookie", "sid=test-session-token")
        .send({
          trackId: testTrackId,
          questions: [
            {
              prompt: "Test question",
              difficulty: 10, // Invalid (must be 1-5)
              questionType: "numeric",
              numericAnswer: "42",
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("errors");
    });
  });

  describe("Successful Import", () => {
    it.skipIf(!hasDatabase)("should successfully import valid numeric questions", async () => {
      const res = await request(app)
        .post("/api/questions/bulk-import")
        .set("Cookie", "sid=test-session-token")
        .send({
          trackId: testTrackId,
          questions: [
            {
              prompt: "What is 15 + 27?",
              difficulty: 1,
              questionType: "numeric",
              numericAnswer: "42",
            },
            {
              prompt: "What is 3/4 as a decimal?",
              difficulty: 1,
              questionType: "numeric",
              numericAnswer: "0.75",
            },
            {
              prompt: "What is 1/3 as a decimal (rounded)?",
              difficulty: 1,
              questionType: "numeric",
              numericAnswer: "0.3333",
              numericTolerance: 0.01,
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("ok", true);
      expect(res.body).toHaveProperty("createdCount", 3);
      expect(res.body).toHaveProperty("trackId", testTrackId);
    });

    it.skipIf(!hasDatabase)("should successfully import mixed question types", async () => {
      const res = await request(app)
        .post("/api/questions/bulk-import")
        .set("Cookie", "sid=test-session-token")
        .send({
          trackId: testTrackId,
          questions: [
            {
              prompt: "What is 2+2?",
              difficulty: 1,
              questionType: "numeric",
              numericAnswer: "4",
            },
            {
              prompt: "What is the capital of France?",
              difficulty: 1,
              questionType: "mcq",
              choices: ["London", "Berlin", "Paris", "Madrid"],
              correctChoiceIndex: 2,
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("ok", true);
      expect(res.body).toHaveProperty("createdCount", 2);
    });
  });

  describe("Permissions", () => {
    it("should require creator/admin authentication", async () => {
      const res = await request(app)
        .post("/api/questions/bulk-import")
        .send({
          trackId: "test-track-id",
          questions: [],
        });

      expect([401, 403]).toContain(res.status);
    });
  });
});

