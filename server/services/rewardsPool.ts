import { Connection, PublicKey, Transaction, Keypair } from "@solana/web3.js";
import { getAssociatedTokenAddress, createTransferInstruction, getAccount, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { rewardsPoolLedger } from "@shared/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { getEconomyConfig } from "./economy";

export type PoolDepositSource = "rankup_forfeit" | "other";

export interface PoolDepositData {
  source: PoolDepositSource;
  amountHive: string;
  walletPubkey?: string;
  cycleId?: string;
}

/**
 * Record a deposit into the rewards pool ledger
 */
export async function recordPoolDeposit(data: PoolDepositData): Promise<string> {
  const result = await db
    .insert(rewardsPoolLedger)
    .values({
      source: data.source,
      amountHive: data.amountHive,
      walletPubkey: data.walletPubkey || null,
      cycleId: data.cycleId || null,
      status: "recorded",
    })
    .returning({ id: rewardsPoolLedger.id });

  return result[0].id;
}

/**
 * Attempt to transfer tokens from vault to rewards wallet
 * Only attempts if server has authority (REWARDS_POOL_TRANSFER_ENABLED=true and proper config)
 */
export async function tryTransferToRewardsWallet(ledgerId: string): Promise<{ success: boolean; txSignature?: string; error?: string }> {
  const transferEnabled = process.env.REWARDS_POOL_TRANSFER_ENABLED === "true";
  
  if (!transferEnabled) {
    // Mark as pending transfer but don't attempt
    await db
      .update(rewardsPoolLedger)
      .set({ status: "pending_transfer", updatedAt: new Date() })
      .where(eq(rewardsPoolLedger.id, ledgerId));
    return { success: false, error: "Transfer not enabled" };
  }

  // Get ledger entry
  const ledger = await db
    .select()
    .from(rewardsPoolLedger)
    .where(eq(rewardsPoolLedger.id, ledgerId))
    .limit(1);

  if (!ledger[0]) {
    return { success: false, error: "Ledger entry not found" };
  }

  const config = getEconomyConfig();
  const rewardsWalletAddress = config.rewardsWalletAddress || process.env.REWARDS_WALLET_ADDRESS;
  const vaultAddress = config.vaultAddress || process.env.HIVE_VAULT_ADDRESS;
  const mintAddress = config.mintAddress || process.env.HIVE_MINT;
  const rpcUrl = process.env.SOLANA_RPC_URL;

  // Check if we have all required config
  if (!rewardsWalletAddress || !vaultAddress || !mintAddress || !rpcUrl) {
    await db
      .update(rewardsPoolLedger)
      .set({ status: "pending_transfer", updatedAt: new Date() })
      .where(eq(rewardsPoolLedger.id, ledgerId));
    return { success: false, error: "Missing required configuration" };
  }

  // Check if server has authority (has private key for vault)
  // For security, we'll only attempt if VAULT_PRIVATE_KEY is set
  const vaultPrivateKey = process.env.VAULT_PRIVATE_KEY;
  if (!vaultPrivateKey) {
    await db
      .update(rewardsPoolLedger)
      .set({ status: "pending_transfer", updatedAt: new Date() })
      .where(eq(rewardsPoolLedger.id, ledgerId));
    return { success: false, error: "Server does not have vault authority" };
  }

  try {
    const connection = new Connection(rpcUrl, "confirmed");
    const mintPubkey = new PublicKey(mintAddress);
    const vaultPubkey = new PublicKey(vaultAddress);
    const rewardsPubkey = new PublicKey(rewardsWalletAddress);

    // Parse vault private key
    const vaultKeypair = Keypair.fromSecretKey(
      Buffer.from(vaultPrivateKey, "base64")
    );

    // Get token accounts
    const vaultATA = await getAssociatedTokenAddress(
      mintPubkey,
      vaultPubkey,
      false,
      TOKEN_PROGRAM_ID
    );
    const rewardsATA = await getAssociatedTokenAddress(
      mintPubkey,
      rewardsPubkey,
      true,
      TOKEN_PROGRAM_ID
    );

    // Check if rewards ATA exists, create if not
    let rewardsATAExists = false;
    try {
      await getAccount(connection, rewardsATA, undefined, TOKEN_PROGRAM_ID);
      rewardsATAExists = true;
    } catch {
      // ATA doesn't exist, will need to create it
      rewardsATAExists = false;
    }

    // Get amount in lamports (HIVE has 6 decimals)
    const amountLamports = BigInt(Math.floor(parseFloat(ledger[0].amountHive) * Math.pow(10, 6)));

    // Build transaction
    const transaction = new Transaction();
    
    if (!rewardsATAExists) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          vaultKeypair.publicKey,
          rewardsATA,
          rewardsPubkey,
          mintPubkey,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
    }

    transaction.add(
      createTransferInstruction(
        vaultATA,
        rewardsATA,
        vaultKeypair.publicKey,
        amountLamports,
        [],
        TOKEN_PROGRAM_ID
      )
    );

    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = vaultKeypair.publicKey;

    // Sign and send
    transaction.sign(vaultKeypair);
    const signature = await connection.sendRawTransaction(transaction.serialize());

    // Confirm transaction
    await connection.confirmTransaction(signature, "confirmed");

    // Update ledger
    await db
      .update(rewardsPoolLedger)
      .set({
        status: "transferred",
        txSignature: signature,
        updatedAt: new Date(),
      })
      .where(eq(rewardsPoolLedger.id, ledgerId));

    return { success: true, txSignature: signature };
  } catch (error: any) {
    console.error("Failed to transfer to rewards wallet:", error);
    
    // Mark as failed
    await db
      .update(rewardsPoolLedger)
      .set({
        status: "failed",
        updatedAt: new Date(),
      })
      .where(eq(rewardsPoolLedger.id, ledgerId));

    return { success: false, error: error.message || "Transfer failed" };
  }
}

