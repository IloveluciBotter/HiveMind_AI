export interface ServiceStatus {
  status: "ok" | "down";
  latencyMs?: number;
  error?: string;
  baseUrl?: string;
}

export interface HealthResponse {
  status: "ok" | "degraded" | "down";
  timestamp: string;
  version: string;
  uptimeSec: number;
  services: {
    db: ServiceStatus;
    ollama: ServiceStatus;
    rpc: ServiceStatus;
  };
  requestId?: string;
}

let lastHealthData: HealthResponse | null = null;
let lastCheckTime: number = 0;
let isPolling = false;
let pollInterval: number | null = null;
let backoffMs = 30000;
const MIN_POLL_MS = 30000;
const MAX_POLL_MS = 120000;

const listeners: Set<(health: HealthResponse | null) => void> = new Set();

export function subscribeToHealth(callback: (health: HealthResponse | null) => void): () => void {
  listeners.add(callback);
  if (lastHealthData) {
    callback(lastHealthData);
  }
  return () => listeners.delete(callback);
}

function notifyListeners(health: HealthResponse | null) {
  listeners.forEach(cb => cb(health));
}

export async function fetchHealth(): Promise<HealthResponse | null> {
  try {
    const res = await fetch("/api/health");
    if (!res.ok && res.status !== 503) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    lastHealthData = data;
    lastCheckTime = Date.now();
    backoffMs = MIN_POLL_MS;
    notifyListeners(data);
    return data;
  } catch (error) {
    console.error("[Health] Fetch failed:", error);
    backoffMs = Math.min(backoffMs * 1.5, MAX_POLL_MS);
    notifyListeners(null);
    return null;
  }
}

export function startHealthPolling() {
  if (isPolling) return;
  isPolling = true;
  
  const poll = async () => {
    await fetchHealth();
    if (isPolling) {
      pollInterval = window.setTimeout(poll, backoffMs);
    }
  };
  
  poll();
}

export function stopHealthPolling() {
  isPolling = false;
  if (pollInterval) {
    clearTimeout(pollInterval);
    pollInterval = null;
  }
}

export function getLastHealth(): HealthResponse | null {
  return lastHealthData;
}

export function getLastCheckTime(): number {
  return lastCheckTime;
}
