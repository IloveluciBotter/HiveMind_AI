import { db } from "../db";
import { stakeLedger, walletBalances, rewardsPool, trainAttempts } from "@shared/schema";
import { eq, sql, and } from "drizzle-orm";
import { logger } from "../middleware/logger";
import { calculateFeeSettlement, getEconomyConfig } from "./economy";

export interface SettlementResult {
  success: boolean;
  refundHive: number;
  costHive: number;
  stakeAfter: number;
  alreadySettled?: boolean;
  error?: string;
}

export async function settleTrainingAttempt(
  attemptId: string,
  walletAddress: string,
  feeHive: number,
  scorePct: number,
  stakeAfterReserve: number
): Promise<SettlementResult> {
  try {
    const result = await db.transaction(async (tx) => {
      const economyConfig = getEconomyConfig();
      const passed = scorePct >= economyConfig.passThreshold;
      const feeSettlement = calculateFeeSettlement(feeHive, scorePct, passed);
      
      await tx.execute(sql`
        SELECT id FROM wallet_balances 
        WHERE wallet_address = ${walletAddress} 
        FOR UPDATE
      `);
      
      const existingRefund = await tx
        .select({ id: stakeLedger.id })
        .from(stakeLedger)
        .where(and(
          eq(stakeLedger.attemptId, attemptId),
          eq(stakeLedger.reason, "fee_refund")
        ))
        .limit(1);
      
      const existingCost = await tx
        .select({ id: stakeLedger.id })
        .from(stakeLedger)
        .where(and(
          eq(stakeLedger.attemptId, attemptId),
          eq(stakeLedger.reason, "fee_cost_to_rewards")
        ))
        .limit(1);
      
      const hasRefundEntry = existingRefund.length > 0;
      const hasCostEntry = existingCost.length > 0;
      
      const needsRefund = feeSettlement.refundHive > 0;
      const needsCost = feeSettlement.costHive > 0;
      
      const refundComplete = !needsRefund || hasRefundEntry;
      const costComplete = !needsCost || hasCostEntry;
      
      if (refundComplete && costComplete) {
        const [currentBalance] = await tx
          .select({ stake: walletBalances.trainingStakeHive })
          .from(walletBalances)
          .where(eq(walletBalances.walletAddress, walletAddress))
          .limit(1);
        
        return {
          success: true,
          refundHive: 0,
          costHive: 0,
          stakeAfter: currentBalance ? parseFloat(currentBalance.stake) : stakeAfterReserve,
          alreadySettled: true,
        };
      }
      
      let stakeAfter = stakeAfterReserve;
      
      if (needsRefund && !hasRefundEntry) {
        const refundAmount = feeSettlement.refundHive.toFixed(8);
        
        const updated = await tx
          .update(walletBalances)
          .set({ 
            trainingStakeHive: sql`CAST(CAST(training_stake_hive AS DECIMAL(18,8)) + ${refundAmount} AS VARCHAR)`,
            updatedAt: new Date() 
          })
          .where(eq(walletBalances.walletAddress, walletAddress))
          .returning({ newBalance: walletBalances.trainingStakeHive });
        
        if (!updated || updated.length === 0) {
          throw new Error("Failed to update wallet balance - wallet not found");
        }
        
        stakeAfter = parseFloat(updated[0].newBalance);
        
        await tx.execute(sql`
          INSERT INTO stake_ledger (wallet_address, amount, balance_after, reason, attempt_id, metadata)
          VALUES (
            ${walletAddress},
            ${refundAmount},
            ${stakeAfter.toFixed(8)},
            'fee_refund',
            ${attemptId},
            ${JSON.stringify({ scorePct, refundHive: feeSettlement.refundHive })}::jsonb
          )
          ON CONFLICT (attempt_id, reason) DO NOTHING
        `);
      } else if (hasRefundEntry) {
        const [currentBalance] = await tx
          .select({ stake: walletBalances.trainingStakeHive })
          .from(walletBalances)
          .where(eq(walletBalances.walletAddress, walletAddress))
          .limit(1);
        if (currentBalance) {
          stakeAfter = parseFloat(currentBalance.stake);
        }
      }
      
      if (needsCost && !hasCostEntry) {
        const costAmount = feeSettlement.costHive.toFixed(8);
        
        const [pool] = await tx
          .select({ id: rewardsPool.id })
          .from(rewardsPool)
          .limit(1);
        
        if (!pool) {
          throw new Error("Rewards pool not found");
        }
        
        const poolUpdated = await tx
          .update(rewardsPool)
          .set({ 
            pendingHive: sql`CAST(CAST(pending_hive AS DECIMAL(18,8)) + ${costAmount} AS VARCHAR)`,
            updatedAt: new Date() 
          })
          .where(eq(rewardsPool.id, pool.id))
          .returning({ id: rewardsPool.id });
        
        if (!poolUpdated || poolUpdated.length === 0) {
          throw new Error("Failed to update rewards pool");
        }
        
        await tx.execute(sql`
          INSERT INTO stake_ledger (wallet_address, amount, balance_after, reason, attempt_id, metadata)
          VALUES (
            ${walletAddress},
            ${(-feeSettlement.costHive).toFixed(8)},
            ${stakeAfter.toFixed(8)},
            'fee_cost_to_rewards',
            ${attemptId},
            ${JSON.stringify({ costHive: feeSettlement.costHive, scorePct })}::jsonb
          )
          ON CONFLICT (attempt_id, reason) DO NOTHING
        `);
      }
      
      return {
        success: true,
        refundHive: feeSettlement.refundHive,
        costHive: feeSettlement.costHive,
        stakeAfter,
        alreadySettled: false,
      };
    });
    
    return result;
  } catch (error) {
    logger.error({ error: "Settlement transaction failed", attemptId, details: error });
    return {
      success: false,
      refundHive: 0,
      costHive: 0,
      stakeAfter: stakeAfterReserve,
      error: error instanceof Error ? error.message : "Settlement failed",
    };
  }
}

export async function reserveFee(
  walletAddress: string,
  feeHive: number,
  difficulty: string
): Promise<{ success: boolean; stakeAfter: number; error?: string }> {
  try {
    const feeAmount = feeHive.toFixed(8);
    
    const result = await db.transaction(async (tx) => {
      const updated = await tx
        .update(walletBalances)
        .set({ 
          trainingStakeHive: sql`CAST(CAST(training_stake_hive AS DECIMAL(18,8)) - ${feeAmount} AS VARCHAR)`,
          updatedAt: new Date() 
        })
        .where(and(
          eq(walletBalances.walletAddress, walletAddress),
          sql`CAST(training_stake_hive AS DECIMAL(18,8)) >= ${feeAmount}`
        ))
        .returning({ newBalance: walletBalances.trainingStakeHive });
      
      if (!updated || updated.length === 0) {
        const [currentBalance] = await tx
          .select({ stake: walletBalances.trainingStakeHive })
          .from(walletBalances)
          .where(eq(walletBalances.walletAddress, walletAddress))
          .limit(1);
        
        if (!currentBalance) {
          throw new Error("Wallet balance not found");
        }
        
        throw new Error(`Insufficient stake. Required: ${feeHive}, Available: ${currentBalance.stake}`);
      }
      
      const stakeAfter = parseFloat(updated[0].newBalance);
      
      await tx.insert(stakeLedger).values({
        walletAddress,
        amount: (-feeHive).toFixed(8),
        balanceAfter: stakeAfter.toFixed(8),
        reason: "fee_reserve",
        metadata: { difficulty, feeHive },
      });
      
      return { success: true, stakeAfter };
    });
    
    return result;
  } catch (error) {
    logger.error({ error: "Fee reservation failed", walletAddress, feeHive, details: error });
    return {
      success: false,
      stakeAfter: 0,
      error: error instanceof Error ? error.message : "Fee reservation failed",
    };
  }
}
