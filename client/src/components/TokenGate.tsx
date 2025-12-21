import { useState, useEffect } from "react";
import { Lock, Wallet, Brain, ArrowRight, TrendingUp, AlertTriangle, CheckCircle, XCircle, Loader2, ArrowUp } from "lucide-react";
import { Link, useLocation } from "wouter";
import { api } from "@/lib/api";
import { LevelRequirementsModal } from "./LevelRequirementsModal";

interface TokenGateProps {
  connected: boolean;
  hasAccess: boolean;
  hiveBalance: number;
  requiredHive: number;
  onConnect: () => void;
  children: React.ReactNode;
}

interface StatusData {
  currentLevel: number | null;
  targetLevel: number | null;
  walletHold: number;
  vaultStake: number;
  requiredWalletHold: number | null;
  requiredVaultStake: number | null;
  activeTrial: boolean;
  loading: boolean;
  error: string | null;
}

export function TokenGate({
  connected,
  hasAccess,
  hiveBalance,
  requiredHive,
  onConnect,
  children,
}: TokenGateProps) {
  const [, setLocation] = useLocation();
  const [startingTrial, setStartingTrial] = useState(false);
  const [showLevelRequirements, setShowLevelRequirements] = useState(false);
  const [status, setStatus] = useState<StatusData>({
    currentLevel: null,
    targetLevel: null,
    walletHold: hiveBalance,
    vaultStake: 0,
    requiredWalletHold: null,
    requiredVaultStake: null,
    activeTrial: false,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!connected) {
      setStatus(prev => ({
        ...prev,
        currentLevel: null,
        targetLevel: null,
        requiredWalletHold: null,
        requiredVaultStake: null,
        vaultStake: 0,
        loading: false,
        error: null,
      }));
      return;
    }

    const loadStatus = async () => {
      setStatus(prev => ({ ...prev, loading: true, error: null }));
      
      try {
        // Check if authenticated first - stake.getStatus requires auth
        let isAuthenticated = false;
        try {
          const sessionCheck = await api.auth.session();
          isAuthenticated = sessionCheck.authenticated;
        } catch (error: any) {
          // Not authenticated (401) - this is expected, not an error
          // Only log if it's not a 401
          if (error?.status !== 401 && !error?.isUnauthorized) {
            console.error("Session check failed:", error);
          }
          isAuthenticated = false;
        }
        
        // Get vault stake and level (only if authenticated)
        const stakeStatus = isAuthenticated 
          ? await api.stake.getStatus().catch(() => ({ stakeHive: 0, level: 1 }))
          : { stakeHive: 0, level: 1 };
        
        // Get active trial to determine target level (only if authenticated)
        const trialResponse = isAuthenticated
          ? await api.rankup.getActive().catch((error: any) => {
              // 401 is expected when not authenticated, don't log as error
              if (error?.status !== 401 && !error?.isUnauthorized) {
                console.error("Failed to get active trial:", error);
              }
              return { ok: true, trial: null };
            })
          : { ok: true, trial: null };
        const hasActiveTrial = trialResponse?.ok && trialResponse.trial !== null;
        
        // Determine current level and target level
        let currentLevel = stakeStatus.level || 1;
        let targetLevel: number;
        
        if (hasActiveTrial && trialResponse.trial) {
          targetLevel = trialResponse.trial.toLevel;
          currentLevel = trialResponse.trial.fromLevel;
        } else {
          targetLevel = currentLevel + 1;
          // Cap at max level if needed (assuming 100 as max)
          const maxLevel = 100;
          if (targetLevel > maxLevel) {
            targetLevel = maxLevel;
          }
        }

        // Get requirements for target level
        const reqResponse = await api.progression.getRequirements(targetLevel).catch(() => null);
        
        setStatus({
          currentLevel,
          targetLevel,
          walletHold: hiveBalance,
          vaultStake: stakeStatus.stakeHive || 0,
          requiredWalletHold: reqResponse?.ok ? reqResponse.requirements.walletHold : null,
          requiredVaultStake: reqResponse?.ok ? reqResponse.requirements.vaultStake : null,
          activeTrial: hasActiveTrial,
          loading: false,
          error: null,
        });
      } catch (error: any) {
        console.error("Failed to load status:", error);
        setStatus(prev => ({
          ...prev,
          loading: false,
          error: "Unable to load status",
        }));
      }
    };

    loadStatus();
  }, [connected, hiveBalance]);

  const StatusRow = ({ label, value, required, pass }: { label: string; value: string | number; required?: number | null; pass?: boolean }) => (
    <div className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
      <div className="flex items-center gap-2">
        {pass !== undefined && (
          pass ? (
            <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          )
        )}
        <span className="text-sm text-gray-400">{label}</span>
      </div>
      <div className="text-right">
        <span className="text-sm font-medium text-white">
          {typeof value === "number" ? value.toFixed(2) : value}
          {required !== null && required !== undefined && (
            <span className="text-gray-500 ml-1">/ {required.toFixed(2)}</span>
          )}
        </span>
      </div>
    </div>
  );

  const handleStartTrial = async () => {
    if (!status.currentLevel || !status.targetLevel || startingTrial) return;
    
    setStartingTrial(true);
    try {
      const response = await api.rankup.start({
        currentLevel: status.currentLevel,
        targetLevel: status.targetLevel,
      });
      
      if (response.ok) {
        // Navigate to /train (trial mode will auto-detect)
        setLocation("/train");
      }
    } catch (error: any) {
      console.error("Failed to start rank-up trial:", error);
      setStatus(prev => ({
        ...prev,
        error: error.message || "Failed to start trial",
      }));
    } finally {
      setStartingTrial(false);
    }
  };

  const walletHoldPass = status.requiredWalletHold !== null && status.walletHold >= status.requiredWalletHold;
  const vaultStakePass = status.requiredVaultStake !== null && status.vaultStake >= status.requiredVaultStake;
  const requirementsMet = walletHoldPass && vaultStakePass;
  if (!connected) {
    return (
      <div className="max-w-6xl mx-auto p-8">
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          {/* Connect Section */}
          <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] text-center">
            <div className="bg-gray-800 rounded-full p-4 mb-4">
              <Wallet className="w-12 h-12 text-purple-400" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Connect Your Wallet</h2>
            <p className="text-gray-400 mb-6 max-w-md">
              Connect your Phantom wallet to access HiveMind features.
            </p>
            <button
              onClick={onConnect}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold transition-colors"
            >
              Connect Wallet
            </button>

            {/* Your Status Strip */}
            {connected ? (
              <div className="mt-8 w-full max-w-md">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <h3 className="text-sm font-semibold mb-3 text-gray-300">Your Status</h3>
                  
                  {status.loading ? (
                    <div className="space-y-2">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="flex items-center justify-between py-2">
                          <div className="h-4 bg-gray-800 rounded w-24 animate-pulse" />
                          <div className="h-4 bg-gray-800 rounded w-20 animate-pulse" />
                        </div>
                      ))}
                    </div>
                  ) : status.error ? (
                    <p className="text-xs text-yellow-400 py-2">{status.error}</p>
                  ) : (
                    <div className="space-y-0">
                      <StatusRow
                        label="Wallet"
                        value={connected ? "Connected" : "Not connected"}
                        pass={connected}
                      />
                      <StatusRow
                        label="Level"
                        value={status.currentLevel !== null ? `${status.currentLevel} → ${status.targetLevel}` : "Loading..."}
                      />
                      <StatusRow
                        label="Wallet Hold"
                        value={status.walletHold}
                        required={status.requiredWalletHold}
                        pass={status.requiredWalletHold !== null ? status.walletHold >= status.requiredWalletHold : undefined}
                      />
                      <StatusRow
                        label="Vault Stake"
                        value={status.vaultStake}
                        required={status.requiredVaultStake}
                        pass={status.requiredVaultStake !== null ? status.vaultStake >= status.requiredVaultStake : undefined}
                      />
                      
                      {/* Rank-Up Row */}
                      <div className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                        <div className="flex items-center gap-2">
                          <ArrowUp className="w-4 h-4 text-purple-400 flex-shrink-0" />
                          <span className="text-sm text-gray-400">Rank-Up</span>
                        </div>
                        <div className="text-right flex items-center gap-2">
                          {status.activeTrial ? (
                            <Link href="/train" className="text-xs text-purple-400 hover:text-purple-300 underline">
                              Trial Active
                            </Link>
                          ) : requirementsMet && status.currentLevel !== null && status.targetLevel !== null ? (
                            <button
                              onClick={handleStartTrial}
                              disabled={startingTrial}
                              className="px-2 py-1 text-xs bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded font-medium transition-colors flex items-center gap-1"
                            >
                              {startingTrial ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  Starting...
                                </>
                              ) : (
                                <>
                                  <ArrowUp className="w-3 h-3" />
                                  Start Trial
                                </>
                              )}
                            </button>
                          ) : (
                            <div className="text-right">
                              <span className="text-sm text-gray-500">Not ready</span>
                              <div className="text-xs text-gray-600 mt-0.5">
                                {!walletHoldPass && status.requiredWalletHold !== null && (
                                  <div>Need {status.requiredWalletHold.toFixed(2)} HIVE hold</div>
                                )}
                                {!vaultStakePass && status.requiredVaultStake !== null && (
                                  <div>Need {status.requiredVaultStake.toFixed(2)} stake</div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-8 w-full max-w-md">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <h3 className="text-sm font-semibold mb-3 text-gray-300">Your Status</h3>
                  <div className="space-y-0">
                    <div className="flex items-center justify-between py-2 border-b border-gray-800">
                      <div className="flex items-center gap-2">
                        <ArrowUp className="w-4 h-4 text-purple-400 flex-shrink-0" />
                        <span className="text-sm text-gray-400">Rank-Up</span>
                      </div>
                      <span className="text-sm text-gray-500">Connect wallet</span>
                    </div>
                    <p className="text-xs text-gray-500 pt-2">Connect to see your status</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Info Card */}
          <div className="flex-1 bg-gray-900 border border-gray-800 rounded-xl p-6 lg:max-w-lg">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Brain className="w-6 h-6 text-purple-400" />
              HiveMind AI — What it is, how to use it, and why
            </h3>

            <div className="space-y-6">
              {/* Section 1: What it is */}
              <div>
                <h4 className="text-lg font-semibold mb-3 text-purple-400">What is HiveMind?</h4>
                <ul className="space-y-2 text-sm text-gray-300">
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400 mt-1">•</span>
                    <span>HiveMind is a community-trained AI: everyone's training improves the same shared model.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400 mt-1">•</span>
                    <span>Access is token-gated: you must hold HIVE to participate.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400 mt-1">•</span>
                    <span>Training is real progression — not just chatting. Your performance and level matter.</span>
                  </li>
                </ul>
              </div>

              {/* Section 2: How to use it */}
              <div>
                <h4 className="text-lg font-semibold mb-3 text-purple-400">How do I use it?</h4>
                <ol className="space-y-2 text-sm text-gray-300 list-decimal list-inside">
                  <li>Connect your wallet (Phantom).</li>
                  <li>Hold enough HIVE to unlock training access.</li>
                  <li>Stake HIVE into the vault to enter progression tiers.</li>
                  <li>Train in /train to earn XP and prepare.</li>
                  <li>Start a Rank-Up Trial to level up (Level N → N+1).</li>
                  <li>Use /chat to talk to the AI and see it reference learned sources.</li>
                </ol>
              </div>

              {/* Section 3: Why it matters */}
              <div>
                <h4 className="text-lg font-semibold mb-3 text-purple-400">Why pass a Rank-Up Trial?</h4>
                <ul className="space-y-2 text-sm text-gray-300">
                  <li className="flex items-start gap-2">
                    <TrendingUp className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                    <span><span className="font-semibold text-white">Level Up:</span> Passing is the only way to unlock the next level.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <TrendingUp className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                    <span><span className="font-semibold text-white">More Impact:</span> Higher levels increase your weight in the shared learning system.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <TrendingUp className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                    <span><span className="font-semibold text-white">Higher Tiers:</span> Higher levels unlock tougher training tracks and higher requirements.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <TrendingUp className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                    <span><span className="font-semibold text-white">Earned Progress:</span> Trials require stake and skill — progression can't be spammed.</span>
                  </li>
                </ul>
              </div>

              {/* Risk Note */}
              <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-4 mt-6">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-gray-400 leading-relaxed">
                    <span className="font-semibold text-red-400">Risk Note:</span> Rank-Up Trials are stake-based: your trial stake is escrowed when you start. If you FAIL, you lose 100% of the trial stake. Fail 3 times in a row for the same level-up → you roll back 1 level. Only stake what you can afford to lose.
                  </p>
                </div>
              </div>

              {/* View Level Requirements Link */}
              <div className="pt-2">
                <button
                  onClick={() => setShowLevelRequirements(true)}
                  className="inline-flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300 transition-colors"
                >
                  View Level Requirements
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8">
        <div className="bg-red-900/30 rounded-full p-4 mb-4">
          <Lock className="w-12 h-12 text-red-400" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Token Gate</h2>
        <p className="text-gray-400 mb-4 max-w-md">
          You need at least {requiredHive} HIVE tokens to access this feature.
        </p>
        <div className="bg-gray-800 rounded-lg px-6 py-4 mb-6">
          <p className="text-sm text-gray-400">Your Balance</p>
          <p className="text-3xl font-bold text-red-400">
            {hiveBalance.toFixed(2)} HIVE
          </p>
          <p className="text-sm text-gray-500 mt-1">
            Need {(requiredHive - hiveBalance).toFixed(2)} more
          </p>
        </div>
        <a
          href="https://jup.ag"
          target="_blank"
          rel="noopener noreferrer"
          className="text-purple-400 hover:text-purple-300 underline"
        >
          Get HIVE on Jupiter
        </a>
      </div>
    );
  }

  return (
    <>
      <LevelRequirementsModal
        isOpen={showLevelRequirements}
        onClose={() => setShowLevelRequirements(false)}
        currentLevel={status.currentLevel}
      />
      {children}
    </>
  );
}
