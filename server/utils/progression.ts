/**
 * Progression system: level-based requirements for wallet hold and vault stake
 */

export type LevelRequirements = {
  level: number;
  walletHold: number;
  vaultStake: number;
};

// Base requirement (same as MIN_HIVE_ACCESS)
const MIN_HIVE_ACCESS = parseFloat(process.env.MIN_HIVE_ACCESS || "50");

// Progression configuration
const MAX_LEVEL = parseFloat(process.env.PROG_MAX_LEVEL || "100");
const TARGET_MAX_VAULT_STAKE = parseFloat(process.env.PROG_TARGET_MAX_VAULT_STAKE || "10000");

// Scaling factors (can be overridden via env vars)
const HOLD_SCALE = parseFloat(process.env.PROG_HOLD_SCALE || "5");

// Calculate stake scale automatically if not explicitly set
// Formula: stakeScale = (targetMaxStake - baseStake) / (maxLevel^2)
// This ensures vaultStake(maxLevel) = targetMaxStake
const BASE_STAKE = MIN_HIVE_ACCESS;
const EXPLICIT_STAKE_SCALE = process.env.PROG_STAKE_SCALE ? parseFloat(process.env.PROG_STAKE_SCALE) : null;
const STAKE_SCALE = EXPLICIT_STAKE_SCALE !== null 
  ? EXPLICIT_STAKE_SCALE 
  : (TARGET_MAX_VAULT_STAKE - BASE_STAKE) / (MAX_LEVEL * MAX_LEVEL);

/**
 * Calculate required wallet hold for a given level
 * Linear curve: baseHold + (level * holdScale)
 * 
 * @param level - The level (1-based)
 * @returns Required wallet hold amount
 */
export function requiredWalletHold(level: number): number {
  if (level < 1) {
    throw new Error("Level must be at least 1");
  }
  return MIN_HIVE_ACCESS + (level * HOLD_SCALE);
}

/**
 * Calculate required vault stake for a given level
 * Quadratic curve: baseStake + (level^2 * stakeScale)
 * 
 * The stakeScale is automatically calculated to ensure that at MAX_LEVEL,
 * the vault stake requirement equals TARGET_MAX_VAULT_STAKE.
 * 
 * @param level - The level (1-based)
 * @returns Required vault stake amount
 */
export function requiredVaultStake(level: number): number {
  if (level < 1) {
    throw new Error("Level must be at least 1");
  }
  return BASE_STAKE + (level * level * STAKE_SCALE);
}

/**
 * Get complete requirements for a given level
 * 
 * @param level - The level (1-based)
 * @returns LevelRequirements object with rounded values
 */
export function getRequirements(level: number): LevelRequirements {
  if (level < 1) {
    throw new Error("Level must be at least 1");
  }
  
  const walletHold = requiredWalletHold(level);
  const vaultStake = requiredVaultStake(level);
  
  return {
    level,
    walletHold: Math.round(walletHold * 100) / 100, // Round to 2 decimals
    vaultStake: Math.round(vaultStake * 100) / 100, // Round to 2 decimals
  };
}

