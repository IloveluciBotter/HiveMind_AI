import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Search, Database, FileText, CheckCircle2, Clock, XCircle } from "lucide-react";

interface CorpusItem {
  id: string;
  trackId: string | null;
  cycleId: string | null;
  title: string | null;
  normalizedText: string;
  status: "draft" | "approved" | "rejected";
  createdByWallet: string | null;
  approvedAt: string | null;
  createdAt: string;
}

interface CorpusPageProps {
  authenticated: boolean;
  hasAccess: boolean;
}

export function CorpusPage({ authenticated, hasAccess }: CorpusPageProps) {
  const [items, setItems] = useState<CorpusItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState<{
    totalItems: number;
    itemsThisCycle: number;
    currentCycleNumber: number | null;
  } | null>(null);

  const canAccess = authenticated && hasAccess;

  useEffect(() => {
    if (!canAccess) {
      setLoading(false);
      return;
    }

    loadCorpus();
    loadStats();
  }, [canAccess, page]);

  const loadCorpus = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.corpus.getAll({
        search: search || undefined,
        page,
        limit: 20,
      });
      setItems(result.items);
      setTotalPages(result.pagination.totalPages);
    } catch (err: any) {
      setError(err.message || "Failed to load corpus");
    }
    setLoading(false);
  };

  const loadStats = async () => {
    try {
      const result = await api.corpus.getStats();
      setStats(result);
    } catch {}
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadCorpus();
  };

  if (!canAccess) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center py-12">
          <Database className="w-16 h-16 mx-auto mb-4 text-gray-600" />
          <h2 className="text-2xl font-bold mb-2">Training Corpus</h2>
          <p className="text-gray-400 mb-6">
            {!authenticated
              ? "Connect your wallet to view the HiveMind training corpus."
              : "You need at least 50 HIVE tokens to access the corpus."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Training Corpus</h1>
          <p className="text-gray-400 text-sm">
            The knowledge base that powers HiveMind AI
          </p>
        </div>
        {stats && (
          <div className="text-right">
            <p className="text-2xl font-bold text-purple-400">
              {stats.totalItems}
            </p>
            <p className="text-sm text-gray-400">Total Items</p>
          </div>
        )}
      </div>

      <form onSubmit={handleSearch} className="mb-6">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search corpus..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:border-purple-500"
            />
          </div>
          <button
            type="submit"
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition-colors"
          >
            Search
          </button>
        </div>
      </form>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : error ? (
        <div className="bg-red-900/30 border border-red-800 p-4 rounded-lg text-red-300">
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="w-12 h-12 mx-auto mb-4 text-gray-600" />
          <p className="text-gray-400">No corpus items found</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="bg-gray-800 rounded-lg p-4 border border-gray-700"
              >
                <div className="flex items-start justify-between gap-4 mb-2">
                  {item.title && (
                    <h3 className="font-medium text-purple-400">{item.title}</h3>
                  )}
                  <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs shrink-0 ${
                    item.status === "approved" 
                      ? "bg-green-900/50 text-green-400"
                      : item.status === "rejected"
                      ? "bg-red-900/50 text-red-400"
                      : "bg-yellow-900/50 text-yellow-400"
                  }`}>
                    {item.status === "approved" && <CheckCircle2 className="w-3 h-3" />}
                    {item.status === "rejected" && <XCircle className="w-3 h-3" />}
                    {item.status === "draft" && <Clock className="w-3 h-3" />}
                    <span className="capitalize">{item.status}</span>
                  </div>
                </div>
                <p className="text-gray-200 text-sm">{item.normalizedText.slice(0, 300)}{item.normalizedText.length > 300 ? "..." : ""}</p>
                <div className="flex gap-4 mt-2 text-xs text-gray-500">
                  {item.trackId && <span>Track: {item.trackId.slice(0, 8)}...</span>}
                  <span>
                    Added: {new Date(item.createdAt).toLocaleDateString()}
                  </span>
                  {item.approvedAt && (
                    <span className="text-green-500">
                      Approved: {new Date(item.approvedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg"
              >
                Previous
              </button>
              <span className="px-4 py-2 text-gray-400">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
