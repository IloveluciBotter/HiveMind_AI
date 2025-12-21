# Submitter Wallet Migration Guide

This document describes the migration to store submitter wallet addresses on submissions and corpus items for self-review protection.

## Overview

Every training submission and corpus item now stores `submitterWalletPubkey` from the authenticated session wallet (never from client body). This enables enforcement of self-review protection: reviewers cannot earn rewards for reviewing their own submissions.

## Schema Changes

### New Fields Added

1. **train_attempts** table:
   - `submitter_wallet_pubkey` (text, nullable) - Wallet address of the submitter

2. **training_corpus_items** table:
   - `submitter_wallet_pubkey` (text, nullable) - Wallet address of the submitter (preferred)
   - `created_by_wallet` (text, nullable) - Legacy field, kept for backward compatibility

## Migration Steps

### Step 1: Apply Schema Changes

Run the database migration to add the new columns:

```bash
npm run db:push
```

This will use Drizzle Kit to apply the schema changes from `shared/schema.ts`.

### Step 2: Backfill Existing Data (Optional)

For existing records, run the backfill script to populate `submitterWalletPubkey`:

```bash
npx tsx script/backfillSubmitterWallets.ts
```

The backfill script will:
- Attempt to infer submitter wallet from `trainAttempts.userId` (if it's a wallet address)
- Look up submitter wallet from stake ledger entries for train attempts
- Use `createdByWallet` for corpus items (legacy field)
- Follow `sourceAttemptId` → `trainAttempts` → `submitterWalletPubkey` for corpus items
- Sync `createdByWallet` from `submitterWalletPubkey` for legacy compatibility

**Note**: Some legacy rows may remain with `null` submitterWalletPubkey. These will be logged as warnings when reviewer shares are recorded, but won't break the system.

### Step 3: Verify Migration

After migration, verify the changes:

```sql
-- Check train attempts
SELECT COUNT(*) as total,
       COUNT(submitter_wallet_pubkey) as with_wallet,
       COUNT(*) - COUNT(submitter_wallet_pubkey) as null_count
FROM train_attempts;

-- Check corpus items
SELECT COUNT(*) as total,
       COUNT(submitter_wallet_pubkey) as with_wallet,
       COUNT(*) - COUNT(submitter_wallet_pubkey) as null_count
FROM training_corpus_items;
```

## Behavior Changes

### New Submissions/Items

- **Train Attempts**: `submitterWalletPubkey` is automatically set from the authenticated session wallet when creating a submission
- **Corpus Items**: `submitterWalletPubkey` is automatically set from the authenticated session wallet when creating a corpus item
- Client-provided wallet addresses in request body are **ignored** for security

### Self-Review Protection

When `REWARDS_REVIEWER_SELF_REVIEW=false` (default):
- Reviewers cannot earn reviewer shares for reviewing their own submissions
- The system compares `reviewerWalletAddress` (from session) with `submitterWalletPubkey` (from item)
- Self-reviews are silently skipped when recording reviewer shares

When `REWARDS_REVIEWER_SELF_REVIEW=true`:
- Self-reviews are allowed and earn rewards

### Legacy Rows

- Rows with `null` `submitterWalletPubkey` will log a warning but continue to function
- Self-review protection won't be enforced for legacy rows (they're treated as "unknown submitter")
- Legacy rows will naturally decrease over time as new submissions use the new field

## Testing

Run the test suite to verify the implementation:

```bash
npm test -- submitterWalletSecurity
```

Tests verify:
1. Submitter wallet is stored from session, not client body
2. Self-review protection prevents reward farming
3. Different wallet reviews still earn rewards

## Rollback

If you need to rollback:

1. The new columns are nullable, so removing them won't break existing data
2. Remove the columns manually:
   ```sql
   ALTER TABLE train_attempts DROP COLUMN submitter_wallet_pubkey;
   ALTER TABLE training_corpus_items DROP COLUMN submitter_wallet_pubkey;
   ```
3. Revert the code changes in:
   - `shared/schema.ts`
   - `server/routes.ts`
   - `server/storage.ts`
   - `server/services/rag.ts`

## Security Notes

- **Never trust client-provided wallet addresses** - Always use session wallet
- Session wallet is validated through the authentication middleware
- Reviewers can't spoof submitter wallet to bypass self-review protection
- All wallet addresses come from server-side session validation

