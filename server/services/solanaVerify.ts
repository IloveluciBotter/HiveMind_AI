import { Connection, PublicKey, ParsedTransactionWithMeta, AccountInfo, ParsedAccountData } from "@solana/web3.js";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getEconomyConfig } from "./economy";
import { logger } from "../middleware/logger";

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

interface VerificationResult {
  valid: boolean;
  error?: string;
  verifiedAmount?: number;
  sender?: string;
  senderOwner?: string;
  receiver?: string;
  mint?: string;
}

interface TokenAccountInfo {
  mint: string;
  owner: string;
  decimals: number;
}

async function getTokenAccountInfo(
  connection: Connection,
  tokenAccountAddress: string
): Promise<TokenAccountInfo | null> {
  try {
    const pubkey = new PublicKey(tokenAccountAddress);
    const accountInfo = await connection.getParsedAccountInfo(pubkey);
    
    if (!accountInfo.value || !("parsed" in (accountInfo.value.data as any))) {
      return null;
    }
    
    const parsedData = (accountInfo.value.data as ParsedAccountData).parsed;
    if (parsedData.type !== "account") {
      return null;
    }
    
    return {
      mint: parsedData.info.mint,
      owner: parsedData.info.owner,
      decimals: parsedData.info.tokenAmount?.decimals || 6, // Default to 6 for HIVE token
    };
  } catch (error) {
    logger.error({ error: "Failed to fetch token account info", details: error });
    return null;
  }
}

export async function verifyDeposit(
  txSignature: string,
  expectedRecipient: string,
  expectedMint: string,
  claimedAmount: number,
  expectedSenderWallet: string
): Promise<VerificationResult> {
  try {
    const connection = new Connection(SOLANA_RPC_URL, "confirmed");
    
    const tx = await connection.getParsedTransaction(txSignature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return { valid: false, error: "Transaction not found on chain" };
    }

    if (tx.meta?.err) {
      return { valid: false, error: "Transaction failed on chain" };
    }

    const instructions = tx.transaction.message.instructions;
    let transferFound = false;
    let verifiedAmount = 0;
    let sender = "";
    let senderOwner = "";
    let receiver = "";
    let mint = "";
    let rawAmount = 0;
    let decimals = 6; // Default to 6 for HIVE token

    logger.info({ 
      message: "Verifying deposit transaction", 
      txSignature, 
      expectedRecipient, 
      expectedMint,
      instructionCount: instructions.length 
    });

    // First pass: collect all token transfers
    const transfers: Array<{
      destination: string;
      source: string;
      authority: string;
      amount: number;
      decimals: number;
      mint: string;
      type: string;
    }> = [];

    for (const ix of instructions) {
      if ("parsed" in ix && (ix.program === "spl-token" || ix.program === "spl-token-2022")) {
        const parsed = ix.parsed;
        
        if (parsed.type === "transfer" || parsed.type === "transferChecked") {
          const destination = parsed.info.destination || parsed.info.account;
          const source = parsed.info.source;
          const authority = parsed.info.authority;
          const destStr = typeof destination === "string" ? destination : destination?.toString() || "";
          
          let amount = 0;
          let transferDecimals = 6;
          let transferMint = "";
          
          if (parsed.type === "transferChecked") {
            amount = Number(parsed.info.tokenAmount?.uiAmount || 0);
            transferDecimals = parsed.info.tokenAmount?.decimals || 6;
            transferMint = parsed.info.mint || "";
          } else {
            rawAmount = Number(parsed.info.amount);
            // Will calculate amount later with decimals
          }

          transfers.push({
            destination: destStr,
            source: typeof source === "string" ? source : source?.toString() || "",
            authority: typeof authority === "string" ? authority : authority?.toString() || "",
            amount,
            decimals: transferDecimals,
            mint: transferMint,
            type: parsed.type,
          });
        }
      }
    }

    logger.info({ message: "Found token transfers", count: transfers.length, transfers: transfers.map(t => ({ dest: t.destination, amount: t.amount })) });

    // Second pass: check each transfer to see if it's to the vault
    for (const transfer of transfers) {
      let isVaultTransfer = false;
      
      // Check if destination matches vault directly
      if (transfer.destination.toLowerCase() === expectedRecipient.toLowerCase()) {
        isVaultTransfer = true;
        logger.info({ message: "Found direct transfer to vault", destination: transfer.destination });
      } else {
        // Check if destination is an ATA owned by the vault
        try {
          const destAccountInfo = await getTokenAccountInfo(connection, transfer.destination);
          if (destAccountInfo) {
            logger.info({ 
              message: "Checking token account owner", 
              destination: transfer.destination, 
              owner: destAccountInfo.owner, 
              vault: expectedRecipient 
            });
            if (destAccountInfo.owner.toLowerCase() === expectedRecipient.toLowerCase()) {
              isVaultTransfer = true;
              logger.info({ message: "Found transfer to vault ATA", destination: transfer.destination, owner: destAccountInfo.owner });
            }
          }
        } catch (error) {
          logger.warn({ 
            message: "Could not verify destination account owner", 
            destination: transfer.destination, 
            error: error instanceof Error ? error.message : String(error) 
          });
        }
      }
      
      if (isVaultTransfer) {
        transferFound = true;
        sender = transfer.source;
        senderOwner = transfer.authority;
        receiver = transfer.destination;
        verifiedAmount = transfer.amount;
        decimals = transfer.decimals;
        mint = transfer.mint;
        break;
      }
    }

    if (!transferFound) {
      return { 
        valid: false, 
        error: "No transfer to vault address found in transaction. Make sure you're sending to the correct vault address." 
      };
    }

    if (!mint && sender) {
      const sourceAccountInfo = await getTokenAccountInfo(connection, sender);
      if (!sourceAccountInfo) {
        return {
          valid: false,
          error: "Could not verify source token account",
        };
      }
      mint = sourceAccountInfo.mint;
      decimals = sourceAccountInfo.decimals;
      
      if (sourceAccountInfo.owner.toLowerCase() !== expectedSenderWallet.toLowerCase()) {
        return {
          valid: false,
          error: "Token account is not owned by your wallet",
        };
      }
    }

    if (rawAmount > 0 && verifiedAmount === 0) {
      verifiedAmount = rawAmount / Math.pow(10, decimals);
    }

    if (senderOwner.toLowerCase() !== expectedSenderWallet.toLowerCase()) {
      return {
        valid: false,
        error: "Transfer was not initiated by your wallet",
      };
    }

    if (expectedMint && mint.toLowerCase() !== expectedMint.toLowerCase()) {
      return {
        valid: false,
        error: "Token mint does not match HIVE token",
      };
    }

    // Harden amount verification using balance deltas from transaction metadata
    // This prevents 0-amount transfers and ensures we only credit actual deposits
    try {
      // Compute the vault's associated token account (ATA) for the expected mint
      const vaultPubkey = new PublicKey(expectedRecipient);
      const mintPubkey = new PublicKey(mint || expectedMint);
      
      // Determine which token program to use based on mint
      // Try Token-2022 first (HIVE uses Token-2022), fallback to legacy Token
      // TOKEN_2022_PROGRAM_ID and TOKEN_PROGRAM_ID from @solana/spl-token are PublicKey objects
      let tokenProgramId = TOKEN_2022_PROGRAM_ID;
      try {
        // Check if it's actually Token-2022 by verifying the mint account owner
        const mintAccountInfo = await connection.getAccountInfo(mintPubkey);
        if (mintAccountInfo?.owner.toBase58() !== TOKEN_2022_PROGRAM_ID.toBase58()) {
          tokenProgramId = TOKEN_PROGRAM_ID;
        }
      } catch (err) {
        // If we can't verify, default to Token-2022 for HIVE
        logger.warn({ message: "Could not verify mint program, defaulting to Token-2022", error: err });
      }
      
      const vaultATA = await getAssociatedTokenAddress(
        mintPubkey,
        vaultPubkey,
        true, // allowOwnerOffCurve - vault might not be a standard wallet
        tokenProgramId,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      const vaultATAStr = vaultATA.toBase58();

      // Find balance entries for the vault ATA in transaction metadata
      const preBalances = tx.meta?.preTokenBalances || [];
      const postBalances = tx.meta?.postTokenBalances || [];

      // Helper to get account address from accountKeys array
      const getAccountAddress = (index: number): string | null => {
        try {
          const accountKey = tx.transaction.message.accountKeys[index];
          if (!accountKey) return null;
          // accountKey can be PublicKey object, string, or object with pubkey property
          if (typeof accountKey === "string") {
            return accountKey;
          }
          // Check if it's a PublicKey object (has toBase58 method)
          if (accountKey instanceof PublicKey || (typeof accountKey === "object" && "toBase58" in accountKey)) {
            return (accountKey as PublicKey).toBase58();
          }
          // Check if it's an object with pubkey property
          if ("pubkey" in accountKey && accountKey.pubkey) {
            const pubkey = accountKey.pubkey;
            return pubkey instanceof PublicKey ? pubkey.toBase58() : String(pubkey);
          }
          return null;
        } catch {
          return null;
        }
      };

      // Find pre-balance entry for vault ATA (match by account address and mint)
      const preBalanceEntry = preBalances.find((bal) => {
        if (bal.accountIndex === undefined) return false;
        const accountAddress = getAccountAddress(bal.accountIndex);
        return accountAddress === vaultATAStr && bal.mint?.toLowerCase() === mint.toLowerCase();
      });

      // Find post-balance entry for vault ATA (match by account address and mint)
      const postBalanceEntry = postBalances.find((bal) => {
        if (bal.accountIndex === undefined) return false;
        const accountAddress = getAccountAddress(bal.accountIndex);
        return accountAddress === vaultATAStr && bal.mint?.toLowerCase() === mint.toLowerCase();
      });

      // Extract balance amounts (treat missing as 0)
      const preBalance = preBalanceEntry?.uiTokenAmount?.uiAmount ?? 0;
      const postBalance = postBalanceEntry?.uiTokenAmount?.uiAmount ?? 0;
      const balanceDecimals = postBalanceEntry?.uiTokenAmount?.decimals ?? preBalanceEntry?.uiTokenAmount?.decimals ?? decimals;

      // Compute delta (amount received)
      const delta = postBalance - preBalance;

      // Structured logging
      logger.info({
        message: "Deposit amount verification",
        txSignature,
        vaultATA: vaultATAStr,
        mint: mint.toLowerCase(),
        decimals: balanceDecimals,
        preBalance,
        postBalance,
        delta,
        claimedAmount,
        expectedDepositAmount: claimedAmount,
      });

      // Require delta > 0 (no zero-amount transfers)
      if (delta <= 0) {
        logger.warn({
          message: "deposit_invalid_amount",
          txSignature,
          vaultATA: vaultATAStr,
          delta,
          claimedAmount,
          reason: "delta <= 0",
        });
        return {
          valid: false,
          error: "Invalid deposit amount: transaction did not increase vault balance",
        };
      }

      // Require delta >= claimedAmount (with small tolerance for rounding)
      const tolerance = 0.00000001;
      if (delta < claimedAmount - tolerance) {
        logger.warn({
          message: "deposit_invalid_amount",
          txSignature,
          vaultATA: vaultATAStr,
          delta,
          claimedAmount,
          reason: "delta < claimedAmount",
        });
        return {
          valid: false,
          error: `Amount mismatch: claimed ${claimedAmount}, but vault balance only increased by ${delta}`,
        };
      }

      // Use delta as the verified amount (more accurate than instruction parsing)
      verifiedAmount = delta;
      decimals = balanceDecimals;

      logger.info({
        message: "Deposit amount verified successfully",
        txSignature,
        verifiedAmount: delta,
        decimals: balanceDecimals,
      });
    } catch (balanceError) {
      logger.error({
        message: "Failed to verify deposit amount using balance deltas",
        txSignature,
        error: balanceError instanceof Error ? balanceError.message : String(balanceError),
      });
      
      // Fallback to instruction-based verification if balance delta check fails
      // (for backwards compatibility, but log a warning)
      logger.warn({
        message: "Falling back to instruction-based amount verification",
        txSignature,
      });
      
      const tolerance = 0.00000001;
      if (Math.abs(verifiedAmount - claimedAmount) > tolerance) {
        return { 
          valid: false, 
          error: `Amount mismatch: claimed ${claimedAmount}, found ${verifiedAmount}` 
        };
      }
    }

    return {
      valid: true,
      verifiedAmount,
      sender,
      senderOwner,
      receiver,
      mint,
    };
  } catch (error) {
    logger.error({ error: "Solana verification failed", details: error });
    return { 
      valid: false, 
      error: "Failed to verify transaction on chain" 
    };
  }
}

export async function getConnection(): Promise<Connection> {
  return new Connection(SOLANA_RPC_URL, "confirmed");
}
