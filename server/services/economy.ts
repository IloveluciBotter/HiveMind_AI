import { env } from "../env";

export interface EconomyConfig {
  baseFeeHive: number;
  passThreshold: number;
  minPartialCostPct: number;
  vaultAddress: string;
  mintAddress: string;
  rewardsWalletAddress: string;
}

export function getEconomyConfig(): EconomyConfig {
  return {
    baseFeeHive: env.ECON_BASE_FEE_HIVE,
    passThreshold: env.ECON_PASS_THRESHOLD,
    minPartialCostPct: env.ECON_MIN_PARTIAL_COST_PCT,
    vaultAddress: env.HIVE_VAULT_ADDRESS || "",
    mintAddress: env.HIVE_MINT || "",
    rewardsWalletAddress: env.REWARDS_WALLET_ADDRESS || "",
  };
}

export interface FeeCalculation {
  feeHive: number;
  costPct: number;
  costHive: number;
  refundHive: number;
}

export function calculateFeeSettlement(
  feeHive: number,
  scorePct: number,
  passed: boolean
): FeeCalculation {
  const config = getEconomyConfig();
  
  let costPct: number;
  
  if (!passed) {
    costPct = 1.0;
  } else if (scorePct === 1.0) {
    costPct = 0.0;
  } else {
    costPct = Math.max(config.minPartialCostPct, 1.0 - scorePct);
  }
  
  const costHive = feeHive * costPct;
  const refundHive = feeHive - costHive;
  
  return {
    feeHive,
    costPct,
    costHive,
    refundHive,
  };
}

export function getFeeForDifficulty(difficulty: string): number {
  const config = getEconomyConfig();
  const baseFee = config.baseFeeHive;
  
  const multipliers: Record<string, number> = {
    low: 0.5,
    medium: 1.0,
    high: 2.0,
    extreme: 4.0,
  };
  
  return baseFee * (multipliers[difficulty] || 1.0);
}
