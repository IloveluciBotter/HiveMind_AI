import { contributorSharesV2, cyclePayouts, rewardsPoolLedger, trainingCorpusItems } from "@shared/schema";
import { db } from "../db";
import { eq, and, sql, desc } from "drizzle-orm";
import { storage } from "../storage";

export type ShareSourceV2 = "corpus_approved" | "question_approved" | "review_reward" | "other";

/**
 * Calculate difficulty score from item complexity (1-5)
 * Returns score in [1.0, 2.0] range
 */
export function calculateDifficultyScore(complexity: number): number {
  // Map complexity 1-5 to score 1.0-2.0
  // Formula: 0.8 + 0.2 * complexity
  // So: 1→1.0, 2→1.2, 3→1.4, 4→1.6, 5→1.8
  const score = 0.8 + 0.2 * complexity;
  // Clamp to [1.0, 2.0]
  return Math.max(1.0, Math.min(2.0, score));
}

/**
 * Calculate quality score from review/auto-review signals
 * Returns score in [0.5, 1.5] range
 */
export function calculateQualityScore(options: {
  autoReviewScore?: number; // 0-1 score from auto-review
  consensusApproveCount?: number; // Number of approve votes
  consensusTotalCount?: number; // Total review votes
}): number {
  const { autoReviewScore, consensusApproveCount, consensusTotalCount } = options;
  
  let score = 1.0; // Default baseline
  
  // If auto-review score exists, map it to [0.8, 1.2]
  if (autoReviewScore !== undefined && autoReviewScore >= 0 && autoReviewScore <= 1) {
    // Map 0.0-1.0 to 0.8-1.2
    score = 0.8 + (autoReviewScore * 0.4);
  }
  
  // If consensus exists, boost by agreement strength
  if (consensusApproveCount !== undefined && consensusTotalCount !== undefined && consensusTotalCount > 0) {
    const agreementRatio = consensusApproveCount / consensusTotalCount;
    // Strong consensus (>= 0.8) gets boost up to +0.3
    // Weak consensus (< 0.5) gets penalty down to -0.2
    const consensusBoost = agreementRatio >= 0.8 
      ? 0.3 * (agreementRatio - 0.8) / 0.2  // 0.8→0, 1.0→0.3
      : agreementRatio < 0.5
        ? -0.2 * (0.5 - agreementRatio) / 0.5  // 0.5→0, 0.0→-0.2
        : 0;
    score += consensusBoost;
  }
  
  // Clamp to [0.5, 1.5]
  return Math.max(0.5, Math.min(1.5, score));
}

/**
 * Calculate usage score from usage count
 * Returns score with max from env (default 3.0)
 */
export function calculateUsageScore(usageCount: number): number {
  const maxUsageScore = parseFloat(process.env.REWARDS_USAGE_MAX || "3.0");
  
  // Formula: 1 + ln(1 + usageCount)
  // Natural log ensures diminishing returns
  const score = 1 + Math.log(1 + usageCount);
  
  // Clamp to max
  return Math.min(maxUsageScore, score);
}

/**
 * Calculate total shares from component scores
 * Returns shares clamped to [min, max] from env
 */
export function calculateShares(
  difficultyScore: number,
  qualityScore: number,
  usageScore: number
): number {
  const minShares = parseFloat(process.env.REWARDS_SHARES_MIN || "0.25");
  const maxShares = parseFloat(process.env.REWARDS_SHARES_MAX || "10");
  
  // shares = difficultyScore * qualityScore * usageScore
  const shares = difficultyScore * qualityScore * usageScore;
  
  // Clamp to [min, max]
  return Math.max(minShares, Math.min(maxShares, shares));
}

/**
 * Calculate reviewer shares for an approved item
 * Formula: baseReviewerShares + (difficultyBonus * 0.25)
 * Clamped to [1, 3]
 */
export function calculateReviewerShares(complexity: number): number {
  const baseReviewerShares = 1;
  const difficultyBonus = complexity; // 1-5
  const reviewerShares = baseReviewerShares + (difficultyBonus * 0.25);
  
  // Clamp to [1, 3]
  return Math.max(1, Math.min(3, reviewerShares));
}

/**
 * Record reviewer shares using wallet addresses directly (called from review submission)
 */
export async function recordReviewerSharesByWallet(
  cycleId: string,
  itemId: string,
  reviewerWalletPubkeys: string[],
  submitterWalletPubkey: string | null,
  complexity: number
): Promise<void> {
  const allowSelfReview = process.env.REWARDS_REVIEWER_SELF_REVIEW === "true";
  
  // Calculate reviewer shares
  const reviewerShares = calculateReviewerShares(complexity);
  
  // Map complexity to difficulty score (for consistency with contributor shares)
  const difficultyScore = calculateDifficultyScore(complexity);
  const qualityScore = 1.0; // Reviewers get base quality score
  
  // Record shares for each reviewer
  for (const reviewerPubkey of reviewerWalletPubkeys) {
    // Skip if self-review is not allowed and reviewer is the submitter
    if (!allowSelfReview && submitterWalletPubkey && reviewerPubkey === submitterWalletPubkey) {
      // Log self-review skip for audit trail
      const logger = (await import("../middleware/logger")).logger;
      logger.info({
        message: "Self-review skipped for reviewer rewards",
        reviewerWallet: reviewerPubkey,
        submitterWallet: submitterWalletPubkey,
        itemId,
      });
      continue;
    }
    
    // Warn if submitterWalletPubkey is null (legacy row) and self-review protection is enabled
    // This allows us to track how many legacy rows exist
    if (!allowSelfReview && !submitterWalletPubkey) {
      const logger = (await import("../middleware/logger")).logger;
      logger.warn({
        message: "Cannot enforce self-review protection: submitterWalletPubkey is null (legacy row)",
        reviewerWallet: reviewerPubkey,
        itemId,
      });
    }
    
    // For reviewers, baseShares = reviewerShares (no usage multiplier)
    // Store it directly - reviewers don't get usage bonus, so shares = baseShares
    await db
      .insert(contributorSharesV2)
      .values({
        cycleId,
        walletPubkey: reviewerPubkey,
        source: "review_reward",
        refId: itemId,
        difficultyScore: difficultyScore.toFixed(4),
        qualityScore: qualityScore.toFixed(4),
        baseShares: reviewerShares.toFixed(8), // For reviewers, baseShares = final shares
        usageScore: "1.0", // Fixed usage score for reviewers
        shares: reviewerShares.toFixed(8), // Reviewers get fixed shares (no usage calculation)
      });
  }
}

/**
 * Record shares for a contributor with component scores
 * Stores baseShares (difficulty × quality) at approval time
 * Usage score and final shares computed at payout time
 */
export async function recordSharesV2(
  cycleId: string,
  walletPubkey: string,
  source: ShareSourceV2,
  refId: string,
  difficultyScore: number,
  qualityScore: number,
  usageCountSnapshot?: number // Optional snapshot for reference
): Promise<string> {
  // Calculate baseShares = difficultyScore * qualityScore
  const baseShares = difficultyScore * qualityScore;
  
  // Optional: calculate usage score snapshot for reference (not used in payout calculation)
  let usageScoreSnapshot: string | null = null;
  if (usageCountSnapshot !== undefined) {
    usageScoreSnapshot = calculateUsageScore(usageCountSnapshot).toFixed(4);
  }
  
  const result = await db
    .insert(contributorSharesV2)
    .values({
      cycleId,
      walletPubkey,
      source,
      refId,
      difficultyScore: difficultyScore.toFixed(4),
      qualityScore: qualityScore.toFixed(4),
      baseShares: baseShares.toFixed(8),
      usageScore: usageScoreSnapshot,
      shares: null, // Will be computed at payout time
    })
    .returning({ id: contributorSharesV2.id });

  return result[0].id;
}

/**
 * Increment usage count for corpus items
 */
export async function incrementCorpusItemUsage(corpusItemIds: string[]): Promise<void> {
  if (corpusItemIds.length === 0) return;
  
  // Batch update: increment usageCountCycle by 1 and update lastUsedAt
  for (const itemId of corpusItemIds) {
    await db
      .update(trainingCorpusItems)
      .set({
        usageCountCycle: sql`${trainingCorpusItems.usageCountCycle} + 1`,
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(trainingCorpusItems.id, itemId));
  }
}

/**
 * Get current usage count for a corpus item
 */
export async function getCorpusItemUsageCount(corpusItemId: string): Promise<number> {
  const [item] = await db
    .select({ usageCountCycle: trainingCorpusItems.usageCountCycle })
    .from(trainingCorpusItems)
    .where(eq(trainingCorpusItems.id, corpusItemId))
    .limit(1);
  
  return item ? parseFloat(item.usageCountCycle || "0") : 0;
}

/**
 * Reset usage counts for all corpus items (called at cycle start)
 */
export async function resetCycleUsageCounts(): Promise<void> {
  await db
    .update(trainingCorpusItems)
    .set({
      usageCountCycle: "0",
      updatedAt: new Date(),
    });
}

/**
 * Calculate and record payouts for a cycle using contributor_shares_v2
 * Computes final shares = baseShares * usageScore at payout time
 * Splits pool between contributors and reviewers
 */
export async function calculateCyclePayoutsV2(cycleId: string): Promise<{
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

    // Get pool split percentages
    let contributorPct = parseFloat(process.env.REWARDS_CONTRIBUTOR_PCT || "0.85");
    let reviewerPct = parseFloat(process.env.REWARDS_REVIEWER_PCT || "0.15");
    
    // Normalize if they don't sum to 1.0
    const totalPct = contributorPct + reviewerPct;
    if (Math.abs(totalPct - 1.0) > 0.01) {
      // Normalize
      contributorPct = contributorPct / totalPct;
      reviewerPct = reviewerPct / totalPct;
    }
    
    const contributorPool = totalPool * contributorPct;
    const reviewerPool = totalPool * reviewerPct;

    // Get all share records for this cycle, separated by source
    const shareRecords = await db
      .select({
        id: contributorSharesV2.id,
        walletPubkey: contributorSharesV2.walletPubkey,
        source: contributorSharesV2.source,
        refId: contributorSharesV2.refId,
        baseShares: contributorSharesV2.baseShares,
        shares: contributorSharesV2.shares, // May already be computed for reviewers
      })
      .from(contributorSharesV2)
      .where(eq(contributorSharesV2.cycleId, cycleId));

    if (shareRecords.length === 0) {
      return {
        success: false,
        payoutCount: 0,
        totalPool,
        totalShares: 0,
        error: "No shares found for this cycle",
      };
    }

    // Separate contributor and reviewer shares
    const contributorRecords = shareRecords.filter(r => r.source !== "review_reward");
    const reviewerRecords = shareRecords.filter(r => r.source === "review_reward");
    
    // Compute final shares for contributors (with usage bonus)
    const minShares = parseFloat(process.env.REWARDS_SHARES_MIN || "0.25");
    const maxShares = parseFloat(process.env.REWARDS_SHARES_MAX || "10");
    
    let totalContributorShares = 0;
    const contributorWalletShareMap = new Map<string, number>();
    const contributorShareUpdates: Array<{ id: string; shares: string; usageScore: string }> = [];

    for (const record of contributorRecords) {
      // Get current usage count for this item
      let usageCount = 0;
      if (record.refId) {
        try {
          usageCount = await getCorpusItemUsageCount(record.refId);
        } catch (error) {
          // If item not found or error, usageCount remains 0
        }
      }

      // Calculate usage score at payout time
      const usageScore = calculateUsageScore(usageCount);
      
      // Calculate final shares = baseShares * usageScore
      const baseSharesNum = parseFloat(record.baseShares);
      let finalShares = baseSharesNum * usageScore;
      
      // Clamp to [min, max]
      finalShares = Math.max(minShares, Math.min(maxShares, finalShares));
      
      // Update record with computed shares
      contributorShareUpdates.push({
        id: record.id,
        shares: finalShares.toFixed(8),
        usageScore: usageScore.toFixed(4),
      });
      
      // Accumulate shares per wallet
      const current = contributorWalletShareMap.get(record.walletPubkey) || 0;
      contributorWalletShareMap.set(record.walletPubkey, current + finalShares);
      totalContributorShares += finalShares;
    }

    // Reviewers already have shares computed (no usage bonus)
    let totalReviewerShares = 0;
    const reviewerWalletShareMap = new Map<string, number>();
    
    for (const record of reviewerRecords) {
      // Reviewers have shares already set (baseShares = shares for reviewers)
      const reviewerShares = parseFloat(record.shares || record.baseShares);
      
      // Accumulate shares per wallet
      const current = reviewerWalletShareMap.get(record.walletPubkey) || 0;
      reviewerWalletShareMap.set(record.walletPubkey, current + reviewerShares);
      totalReviewerShares += reviewerShares;
    }

    // Update all contributor share records with computed values
    for (const update of contributorShareUpdates) {
      await db
        .update(contributorSharesV2)
        .set({
          shares: update.shares,
          usageScore: update.usageScore,
        })
        .where(eq(contributorSharesV2.id, update.id));
    }

    if (totalContributorShares === 0 && totalReviewerShares === 0) {
      return {
        success: false,
        payoutCount: 0,
        totalPool,
        totalShares: 0,
        error: "Total shares calculated to zero",
      };
    }

    // Calculate and insert payouts for contributors
    const contributorPayoutInserts = Array.from(contributorWalletShareMap.entries()).map(([walletPubkey, walletShares]) => {
      const payoutHive = totalContributorShares > 0 
        ? (contributorPool * walletShares) / totalContributorShares
        : 0;
      
      return {
        cycleId,
        walletPubkey,
        shares: walletShares.toFixed(8),
        payoutHive: payoutHive.toFixed(8),
        status: "calculated" as const,
      };
    });

    // Calculate and insert payouts for reviewers
    const reviewerPayoutInserts = Array.from(reviewerWalletShareMap.entries()).map(([walletPubkey, walletShares]) => {
      const payoutHive = totalReviewerShares > 0
        ? (reviewerPool * walletShares) / totalReviewerShares
        : 0;
      
      return {
        cycleId,
        walletPubkey,
        shares: walletShares.toFixed(8),
        payoutHive: payoutHive.toFixed(8),
        status: "calculated" as const,
      };
    });

    const allPayoutInserts = [...contributorPayoutInserts, ...reviewerPayoutInserts];
    
    if (allPayoutInserts.length > 0) {
      await db.insert(cyclePayouts).values(allPayoutInserts);
    }
    
    const totalShares = totalContributorShares + totalReviewerShares;

    return {
      success: true,
      payoutCount: allPayoutInserts.length,
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
 * Get user's rewards summary using v2 shares
 */
export async function getUserRewardsV2(walletPubkey: string): Promise<{
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
    // Get user's shares for current cycle from v2
    const sharesResult = await db
      .select({
        total: sql<number>`COALESCE(SUM(${contributorSharesV2.shares}::numeric), 0)`,
      })
      .from(contributorSharesV2)
      .where(
        and(
          eq(contributorSharesV2.cycleId, currentCycle.id),
          eq(contributorSharesV2.walletPubkey, walletPubkey)
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
