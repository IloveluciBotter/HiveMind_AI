import { useState, useEffect } from "react";
import { X, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";

interface LevelRequirementsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLevel?: number | null;
}

interface LevelRequirement {
  level: number;
  walletHold: number;
  vaultStake: number;
}

export function LevelRequirementsModal({ isOpen, onClose, currentLevel = 1 }: LevelRequirementsModalProps) {
  const [requirements, setRequirements] = useState<LevelRequirement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const loadRequirements = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Load requirements for levels 1-20, then every 10 levels up to 100
        const levelsToLoad: number[] = [];
        
        // Levels 1-20
        for (let i = 1; i <= 20; i++) {
          levelsToLoad.push(i);
        }
        
        // Then every 10 levels up to 100
        for (let i = 30; i <= 100; i += 10) {
          levelsToLoad.push(i);
        }

        const results = await Promise.all(
          levelsToLoad.map(async (level) => {
            try {
              const response = await api.progression.getRequirements(level);
              if (response.ok) {
                return response.requirements;
              }
              return null;
            } catch (err) {
              console.error(`Failed to load requirements for level ${level}:`, err);
              return null;
            }
          })
        );

        const validRequirements = results.filter((r): r is LevelRequirement => r !== null);
        setRequirements(validRequirements);
      } catch (err: any) {
        setError(err.message || "Failed to load level requirements");
      } finally {
        setLoading(false);
      }
    };

    loadRequirements();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-800 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-purple-400" />
              Level Requirements
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              Requirements for wallet hold and vault stake at each level
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500" />
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-400 mb-4">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Table Header */}
              <div className="grid grid-cols-3 gap-4 pb-2 border-b border-gray-800 font-semibold text-sm text-gray-400">
                <div>Level</div>
                <div>Wallet Hold (HIVE)</div>
                <div>Vault Stake (HIVE)</div>
              </div>

              {/* Requirements List */}
              <div className="space-y-2">
                {requirements.map((req) => {
                  const isCurrentLevel = currentLevel !== null && req.level === currentLevel;
                  return (
                    <div
                      key={req.level}
                      className={`grid grid-cols-3 gap-4 p-3 rounded-lg transition-colors ${
                        isCurrentLevel
                          ? "bg-purple-900/30 border border-purple-700/50"
                          : "bg-gray-800/30 hover:bg-gray-800/50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold ${isCurrentLevel ? "text-purple-400" : "text-white"}`}>
                          Level {req.level}
                        </span>
                        {isCurrentLevel && (
                          <span className="text-xs bg-purple-600 px-2 py-0.5 rounded text-white">
                            Current
                          </span>
                        )}
                      </div>
                      <div className="text-gray-300">{req.walletHold.toFixed(2)}</div>
                      <div className="text-gray-300">{req.vaultStake.toFixed(2)}</div>
                    </div>
                  );
                })}
              </div>

              {/* Info Note */}
              <div className="mt-6 bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                <p className="text-sm text-gray-400">
                  <span className="font-semibold text-white">Note:</span> Requirements scale with level. 
                  Wallet hold increases linearly, while vault stake increases quadratically. 
                  Higher levels require more commitment but offer greater impact in the shared learning system.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

