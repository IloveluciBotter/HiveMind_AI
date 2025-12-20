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
      decimals: parsedData.info.tokenAmount?.decimals || 8,
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
    let decimals = 8;

    for (const ix of instructions) {
      if ("parsed" in ix && (ix.program === "spl-token" || ix.program === "spl-token-2022")) {
        const parsed = ix.parsed;
        
        if (parsed.type === "transfer" || parsed.type === "transferChecked") {
          const destination = parsed.info.destination || parsed.info.account;
          const source = parsed.info.source;
          const authority = parsed.info.authority;
          
          if (parsed.type === "transferChecked") {
            verifiedAmount = Number(parsed.info.tokenAmount?.uiAmount || 0);
            decimals = parsed.info.tokenAmount?.decimals || 8;
            mint = parsed.info.mint || "";
          } else {
            rawAmount = Number(parsed.info.amount);
          }

          const destStr = typeof destination === "string" ? destination : destination?.toString();
          
          if (destStr?.toLowerCase() === expectedRecipient.toLowerCase()) {
            transferFound = true;
            sender = typeof source === "string" ? source : source?.toString() || "";
            senderOwner = typeof authority === "string" ? authority : authority?.toString() || "";
            receiver = destStr;
            break;
          }
        }
      }
    }

    if (!transferFound) {
      return { 
        valid: false, 
        error: "No transfer to vault address found in transaction" 
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
