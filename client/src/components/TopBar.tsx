import { ArrowLeft, Wallet, Brain, Coins } from "lucide-react";
import { useLocation } from "wouter";
import { StatusIndicator } from "./StatusIndicator";

interface TopBarProps {
  intelligenceLevel: number;
  walletConnected: boolean;
  publicKey: string | null;
  hiveBalance: number;
  requiredHive: number;
  hasAccess: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  loading?: boolean;
}

export function TopBar({
  intelligenceLevel,
  walletConnected,
  publicKey,
  hiveBalance,
  requiredHive,
  hasAccess,
  onConnect,
  onDisconnect,
  loading,
}: TopBarProps) {
  const [location, setLocation] = useLocation();
  const showBack = location !== "/";

  const shortAddress = publicKey
    ? `${publicKey.slice(0, 4)}...${publicKey.slice(-4)}`
    : "";

  return (
    <header className="bg-gray-900 border-b border-gray-800 px-4 py-3 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {showBack && (
            <button
              onClick={() => setLocation("/")}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              title="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <h1
            className="text-xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent cursor-pointer"
            onClick={() => setLocation("/")}
          >
            HiveMind
          </h1>
        </div>

        <div className="flex items-center gap-4">
          <StatusIndicator compact />
          
          <div className="flex items-center gap-2 bg-gray-800 px-3 py-1.5 rounded-lg">
            <Brain className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-medium">
              Level <span className="text-purple-400">{intelligenceLevel}</span>
            </span>
          </div>

          {walletConnected && (
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                hasAccess
                  ? "bg-green-900/30 border border-green-700"
                  : "bg-red-900/30 border border-red-700"
              }`}
            >
              <Coins className="w-4 h-4" />
              <span className="text-sm">
                {hiveBalance.toFixed(1)} HIVE
                {!hasAccess && (
                  <span className="text-red-400 ml-1">
                    (Need {requiredHive}+)
                  </span>
                )}
              </span>
            </div>
          )}

          <button
            onClick={walletConnected ? onDisconnect : onConnect}
            disabled={loading}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              walletConnected
                ? "bg-gray-700 hover:bg-gray-600"
                : "bg-purple-600 hover:bg-purple-700"
            }`}
          >
            <Wallet className="w-4 h-4" />
            {loading
              ? "Connecting..."
              : walletConnected
              ? shortAddress
              : "Connect Wallet"}
          </button>
        </div>
      </div>
    </header>
  );
}
