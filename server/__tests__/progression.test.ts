import { describe, it, expect } from "vitest";
import { requiredWalletHold, requiredVaultStake, getRequirements } from "../utils/progression";

describe("Progression System", () => {
  describe("requiredWalletHold", () => {
    it("should calculate linear progression starting from base", () => {
      // Base (MIN_HIVE_ACCESS) = 50, scale = 5
      // Level 1: 50 + (1 * 5) = 55
      expect(requiredWalletHold(1)).toBe(55);
      
      // Level 2: 50 + (2 * 5) = 60
      expect(requiredWalletHold(2)).toBe(60);
      
      // Level 10: 50 + (10 * 5) = 100
      expect(requiredWalletHold(10)).toBe(100);
    });

    it("should throw error for invalid level", () => {
      expect(() => requiredWalletHold(0)).toThrow("Level must be at least 1");
      expect(() => requiredWalletHold(-1)).toThrow("Level must be at least 1");
    });
  });

  describe("requiredVaultStake", () => {
    it("should calculate quadratic progression starting from base", () => {
      // Base (MIN_HIVE_ACCESS) = 50, auto-calculated scale ≈ 0.995
      // Level 1: 50 + (1^2 * 0.995) = 50.995
      expect(requiredVaultStake(1)).toBeCloseTo(50.995, 2);
      
      // Level 2: 50 + (2^2 * 0.995) = 50 + 3.98 = 53.98
      expect(requiredVaultStake(2)).toBeCloseTo(53.98, 2);
      
      // Level 10: 50 + (10^2 * 0.995) = 50 + 99.5 = 149.5
      expect(requiredVaultStake(10)).toBeCloseTo(149.5, 2);
      
      // Level 100: 50 + (100^2 * 0.995) = 50 + 9950 = 10000
      expect(requiredVaultStake(100)).toBeCloseTo(10000, 1);
    });

    it("should throw error for invalid level", () => {
      expect(() => requiredVaultStake(0)).toThrow("Level must be at least 1");
      expect(() => requiredVaultStake(-1)).toThrow("Level must be at least 1");
    });
  });

  describe("getRequirements", () => {
    it("should return complete requirements with rounded values", () => {
      const req = getRequirements(1);
      // Level 1: walletHold = 50 + (1 * 5) = 55
      // Level 1: vaultStake = 50 + (1^2 * 0.995) = 50.995 ≈ 51.00 (rounded)
      expect(req.level).toBe(1);
      expect(req.walletHold).toBe(55);
      expect(req.vaultStake).toBeCloseTo(51, 0.1); // Allow small rounding
    });

    it("should round to 2 decimal places", () => {
      const req = getRequirements(3);
      // Level 3: walletHold = 50 + (3 * 5) = 65
      // Level 3: vaultStake = 50 + (9 * 0.995) = 58.955 ≈ 58.96
      expect(req.walletHold).toBe(65);
      expect(req.vaultStake).toBeCloseTo(58.96, 0.1);
    });

    it("should reach target max vault stake at level 100", () => {
      const req = getRequirements(100);
      // Level 100: vaultStake should be approximately 10000
      // Formula: 50 + (100^2 * 0.995) = 50 + 9950 = 10000
      expect(req.vaultStake).toBeCloseTo(10000, 1); // Allow 0.1 rounding tolerance
    });

    it("should calculate vault stake at level 50 correctly", () => {
      const req = getRequirements(50);
      // Level 50: vaultStake = 50 + (50^2 * 0.995) = 50 + 2487.5 = 2537.5
      const expectedStake = 50 + (50 * 50 * 0.995);
      expect(req.vaultStake).toBeCloseTo(expectedStake, 1);
      // Sanity check: should be around 2537.5
      expect(req.vaultStake).toBeGreaterThan(2500);
      expect(req.vaultStake).toBeLessThan(2600);
    });

    it("should throw error for invalid level", () => {
      expect(() => getRequirements(0)).toThrow("Level must be at least 1");
    });
  });
});

