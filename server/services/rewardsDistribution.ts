import { contributorShares, cyclePayouts, rewardsPoolLedger, cycles } from "@shared/schema";
import { db } from "../db";
import { eq, and, sql, sum, desc } from "drizzle-orm";
import { storage } from "../storage";

export type ShareSource = "corpus_approved" | "review_reward" | "other";

/**
 * Calculate shares for a corpus item based on difficulty/complexity
 * Simple rule: shares = max(1, complexity/difficulty)
 * For now, we'll use a base of 1 share per approved item
 * Can be enhanced later with difficulty scaling
 */
export function sharesForCorpusItem(complexity?: number): number {
  // Base share
  const base = 1;
  
  // If complexity is available (1-5), use it as multiplier
  // Otherwise default to 1
  if (complexity && complexity >= 1 && complexity <= 5) {
    return Math.max(1, complexity);
  }
  
  return base;
}

/**
 * Record shares for a contributor
 */
export async function recordShares(
  cycleId: string,
  walletPubkey: string,
  shares: number,
  source: ShareSource,
  refId?: string
): Promise<string> {
  const result = await db
    .insert(contributorShares)
    .values({
      cycleId,
      walletPubkey,
      source,
      shares: shares.toFixed(8),
      refId: refId || null,
    })
    .returning({ id: contributorShares.id });

  return result[0].id;
}

/**
 * Calculate and record payouts for a cycle
 * Returns the number of payouts created
 */
export async function calculateCyclePayouts(cycleId: string): Promise<{
  success: boolean;
  payoutCount: number;
  totalPool: number;
  totalShares: number;
  error?: string;
}> {
  // Check if payouts already exist for this cycle
  const existingPayouts = await db
    .select()
    .from(cyclePayouts)
    .where(eq(cyclePayouts.cycleId, cycleId))
    .limit(1);

  if (existingPayouts.length > 0) {
    // Payouts already calculated - return existing count
    const count = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(cyclePayouts)
      .where(eq(cyclePayouts.cycleId, cycleId));
    
    return {
      success: true,
      payoutCount: parseInt(count[0].count.toString(), 10),
      totalPool: 0,
      totalShares: 0,
      error: "Payouts already calculated for this cycle",
    };
  }

  try {
    // Get total pool for this cycle
    const poolResult = await db
      .select({
        total: sql<number>`COALESCE(SUM(${rewardsPoolLedger.amountHive}::numeric), 0)`,
      })
      .from(rewardsPoolLedger)
      .where(
        and(
          eq(rewardsPoolLedger.cycleId, cycleId),
          sql`${rewardsPoolLedger.status} IN ('recorded', 'transferred', 'pending_transfer')`
        )
      );

    const totalPool = parseFloat(poolResult[0].total.toString());

    // Get total shares for this cycle
    const sharesResult = await db
      .select({
        total: sql<number>`COALESCE(SUM(${contributorShares.shares}::numeric), 0)`,
      })
      .from(contributorShares)
      .where(eq(contributorShares.cycleId, cycleId));

    const totalShares = parseFloat(sharesResult[0].total.toString());

    if (totalShares === 0) {
      return {
        success: false,
        payoutCount: 0,
        totalPool,
        totalShares: 0,
        error: "No shares found for this cycle",
      };
    }

    // Get all contributors with their total shares
    const contributors = await db
      .select({
        walletPubkey: contributorShares.walletPubkey,
        totalShares: sql<number>`SUM(${contributorShares.shares}::numeric)`,
      })
      .from(contributorShares)
      .where(eq(contributorShares.cycleId, cycleId))
      .groupBy(contributorShares.walletPubkey);

    // Calculate and insert payouts
    const payoutInserts = contributors.map((contributor) => {
      const walletShares = parseFloat(contributor.totalShares.toString());
      const payoutHive = (totalPool * walletShares) / totalShares;
      
      return {
        cycleId,
        walletPubkey: contributor.walletPubkey,
        shares: walletShares.toFixed(8),
        payoutHive: payoutHive.toFixed(8),
        status: "calculated" as const,
      };
    });

    if (payoutInserts.length > 0) {
      await db.insert(cyclePayouts).values(payoutInserts);
    }

    return {
      success: true,
      payoutCount: payoutInserts.length,
      totalPool,
      totalShares,
    };
  } catch (error: any) {
    return {
      success: false,
      payoutCount: 0,
      totalPool: 0,
      totalShares: 0,
      error: error.message || "Failed to calculate payouts",
    };
  }
}

/**
 * Get user's rewards summary
 */
export async function getUserRewards(walletPubkey: string): Promise<{
  currentCycleShares: number;
  estimatedPayout: number | null;
  recentPayouts: Array<{
    cycleId: string;
    cycleNumber: number;
    payoutHive: number;
    status: string;
    createdAt: Date;
  }>;
}> {
  // Get current cycle
  const currentCycle = await storage.getCurrentCycle();
  
  let currentCycleShares = 0;
  let estimatedPayout: number | null = null;

  if (currentCycle) {
    // Get user's shares for current cycle
    const sharesResult = await db
      .select({
        total: sql<number>`COALESCE(SUM(${contributorShares.shares}::numeric), 0)`,
      })
      .from(contributorShares)
      .where(
        and(
          eq(contributorShares.cycleId, currentCycle.id),
          eq(contributorShares.walletPubkey, walletPubkey)
        )
      );

    currentCycleShares = parseFloat(sharesResult[0].total.toString());

    // If payouts already calculated, get the actual payout
    const payout = await db
      .select()
      .from(cyclePayouts)
      .where(
        and(
          eq(cyclePayouts.cycleId, currentCycle.id),
          eq(cyclePayouts.walletPubkey, walletPubkey)
        )
      )
      .limit(1);

    if (payout[0]) {
      estimatedPayout = parseFloat(payout[0].payoutHive);
    }
  }

  // Get recent payouts (last 10)
  const recentPayoutsRaw = await db
    .select({
      cycleId: cyclePayouts.cycleId,
      payoutHive: cyclePayouts.payoutHive,
      status: cyclePayouts.status,
      createdAt: cyclePayouts.createdAt,
      cycleNumber: sql<number | null>`(SELECT cycle_number FROM cycles WHERE id = ${cyclePayouts.cycleId})`,
    })
    .from(cyclePayouts)
    .where(eq(cyclePayouts.walletPubkey, walletPubkey))
    .orderBy(desc(cyclePayouts.createdAt))
    .limit(10);

  const recentPayouts = recentPayoutsRaw.map((p) => ({
    cycleId: p.cycleId,
    cycleNumber: p.cycleNumber ? parseInt(p.cycleNumber.toString(), 10) : 0,
    payoutHive: parseFloat(p.payoutHive),
    status: p.status,
    createdAt: p.createdAt,
  }));

  return {
    currentCycleShares,
    estimatedPayout,
    recentPayouts,
  };
}

