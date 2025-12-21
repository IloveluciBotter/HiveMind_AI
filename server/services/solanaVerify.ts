import { Connection, PublicKey, ParsedTransactionWithMeta, AccountInfo, ParsedAccountData } from "@solana/web3.js";
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

    const tolerance = 0.00000001;
    if (Math.abs(verifiedAmount - claimedAmount) > tolerance) {
      return { 
        valid: false, 
        error: `Amount mismatch: claimed ${claimedAmount}, found ${verifiedAmount}` 
      };
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
