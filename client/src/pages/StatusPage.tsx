import { useEffect, useState } from "react";
import { fetchHealth, HealthResponse } from "@/lib/healthApi";
import { RefreshCw, CheckCircle, XCircle, Clock, Bot, Wifi, Database } from "lucide-react";

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatTime(timestamp: number): string {
  if (!timestamp) return "Never";
  return new Date(timestamp).toLocaleTimeString();
}

interface ServiceCardProps {
  name: string;
  icon: React.ReactNode;
  status: "ok" | "down";
  latencyMs?: number;
  error?: string;
  baseUrl?: string;
}

function ServiceCard({ name, icon, status, latencyMs, error, baseUrl }: ServiceCardProps) {
  const isOk = status === "ok";
  return (
    <div className={`rounded-lg border p-4 ${isOk ? "border-green-700 bg-green-900/20" : "border-red-700 bg-red-900/20"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isOk ? "bg-green-800" : "bg-red-800"}`}>
            {icon}
          </div>
          <div>
            <h3 className="font-medium">{name}</h3>
            {baseUrl && <p className="text-xs text-gray-400 truncate max-w-[200px]">{baseUrl}</p>}
          </div>
        </div>
        <div className="text-right">
          <div className={`flex items-center gap-1.5 ${isOk ? "text-green-400" : "text-red-400"}`}>
            {isOk ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
            <span className="font-medium">{isOk ? "Online" : "Offline"}</span>
          </div>
          {latencyMs !== undefined && (
            <p className="text-xs text-gray-400">{latencyMs}ms</p>
          )}
          {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
        </div>
      </div>
    </div>
  );
}

export default function StatusPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastCheck, setLastCheck] = useState<number>(0);
  const [refreshing, setRefreshing] = useState(false);

  const loadHealth = async () => {
    setRefreshing(true);
    const data = await fetchHealth();
    setHealth(data);
    setLastCheck(Date.now());
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    loadHealth();
    const interval = setInterval(loadHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500" />
      </div>
    );
  }

  const overallStatus = health?.status || "down";
  const statusColor = overallStatus === "ok" ? "text-green-400" : overallStatus === "degraded" ? "text-yellow-400" : "text-red-400";
  const statusBg = overallStatus === "ok" ? "bg-green-900/30" : overallStatus === "degraded" ? "bg-yellow-900/30" : "bg-red-900/30";

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">System Status</h1>
            <p className="text-gray-400">HiveMind infrastructure health</p>
          </div>
          <button 
            onClick={loadHealth} 
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-700 hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <div className={`rounded-lg border-2 p-6 mb-8 ${statusBg}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-4 h-4 rounded-full ${
                overallStatus === "ok" ? "bg-green-400" : 
                overallStatus === "degraded" ? "bg-yellow-400 animate-pulse" : 
                "bg-red-400 animate-pulse"
              }`} />
              <div>
                <h2 className={`text-2xl font-bold ${statusColor}`}>
                  {overallStatus === "ok" ? "All Systems Operational" :
                   overallStatus === "degraded" ? "Partial Outage" :
                   "Major Outage"}
                </h2>
                <p className="text-gray-400">Version: {health?.version || "Unknown"}</p>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2 text-gray-400">
                <Clock className="w-4 h-4" />
                <span>Uptime: {health ? formatUptime(health.uptimeSec) : "N/A"}</span>
              </div>
              <p className="text-sm text-gray-500">
                Last check: {formatTime(lastCheck)}
              </p>
            </div>
          </div>
        </div>

        <h3 className="text-xl font-semibold mb-4">Services</h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <ServiceCard
            name="Database"
            icon={<Database className="w-5 h-5 text-white" />}
            status={health?.services.db.status || "down"}
            latencyMs={health?.services.db.latencyMs}
            error={health?.services.db.error}
          />
          <ServiceCard
            name="AI (Ollama)"
            icon={<Bot className="w-5 h-5 text-white" />}
            status={health?.services.ollama.status || "down"}
            latencyMs={health?.services.ollama.latencyMs}
            baseUrl={health?.services.ollama.baseUrl}
            error={health?.services.ollama.error}
          />
          <ServiceCard
            name="Solana RPC"
            icon={<Wifi className="w-5 h-5 text-white" />}
            status={health?.services.rpc.status || "down"}
            latencyMs={health?.services.rpc.latencyMs}
            error={health?.services.rpc.error}
          />
        </div>

        {health?.requestId && (
          <p className="text-xs text-gray-600 mt-8 text-center">
            Request ID: {health.requestId}
          </p>
        )}
      </div>
    </div>
  );
}
