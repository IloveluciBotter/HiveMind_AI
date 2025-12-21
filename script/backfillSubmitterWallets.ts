/**
 * Backfill script to populate submitterWalletPubkey for existing records
 * 
 * This script attempts to infer submitter wallet addresses from:
 * 1. trainAttempts: from userId field (if it contains wallet address), or from related stake ledger entries
 * 2. trainingCorpusItems: from createdByWallet, or from sourceAttemptId -> trainAttempts -> submitterWalletPubkey
 * 
 * Run with: npx tsx script/backfillSubmitterWallets.ts
 */

import { db } from "../server/db";
import { trainAttempts, trainingCorpusItems, stakeLedger } from "@shared/schema";
import { eq, isNull, sql } from "drizzle-orm";

async function backfillSubmitterWallets() {
  console.log("Starting submitterWalletPubkey backfill...");

  // Step 1: Backfill trainAttempts.submitterWalletPubkey
  // Try to infer from userId (if it's a wallet address) or stake ledger
  console.log("\n1. Backfilling trainAttempts.submitterWalletPubkey...");
  
  const attemptsWithoutWallet = await db
    .select({ id: trainAttempts.id, userId: trainAttempts.userId })
    .from(trainAttempts)
    .where(isNull(trainAttempts.submitterWalletPubkey))
    .limit(1000); // Process in batches

  console.log(`Found ${attemptsWithoutWallet.length} attempts without submitterWalletPubkey`);

  let attemptsUpdated = 0;
  for (const attempt of attemptsWithoutWallet) {
    let walletAddress: string | null = null;

    // Strategy 1: If userId looks like a wallet address (starts with letter and is ~44 chars), use it
    if (attempt.userId && attempt.userId.length >= 32 && attempt.userId.length <= 58 && /^[A-Za-z1-9]/.test(attempt.userId)) {
      walletAddress = attempt.userId;
    } else {
      // Strategy 2: Look up in stake ledger for fee_reserve entries for this attempt
      const ledgerEntry = await db
        .select({ walletAddress: stakeLedger.walletAddress })
        .from(stakeLedger)
        .where(
          sql`${stakeLedger.attemptId} = ${attempt.id} AND ${stakeLedger.reason} = 'fee_reserve'`
        )
        .limit(1);
      
      if (ledgerEntry.length > 0) {
        walletAddress = ledgerEntry[0].walletAddress;
      }
    }

    if (walletAddress) {
      await db
        .update(trainAttempts)
        .set({ submitterWalletPubkey: walletAddress })
        .where(eq(trainAttempts.id, attempt.id));
      attemptsUpdated++;
    }
  }

  console.log(`Updated ${attemptsUpdated} train attempts`);

  // Step 2: Backfill trainingCorpusItems.submitterWalletPubkey
  // Try to infer from createdByWallet (legacy field) or sourceAttemptId
  console.log("\n2. Backfilling trainingCorpusItems.submitterWalletPubkey...");

  const corpusItemsWithoutWallet = await db
    .select({
      id: trainingCorpusItems.id,
      createdByWallet: trainingCorpusItems.createdByWallet,
      sourceAttemptId: trainingCorpusItems.sourceAttemptId,
    })
    .from(trainingCorpusItems)
    .where(isNull(trainingCorpusItems.submitterWalletPubkey))
    .limit(1000);

  console.log(`Found ${corpusItemsWithoutWallet.length} corpus items without submitterWalletPubkey`);

  let corpusItemsUpdated = 0;
  for (const item of corpusItemsWithoutWallet) {
    let walletAddress: string | null = null;

    // Strategy 1: Use createdByWallet if it exists (legacy field)
    if (item.createdByWallet) {
      walletAddress = item.createdByWallet;
    } else if (item.sourceAttemptId) {
      // Strategy 2: Look up from source attempt
      const sourceAttempt = await db
        .select({ submitterWalletPubkey: trainAttempts.submitterWalletPubkey })
        .from(trainAttempts)
        .where(eq(trainAttempts.id, item.sourceAttemptId))
        .limit(1);
      
      if (sourceAttempt.length > 0 && sourceAttempt[0].submitterWalletPubkey) {
        walletAddress = sourceAttempt[0].submitterWalletPubkey;
      }
    }

    if (walletAddress) {
      await db
        .update(trainingCorpusItems)
        .set({ submitterWalletPubkey: walletAddress })
        .where(eq(trainingCorpusItems.id, item.id));
      corpusItemsUpdated++;
    }
  }

  console.log(`Updated ${corpusItemsUpdated} corpus items`);

  // Step 3: Also backfill createdByWallet for corpus items that have submitterWalletPubkey but not createdByWallet
  console.log("\n3. Syncing createdByWallet from submitterWalletPubkey (legacy compatibility)...");
  
  const corpusItemsNeedingSync = await db
    .select({
      id: trainingCorpusItems.id,
      submitterWalletPubkey: trainingCorpusItems.submitterWalletPubkey,
      createdByWallet: trainingCorpusItems.createdByWallet,
    })
    .from(trainingCorpusItems)
    .where(
      sql`${trainingCorpusItems.submitterWalletPubkey} IS NOT NULL AND ${trainingCorpusItems.createdByWallet} IS NULL`
    )
    .limit(1000);

  console.log(`Found ${corpusItemsNeedingSync.length} corpus items needing createdByWallet sync`);

  let syncCount = 0;
  for (const item of corpusItemsNeedingSync) {
    if (item.submitterWalletPubkey) {
      await db
        .update(trainingCorpusItems)
        .set({ createdByWallet: item.submitterWalletPubkey })
        .where(eq(trainingCorpusItems.id, item.id));
      syncCount++;
    }
  }

  console.log(`Synced ${syncCount} corpus items`);

  console.log("\n✅ Backfill complete!");
  console.log(`Summary:`);
  console.log(`  - Train attempts updated: ${attemptsUpdated}`);
  console.log(`  - Corpus items updated: ${corpusItemsUpdated}`);
  console.log(`  - Legacy field synced: ${syncCount}`);
}

// Run if executed directly
if (require.main === module) {
  backfillSubmitterWallets()
    .then(() => {
      console.log("Script completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Script failed:", error);
      process.exit(1);
    });
}

export { backfillSubmitterWallets };

