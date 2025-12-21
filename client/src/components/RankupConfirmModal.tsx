import { useState } from "react";
import { X, AlertTriangle, Coins, ArrowUp } from "lucide-react";

interface RankupConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  currentLevel: number;
  targetLevel: number;
  trialStakeHive: number;
  loading?: boolean;
}

export function RankupConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  currentLevel,
  targetLevel,
  trialStakeHive,
  loading = false,
}: RankupConfirmModalProps) {
  if (!isOpen) return null;

  const [confirmText, setConfirmText] = useState("");
  const isConfirmed = confirmText.trim().toUpperCase() === "CONFIRM";

  const handleConfirm = () => {
    if (isConfirmed) {
      onConfirm();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-md w-full p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Start Rank-Up Trial</h2>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-6">
          <div className="bg-purple-900/30 border border-purple-500/50 rounded-lg p-4 mb-4">
            <div className="flex items-center gap-2">
              <ArrowUp className="w-5 h-5 text-purple-400" />
              <span className="font-semibold text-white">
                Level {currentLevel} → Level {targetLevel}
              </span>
            </div>
          </div>

          <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-4 mb-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-red-400 mb-2">Warning: High Risk</h3>
                <ul className="space-y-2 text-sm text-gray-300">
                  <li className="flex items-start gap-2">
                    <Coins className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
                    <span>
                      This trial costs <span className="font-semibold text-white">{trialStakeHive.toFixed(2)} HIVE</span> from your vault stake.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-400 font-bold">⚠</span>
                    <span>
                      If you <span className="font-semibold text-red-400">FAIL</span>, you lose <span className="font-semibold text-red-400">100%</span> of it.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-400 font-bold">⚠</span>
                    <span>
                      Failing <span className="font-semibold text-red-400">3 times in a row</span> rolls you back <span className="font-semibold text-red-400">1 level</span>.
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-gray-800/50 rounded-lg p-4 mb-4">
            <p className="text-sm text-gray-400 mb-2">
              Type <span className="font-mono font-semibold text-white">CONFIRM</span> to proceed:
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type CONFIRM here"
              disabled={loading}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 disabled:opacity-50"
              autoFocus
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isConfirmed || loading}
            className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Starting...
              </>
            ) : (
              "I Understand - Start Trial"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

