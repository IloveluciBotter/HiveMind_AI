/**
 * Tests for global user leveling enforcement
 * 
 * Tests:
 * 1. Question history recording
 * 2. Question selector with complexity filtering
 * 3. Level enforcement in question serving endpoints
 * 4. Chat endpoint with level gating
 */

import { describe, it, expect } from "vitest";
import { allowedComplexity } from "../utils/complexityMapping";
import { getLevelPolicy } from "../services/levelPolicy";

// Unit tests that don't require database
describe("Leveling Enforcement - Unit Tests", () => {
  describe("allowedComplexity()", () => {
    it("should map level 1-20 to complexity 1", () => {
      expect(allowedComplexity(1)).toBe(1);
      expect(allowedComplexity(10)).toBe(1);
      expect(allowedComplexity(20)).toBe(1);
    });

    it("should map level 21-40 to complexity 2", () => {
      expect(allowedComplexity(21)).toBe(2);
      expect(allowedComplexity(30)).toBe(2);
      expect(allowedComplexity(40)).toBe(2);
    });

    it("should map level 41-60 to complexity 3", () => {
      expect(allowedComplexity(41)).toBe(3);
      expect(allowedComplexity(50)).toBe(3);
      expect(allowedComplexity(60)).toBe(3);
    });

    it("should map level 61-80 to complexity 4", () => {
      expect(allowedComplexity(61)).toBe(4);
      expect(allowedComplexity(70)).toBe(4);
      expect(allowedComplexity(80)).toBe(4);
    });

    it("should map level 81-100 to complexity 5", () => {
      expect(allowedComplexity(81)).toBe(5);
      expect(allowedComplexity(90)).toBe(5);
      expect(allowedComplexity(100)).toBe(5);
    });

    it("should clamp levels outside 1-100", () => {
      expect(allowedComplexity(0)).toBe(1);
      expect(allowedComplexity(101)).toBe(5);
      expect(allowedComplexity(200)).toBe(5);
    });
  });

  describe("Level Policy Integration", () => {
    it("should apply correct policy for level 1", () => {
      const policy = getLevelPolicy(1);
      expect(policy.retrievalEnabled).toBe(false);
      expect(policy.simplicityMode).toBe(true);
      expect(policy.maxAnswerTokens).toBe(180);
    });

    it("should apply correct policy for level 50", () => {
      const policy = getLevelPolicy(50);
      expect(policy.retrievalEnabled).toBe(true);
      expect(policy.preferCorpus).toBe("strong");
      expect(policy.requireCitations).toBe(true); // Level 50 >= 40
    });

    it("should apply correct policy for level 100", () => {
      const policy = getLevelPolicy(100);
      expect(policy.retrievalEnabled).toBe(true);
      expect(policy.preferCorpus).toBe("strong");
      expect(policy.requireCitations).toBe(true);
      expect(policy.maxAnswerTokens).toBe(1200);
    });
  });
});

// Integration tests that require database
// These are in a separate file to avoid import-time database connection
// See: levelingEnforcement.integration.test.ts
