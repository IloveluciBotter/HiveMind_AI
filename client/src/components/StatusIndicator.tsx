import { useEffect, useState } from "react";
import { subscribeToHealth, HealthResponse, startHealthPolling, stopHealthPolling } from "@/lib/healthApi";
import { Wifi, WifiOff, Bot, Server } from "lucide-react";

interface StatusIndicatorProps {
  compact?: boolean;
}

export function StatusIndicator({ compact = true }: StatusIndicatorProps) {
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    startHealthPolling();
    const unsubscribe = subscribeToHealth(setHealth);
    return () => {
      unsubscribe();
      stopHealthPolling();
    };
  }, []);

  if (!health || !health.services) {
    return (
      <div className="flex items-center gap-1.5 text-gray-500 text-xs">
        <div className="w-2 h-2 rounded-full bg-gray-500 animate-pulse" />
        <span>Checking...</span>
      </div>
    );
  }

  const aiOnline = health.services.ollama?.status === "ok";
  const rpcOnline = health.services.rpc?.status === "ok";

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <div className={`flex items-center gap-1.5 text-xs ${aiOnline ? "text-green-400" : "text-red-400"}`}>
          <Bot className="w-3.5 h-3.5" />
          <span>{aiOnline ? "AI On" : "AI Off"}</span>
        </div>
        <div className={`flex items-center gap-1.5 text-xs ${rpcOnline ? "text-green-400" : "text-red-400"}`}>
          {rpcOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          <span>{rpcOnline ? "RPC On" : "RPC Off"}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
        aiOnline ? "bg-green-900/30 border border-green-700" : "bg-red-900/30 border border-red-700"
      }`}>
        <Bot className="w-4 h-4" />
        <span className="text-sm">{aiOnline ? "AI: Online" : "AI: Offline"}</span>
      </div>
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
        rpcOnline ? "bg-green-900/30 border border-green-700" : "bg-red-900/30 border border-red-700"
      }`}>
        {rpcOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
        <span className="text-sm">{rpcOnline ? "RPC: Online" : "RPC: Offline"}</span>
      </div>
    </div>
  );
}
