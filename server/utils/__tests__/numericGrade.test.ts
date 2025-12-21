import { describe, it, expect } from "vitest";
import { parseNumeric, gradeNumeric } from "../numericGrade";

describe("Numeric Grading Utilities", () => {
  describe("parseNumeric", () => {
    it("should parse decimal numbers", () => {
      expect(parseNumeric("12.5")).toBe(12.5);
      expect(parseNumeric("-3.14")).toBe(-3.14);
      expect(parseNumeric("0")).toBe(0);
      expect(parseNumeric("  42  ")).toBe(42); // Trims spaces
    });

    it("should parse fractions", () => {
      expect(parseNumeric("3/4")).toBe(0.75);
      expect(parseNumeric("-1/2")).toBe(-0.5);
      expect(parseNumeric("1/3")).toBeCloseTo(0.333333, 5);
    });

    it("should parse mixed fractions", () => {
      expect(parseNumeric("1 1/2")).toBe(1.5);
      expect(parseNumeric("-2 3/4")).toBe(-2.75);
    });

    it("should return null for invalid input", () => {
      expect(parseNumeric("abc")).toBeNull();
      expect(parseNumeric("")).toBeNull();
      expect(parseNumeric(null)).toBeNull();
      expect(parseNumeric(undefined)).toBeNull();
      expect(parseNumeric("3/0")).toBeNull(); // Division by zero
    });
  });

  describe("gradeNumeric", () => {
    it("should grade exact matches correctly", () => {
      const result = gradeNumeric("0.75", "0.75", null);
      expect(result.correct).toBe(true);
      expect(result.userValue).toBe(0.75);
      expect(result.correctValue).toBe(0.75);
    });

    it("should grade fraction equals decimal (exact)", () => {
      const result = gradeNumeric("3/4", "0.75", null);
      expect(result.correct).toBe(true);
    });

    it("should fail when values don't match exactly (no tolerance)", () => {
      const result = gradeNumeric("0.74", "0.75", null);
      expect(result.correct).toBe(false);
    });

    it("should pass with tolerance", () => {
      const result = gradeNumeric("0.74", "0.75", 0.02);
      expect(result.correct).toBe(true);
      expect(result.userValue).toBe(0.74);
      expect(result.correctValue).toBe(0.75);
    });

    it("should fail when outside tolerance", () => {
      const result = gradeNumeric("0.70", "0.75", 0.01);
      expect(result.correct).toBe(false);
    });

    it("should handle negative numbers", () => {
      const result = gradeNumeric("-2", "-2", null);
      expect(result.correct).toBe(true);
    });

    it("should handle tolerance with negative numbers", () => {
      const result = gradeNumeric("-2.01", "-2", 0.02);
      expect(result.correct).toBe(true);
    });

    it("should return error for invalid user input", () => {
      const result = gradeNumeric("abc", "0.75", null);
      expect(result.correct).toBe(false);
      expect(result.error).toBe("Invalid numeric format");
      expect(result.correctValue).toBe(0.75);
    });

    it("should return error for missing answers", () => {
      const result1 = gradeNumeric(null, "0.75", null);
      expect(result1.correct).toBe(false);
      expect(result1.error).toBe("Missing answer");

      const result2 = gradeNumeric("0.75", null, null);
      expect(result2.correct).toBe(false);
      expect(result2.error).toBe("Missing answer");
    });

    it("should handle edge case: exact tolerance boundary", () => {
      const result = gradeNumeric("0.76", "0.75", 0.01);
      expect(result.correct).toBe(true); // 0.01 difference, within tolerance
    });

    it("should handle edge case: just outside tolerance", () => {
      const result = gradeNumeric("0.77", "0.75", 0.01);
      expect(result.correct).toBe(false); // 0.02 difference, outside tolerance
    });
  });
});

