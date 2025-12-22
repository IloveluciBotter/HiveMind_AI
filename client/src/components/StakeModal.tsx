import { useState, useEffect, useRef } from "react";
import { X, Coins, ArrowRight, Check, AlertTriangle, Loader2, ExternalLink, Copy } from "lucide-react";
import { api } from "@/lib/api";

interface StakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentStake: number;
  requiredFee: number;
  onStakeUpdated: (newStake: number) => void;
}

type Step = "input" | "sending" | "confirming" | "success" | "error";

/**
 * Helper to detect wallet rejection errors across common error shapes
 */
function isUserRejectedError(err: unknown): boolean {
  if (!err) return false;
  
  if (typeof err === "object") {
    // Check for wallet error codes (4001 is standard rejection code)
    if ("code" in err && err.code === 4001) {
      return true;
    }
    
    // Check error name for wallet-specific errors (only if message indicates rejection)
    if ("name" in err) {
      const name = String(err.name);
      const hasWalletErrorName = name.includes("WalletSignTransactionError") || name.includes("WalletSendTransactionError");
      
      if (hasWalletErrorName && "message" in err) {
        const message = String(err.message).toLowerCase();
        return (
          message.includes("rejected") ||
          message.includes("denied") ||
          message.includes("declined") ||
          message.includes("cancelled") ||
          message.includes("canceled")
        );
      }
    }
    
    // Check error message for rejection indicators
    if ("message" in err) {
      const message = String(err.message).toLowerCase();
      return (
        message.includes("user rejected") ||
        message.includes("rejected the request") ||
        message.includes("denied") ||
        message.includes("declined") ||
        message.includes("cancelled") ||
        message.includes("cancelled")
      );
    }
  }
  
  // Check if it's an Error instance
  if (err instanceof Error) {
    const message = err.message.toLowerCase();
    return (
      message.includes("user rejected") ||
      message.includes("rejected the request") ||
      message.includes("denied") ||
      message.includes("declined") ||
      message.includes("cancelled") ||
      message.includes("cancelled")
    );
  }
  
  return false;
}

export function StakeModal({ isOpen, onClose, currentStake, requiredFee, onStakeUpdated }: StakeModalProps) {
  const [step, setStep] = useState<Step>("input");
  const [amount, setAmount] = useState<string>("");
  const [vaultAddress, setVaultAddress] = useState<string>("");
  const [mintAddress, setMintAddress] = useState<string>("");
  const [txSignature, setTxSignature] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [newBalance, setNewBalance] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  
  // Abort controller ref for polling cancellation
  const confirmAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (isOpen) {
      api.stake.getDepositInfo().then((info) => {
        setVaultAddress(info.vaultAddress);
        setMintAddress(info.mintAddress);
      }).catch(console.error);
      
      const deficit = Math.max(0, requiredFee - currentStake);
      setAmount(deficit > 0 ? deficit.toFixed(2) : "1");
      setStep("input");
      setError("");
      setTxSignature("");
    } else {
      // Abort any in-flight polling when modal closes
      if (confirmAbortRef.current) {
        confirmAbortRef.current.abort();
        confirmAbortRef.current = null;
      }
    }
    
    // Cleanup on unmount
    return () => {
      if (confirmAbortRef.current) {
        confirmAbortRef.current.abort();
        confirmAbortRef.current = null;
      }
    };
  }, [isOpen, requiredFee, currentStake]);

  const shortAddress = (addr: string) => {
    if (!addr) return "";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const copyVaultAddress = async () => {
    await navigator.clipboard.writeText(vaultAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /**
   * Poll signature status with abort support
   */
  async function pollSignatureStatus(
    signature: string,
    connection: any,
    options: {
      timeoutMs: number;
      intervalMs: number;
      signal: AbortSignal;
    }
  ): Promise<boolean> {
    const { timeoutMs, intervalMs, signal } = options;
    const startTime = Date.now();
    const maxAttempts = Math.floor(timeoutMs / intervalMs);

    for (let i = 0; i < maxAttempts; i++) {
      // Exit immediately if aborted
      if (signal.aborted) {
        return false;
      }

      // Check timeout
      if (Date.now() - startTime >= timeoutMs) {
        return false;
      }

      try {
        const status = await connection.getSignatureStatus(signature);
        if (
          status?.value?.confirmationStatus === "confirmed" ||
          status?.value?.confirmationStatus === "finalized"
        ) {
          return true;
        }
      } catch (e) {
        // Continue polling on error
      }

      // Wait for next poll, but check abort signal during wait
      await new Promise<void>((resolve) => {
        const timeoutId = setTimeout(resolve, intervalMs);
        signal.addEventListener("abort", () => {
          clearTimeout(timeoutId);
          resolve();
        });
      });

      if (signal.aborted) {
        return false;
      }
    }

    return false;
  }

  const handleDeposit = async () => {
    const depositAmount = parseFloat(amount);
    if (isNaN(depositAmount) || depositAmount <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    setStep("sending");
    setError("");

    try {
      if (!window.solana?.isPhantom) {
        throw new Error("Phantom wallet not detected. Please install Phantom.");
      }

      const wallet = window.solana;
      
      if (!wallet.publicKey) {
        await wallet.connect();
        if (!wallet.publicKey) {
          throw new Error("Please connect your wallet first");
        }
      }

      const { PublicKey, Transaction } = await import("@solana/web3.js");
      const splTokenModule = await import("@solana/spl-token") as any;
      const {
        getAssociatedTokenAddress,
        createTransferInstruction,
        createAssociatedTokenAccountInstruction,
        getAccount,
        getMint,
        TOKEN_PROGRAM_ID,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      } = splTokenModule;

      // Use secure RPC proxy (never exposes API keys to client)
      const { createSolanaConnection } = await import("@/lib/solanaConnection");
      const connection = createSolanaConnection();

      const fromPubkey = new PublicKey(wallet.publicKey.toString());
      const toPubkey = new PublicKey(vaultAddress);
      
      // Validate mint address
      let mintPubkey;
      try {
        mintPubkey = new PublicKey(mintAddress);
      } catch (error: any) {
        throw new Error(`Invalid mint address: ${mintAddress}. Please check your configuration.`);
      }

      let mintInfo;
      let decimals = 6; // Default to 6 decimals for HIVE token (Token-2022 with extensions)
      let tokenProgramId = TOKEN_PROGRAM_ID; // Default to regular Token Program
      
      // Check if it's Token-2022 by checking account owner
      let accountInfo = null;
      try {
        accountInfo = await connection.getAccountInfo(mintPubkey);
      } catch (error: any) {
        console.warn(`[StakeModal] Failed to get account info:`, error.message);
        // Continue with default Token-2022 assumption
      }

      if (accountInfo) {
        const TOKEN_2022_PROGRAM_ID_STR = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
        if (accountInfo.owner.toBase58() === TOKEN_2022_PROGRAM_ID_STR) {
          tokenProgramId = TOKEN_2022_PROGRAM_ID;
          console.log("Detected Token-2022 mint, using TOKEN_2022_PROGRAM_ID");
        }
      } else {
        // If we can't check, default to Token-2022 (HIVE token is Token-2022)
        console.warn("Could not fetch account info, defaulting to Token-2022 for HIVE token");
        tokenProgramId = TOKEN_2022_PROGRAM_ID;
      }

      // Use the proxy connection for all RPC calls (read-only operations)
      const connectionToUse = connection;
      
      // Try to get mint info using proxy connection
      try {
        mintInfo = await getMint(connectionToUse, mintPubkey, undefined, tokenProgramId);
        decimals = mintInfo.decimals;
      } catch (error: any) {
        // If getMint fails, check if account exists and use default decimals
        if (error.message?.includes("TokenInvalidAccountOwnerError") || error.message?.includes("InvalidAccountOwner") || error.name === "TokenInvalidAccountOwnerError") {
          console.warn("TokenInvalidAccountOwnerError, verifying account exists");
          try {
            const verifyAccountInfo = await connectionToUse.getAccountInfo(mintPubkey);
            if (!verifyAccountInfo) {
              throw new Error(`Mint account ${mintAddress} does not exist on Solana. Please verify the HIVE token mint address.`);
            }
            // Account exists, use default decimals and continue (HIVE token has 6 decimals)
            console.warn(`Account exists but getMint failed, using default 6 decimals for ${mintAddress}`);
            decimals = 6;
          } catch (verifyError: any) {
            throw new Error(`Invalid mint account: ${mintAddress}. ${verifyError.message || "Please verify the HIVE_MINT configuration."}`);
          }
        } else {
          // For other errors, use default decimals (HIVE token has 6 decimals)
          console.warn(`getMint failed, using default 6 decimals for ${mintAddress}. Error:`, error.message);
          decimals = 6;
        }
      }

      const fromATA = await getAssociatedTokenAddress(mintPubkey, fromPubkey, false, tokenProgramId);
      const toATA = await getAssociatedTokenAddress(mintPubkey, toPubkey, true, tokenProgramId);

      const amountLamports = BigInt(Math.floor(depositAmount * Math.pow(10, decimals)));

      const transaction = new Transaction();
      
      let toATAExists = false;
      try {
        await getAccount(connectionToUse, toATA, undefined, tokenProgramId);
        toATAExists = true;
      } catch (error: any) {
        // Account doesn't exist, which is fine - we'll create it
        toATAExists = false;
      }

      if (!toATAExists) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            fromPubkey,
            toATA,
            toPubkey,
            mintPubkey,
            tokenProgramId,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      }
      
      transaction.add(
        createTransferInstruction(
          fromATA,
          toATA,
          fromPubkey,
          amountLamports,
          [],
          tokenProgramId
        )
      );

      const blockhashResult = await connectionToUse.getLatestBlockhash();
      const blockhash = blockhashResult.blockhash;
      
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = fromPubkey;

      // Abort any previous polling
      if (confirmAbortRef.current) {
        confirmAbortRef.current.abort();
      }
      confirmAbortRef.current = new AbortController();

      // Send transaction using Phantom's RPC (signAndSendTransaction handles both signing and sending)
      // Phantom wallet uses its own RPC endpoint for sending transactions
      let sendResult;
      try {
        sendResult = await wallet.signAndSendTransaction(transaction);
      } catch (sendError: unknown) {
        // Handle user rejection silently - reset UI and return early
        if (isUserRejectedError(sendError)) {
          setStep("input");
          setError("");
          setTxSignature("");
          if (confirmAbortRef.current) {
            confirmAbortRef.current.abort();
            confirmAbortRef.current = null;
          }
          return; // Exit early, no error shown
        }
        // Re-throw other errors to be handled by outer catch
        throw sendError;
      }
      
      const signature = sendResult.signature; // Extract signature string from result object
      
      // Only set signature and step after we have a valid signature
      setTxSignature(signature);
      setStep("confirming");
      
      // Poll for confirmation using abortable polling
      const confirmed = await pollSignatureStatus(signature, connectionToUse, {
        timeoutMs: 15000, // 15 seconds max
        intervalMs: 500, // Poll every 500ms
        signal: confirmAbortRef.current.signal,
      });
      
      // Check if polling was aborted (user closed modal or started new deposit)
      if (confirmAbortRef.current.signal.aborted) {
        return; // Exit silently if aborted
      }
      
      if (!confirmed) {
        // Transaction might still be processing, but we'll proceed anyway
        // The backend verification will catch if it actually failed
        console.warn("Transaction confirmation timeout, but proceeding with backend verification");
      }

      const confirmResult = await api.stake.confirmDeposit(signature, depositAmount);
      
      if (confirmResult.success) {
        setNewBalance(confirmResult.stakeAfter);
        onStakeUpdated(confirmResult.stakeAfter);
        setStep("success");
      } else {
        throw new Error("Failed to confirm deposit");
      }
    } catch (err: unknown) {
      // Abort any polling on error
      if (confirmAbortRef.current) {
        confirmAbortRef.current.abort();
        confirmAbortRef.current = null;
      }
      
      // Handle user rejection silently - should already be caught, but double-check
      if (isUserRejectedError(err)) {
        setStep("input");
        setError("");
        setTxSignature("");
        return; // Exit early, no error shown
      }
      
      // For non-rejection errors, show error message
      console.error("Deposit error:", err);
      let errorMessage = "Transaction failed";
      if (err instanceof Error) {
        errorMessage = err.message;
        // Provide more helpful error messages
        if (errorMessage.includes("insufficient funds") || errorMessage.includes("Insufficient")) {
          errorMessage = "Insufficient balance. Please check your HIVE token balance.";
        } else if (errorMessage.includes("403") || errorMessage.includes("Access forbidden")) {
          errorMessage = "RPC access denied. Please try again or contact support.";
        } else if (errorMessage.includes("network") || errorMessage.includes("Network")) {
          errorMessage = "Network error. Please check your connection and try again.";
        }
      }
      setError(errorMessage);
      setStep("error");
    }
  };

  const handleManualConfirm = async () => {
    if (!txSignature.trim()) {
      setError("Please enter a transaction signature");
      return;
    }

    setStep("confirming");
    setError("");

    try {
      const depositAmount = parseFloat(amount) || 0;
      const result = await api.stake.confirmDeposit(txSignature, depositAmount);
      
      if (result.success) {
        setNewBalance(result.stakeAfter);
        onStakeUpdated(result.stakeAfter);
        setStep("success");
      } else {
        throw new Error("Failed to confirm deposit");
      }
    } catch (err: unknown) {
      console.error("Confirm error:", err);
      const errorMessage = err instanceof Error ? err.message : "Confirmation failed";
      setError(errorMessage);
      setStep("error");
    }
  };

  if (!isOpen) return null;

  const deficit = requiredFee - currentStake;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl max-w-md w-full border border-gray-700 shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Coins className="w-5 h-5 text-yellow-400" />
            Stake HIVE Tokens
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {step === "input" && (
            <div className="space-y-6">
              <div className="bg-gray-800 rounded-lg p-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Current Stake</span>
                  <span className="font-medium">{currentStake.toFixed(4)} HIVE</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Training Fee</span>
                  <span className="font-medium">{requiredFee.toFixed(4)} HIVE</span>
                </div>
                {deficit > 0 && (
                  <div className="flex justify-between text-sm pt-2 border-t border-gray-700">
                    <span className="text-yellow-400">Minimum Needed</span>
                    <span className="font-medium text-yellow-400">{deficit.toFixed(4)} HIVE</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Amount to Deposit</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-lg focus:outline-none focus:border-purple-500"
                    placeholder="0.00"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">HIVE</span>
                </div>
              </div>

              {vaultAddress && (
                <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Vault Address</span>
                    <button 
                      onClick={copyVaultAddress}
                      className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
                    >
                      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <div className="font-mono text-sm text-gray-300 break-all">
                    {shortAddress(vaultAddress)}
                  </div>
                </div>
              )}

              <button
                onClick={handleDeposit}
                disabled={!amount || parseFloat(amount) <= 0}
                className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                Deposit with Phantom
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="text-center">
                <p className="text-xs text-gray-500 mb-2">Already sent tokens manually?</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={txSignature}
                    onChange={(e) => setTxSignature(e.target.value)}
                    placeholder="Paste transaction signature"
                    className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
                  />
                  <button
                    onClick={handleManualConfirm}
                    disabled={!txSignature.trim()}
                    className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 px-4 py-2 rounded-lg text-sm"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === "sending" && (
            <div className="text-center py-8 space-y-4">
              <Loader2 className="w-12 h-12 text-purple-400 animate-spin mx-auto" />
              <div>
                <h3 className="text-lg font-medium">Sending Transaction</h3>
                <p className="text-sm text-gray-400 mt-1">Please approve the transaction in your wallet...</p>
              </div>
            </div>
          )}

          {step === "confirming" && (
            <div className="text-center py-8 space-y-4">
              <Loader2 className="w-12 h-12 text-purple-400 animate-spin mx-auto" />
              <div>
                <h3 className="text-lg font-medium">Confirming Deposit</h3>
                <p className="text-sm text-gray-400 mt-1">Verifying transaction on chain...</p>
              </div>
            </div>
          )}

          {step === "success" && (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
                <Check className="w-8 h-8 text-green-400" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-green-400">Deposit Successful!</h3>
                <p className="text-sm text-gray-400 mt-1">
                  Your new stake balance is <span className="font-semibold text-white">{newBalance.toFixed(4)} HIVE</span>
                </p>
              </div>
              {txSignature && (
                <a
                  href={`https://solscan.io/tx/${txSignature}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300"
                >
                  View on Solscan <ExternalLink className="w-3 h-3" />
                </a>
              )}
              <button
                onClick={onClose}
                className="w-full bg-gray-700 hover:bg-gray-600 text-white font-medium py-3 rounded-lg mt-4"
              >
                Close
              </button>
            </div>
          )}

          {step === "error" && (
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-8 h-8 text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-red-400">Transaction Failed</h3>
                <p className="text-sm text-gray-400 mt-1">{error}</p>
              </div>
              <button
                onClick={() => setStep("input")}
                className="w-full bg-gray-700 hover:bg-gray-600 text-white font-medium py-3 rounded-lg"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
