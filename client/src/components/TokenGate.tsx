import { Lock, Wallet } from "lucide-react";

interface TokenGateProps {
  connected: boolean;
  hasAccess: boolean;
  hiveBalance: number;
  requiredHive: number;
  onConnect: () => void;
  children: React.ReactNode;
}

export function TokenGate({
  connected,
  hasAccess,
  hiveBalance,
  requiredHive,
  onConnect,
  children,
}: TokenGateProps) {
  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8">
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

  return <>{children}</>;
}
