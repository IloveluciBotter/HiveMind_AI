import { Connection, PublicKey } from "@solana/web3.js";

// RPC endpoints with fallbacks (public endpoints have rate limits)
const SOLANA_RPC_URLS = [
  process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
  "https://rpc.ankr.com/solana",
  "https://solana.public-rpc.com",
].filter(Boolean) as string[];

const HIVE_MINT = process.env.HIVE_MINT || "F3zvEFZVhDXNo1kZDPg24Z3RioDzCdEJVdnZ5FCcpump";

// Token Program IDs
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"; // Legacy SPL Token
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"; // Token-2022

// Get working connection with fallback
async function getWorkingConnection(): Promise<Connection> {
  for (const url of SOLANA_RPC_URLS) {
    try {
      const conn = new Connection(url, "confirmed");
      // Test the connection
      await conn.getSlot();
      return conn;
    } catch (error) {
      console.log(`[Solana RPC] ${url} failed, trying next...`);
    }
  }
  // Return first as fallback
  return new Connection(SOLANA_RPC_URLS[0], "confirmed");
}

export interface HiveBalanceResult {
  rawAmount: string;
  decimals: number;
  uiAmount: number;
  programUsed: "Token-2022" | "Legacy" | "Both" | "None";
}

/**
 * Get HIVE token balance for a wallet address
 * Scans BOTH Token and Token-2022 programs and sums matching accounts
 */
export async function getHiveBalance(walletAddress: string): Promise<number> {
  const result = await getHiveBalanceDetailed(walletAddress);
  return result.uiAmount;
}

/**
 * Get detailed HIVE token balance including program info
 * Scans BOTH Token and Token-2022 programs
 */
export async function getHiveBalanceDetailed(walletAddress: string): Promise<HiveBalanceResult> {
  try {
    const connection = await getWorkingConnection();
    const ownerPk = new PublicKey(walletAddress);
    const token2022ProgramPk = new PublicKey(TOKEN_2022_PROGRAM_ID);
    const tokenProgramPk = new PublicKey(TOKEN_PROGRAM_ID);

    // Query both programs in parallel
    const [token2022Accounts, legacyAccounts] = await Promise.all([
      connection.getParsedTokenAccountsByOwner(ownerPk, { programId: token2022ProgramPk }),
      connection.getParsedTokenAccountsByOwner(ownerPk, { programId: tokenProgramPk }),
    ]);

    let rawBalanceSum = BigInt(0);
    let decimals = 6; // Default for HIVE
    let token2022Count = 0;
    let legacyCount = 0;

    // Process Token-2022 accounts
    for (const accountInfo of token2022Accounts.value) {
      const parsedInfo = accountInfo.account.data.parsed?.info;
      if (parsedInfo?.mint === HIVE_MINT && parsedInfo?.tokenAmount) {
        rawBalanceSum += BigInt(parsedInfo.tokenAmount.amount || "0");
        decimals = parsedInfo.tokenAmount.decimals || 6;
        token2022Count++;
      }
    }

    // Process Legacy SPL Token accounts
    for (const accountInfo of legacyAccounts.value) {
      const parsedInfo = accountInfo.account.data.parsed?.info;
      if (parsedInfo?.mint === HIVE_MINT && parsedInfo?.tokenAmount) {
        rawBalanceSum += BigInt(parsedInfo.tokenAmount.amount || "0");
        decimals = parsedInfo.tokenAmount.decimals || 6;
        legacyCount++;
      }
    }

    // Determine which program(s) had the token
    let programUsed: "Token-2022" | "Legacy" | "Both" | "None" = "None";
    if (token2022Count > 0 && legacyCount > 0) {
      programUsed = "Both";
    } else if (token2022Count > 0) {
      programUsed = "Token-2022";
    } else if (legacyCount > 0) {
      programUsed = "Legacy";
    }

    // Convert raw balance to UI amount
    const uiAmount = Number(rawBalanceSum) / Math.pow(10, decimals);

    console.log(`[HIVE Balance] wallet=${walletAddress.slice(0,8)}... program=${programUsed} raw=${rawBalanceSum.toString()} ui=${uiAmount}`);

    return {
      rawAmount: rawBalanceSum.toString(),
      decimals,
      uiAmount,
      programUsed,
    };
  } catch (error) {
    console.error("Error fetching HIVE balance:", error);
    return {
      rawAmount: "0",
      decimals: 6,
      uiAmount: 0,
      programUsed: "None",
    };
  }
}

