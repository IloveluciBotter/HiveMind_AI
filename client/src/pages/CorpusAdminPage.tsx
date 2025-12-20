import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Plus, Trash2, Edit2, Save, X, Shield, RotateCw, AlertCircle, CheckCircle2, Loader2, Clock, Zap } from "lucide-react";

type EmbedStatus = "not_embedded" | "queued" | "embedding" | "embedded" | "failed";

interface CorpusItem {
  id: string;
  trackId: string | null;
  cycleId: string | null;
  normalizedText: string;
  status: "draft" | "approved" | "rejected";
  embedStatus: EmbedStatus;
  embedError: string | null;
  embedAttempts: number;
  createdAt: string;
}

interface Track {
  id: string;
  name: string;
}

interface CorpusAdminPageProps {
  isCreator: boolean;
}

export function CorpusAdminPage({ isCreator }: CorpusAdminPageProps) {
  const [items, setItems] = useState<CorpusItem[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newText, setNewText] = useState("");
  const [newTrackId, setNewTrackId] = useState("");
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const getEmbedStatusBadge = (item: CorpusItem) => {
    const { embedStatus, embedError, embedAttempts } = item;
    
    switch (embedStatus) {
      case "embedded":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-900/30 text-green-400 text-xs rounded-full border border-green-800">
            <CheckCircle2 className="w-3 h-3" />
            Embedded
          </span>
        );
      case "queued":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-900/30 text-blue-400 text-xs rounded-full border border-blue-800">
            <Clock className="w-3 h-3" />
            Queued
          </span>
        );
      case "embedding":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-900/30 text-purple-400 text-xs rounded-full border border-purple-800">
            <Loader2 className="w-3 h-3 animate-spin" />
            Embedding...
          </span>
        );
      case "failed":
        return (
          <span 
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-900/30 text-red-400 text-xs rounded-full border border-red-800 cursor-help"
            title={embedError || `Failed after ${embedAttempts} attempts`}
          >
            <AlertCircle className="w-3 h-3" />
            Failed ({embedAttempts})
          </span>
        );
      case "not_embedded":
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-700/30 text-gray-400 text-xs rounded-full border border-gray-600">
            <X className="w-3 h-3" />
            Not Embedded
          </span>
        );
    }
  };

  const handleRetryEmbed = async (id: string) => {
    setRetryingId(id);
    setError(null);
    try {
      await api.corpus.retryEmbed(id);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to retry embedding");
    }
    setRetryingId(null);
  };

  const handleForceReembed = async (id: string) => {
    setRetryingId(id);
    setError(null);
    try {
      await api.corpus.forceReembed(id);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to force re-embed");
    }
    setRetryingId(null);
  };

  useEffect(() => {
    if (!isCreator) {
      setLoading(false);
      return;
    }
    loadData();
  }, [isCreator]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [corpusResult, tracksResult] = await Promise.all([
        api.corpus.getAll({ limit: 100 }),
        api.tracks.getAll(),
      ]);
      setItems(corpusResult.items);
      setTracks(tracksResult);
      if (tracksResult.length > 0 && !newTrackId) {
        setNewTrackId(tracksResult[0].id);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load data");
    }
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!newText.trim() || !newTrackId) return;
    setAdding(true);
    setError(null);
    try {
      await api.corpus.create(newTrackId, newText.trim());
      setNewText("");
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to add item");
    }
    setAdding(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this corpus item?")) return;
    try {
      await api.corpus.delete(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err: any) {
      setError(err.message || "Failed to delete item");
    }
  };

  const handleEdit = (item: CorpusItem) => {
    setEditingId(item.id);
    setEditText(item.normalizedText);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editText.trim()) return;
    try {
      await api.corpus.update(editingId, { text: editText.trim() });
      setItems((prev) =>
        prev.map((i) =>
          i.id === editingId ? { ...i, normalizedText: editText.trim() } : i
        )
      );
      setEditingId(null);
      setEditText("");
    } catch (err: any) {
      setError(err.message || "Failed to update item");
    }
  };

  if (!isCreator) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center py-12">
          <Shield className="w-16 h-16 mx-auto mb-4 text-gray-600" />
          <h2 className="text-2xl font-bold mb-2">Creator Access Only</h2>
          <p className="text-gray-400">
            This page is restricted to the HiveMind creator.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <Shield className="w-6 h-6 text-purple-400" />
        <h1 className="text-2xl font-bold">Corpus Admin</h1>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 p-3 rounded-lg mb-4 text-red-300">
          {error}
        </div>
      )}

      <div className="bg-gray-800 rounded-xl p-4 mb-6 border border-gray-700">
        <h3 className="font-medium mb-3">Add New Corpus Item</h3>
        <div className="space-y-3">
          <select
            value={newTrackId}
            onChange={(e) => setNewTrackId(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2"
          >
            {tracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.name}
              </option>
            ))}
          </select>
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Enter corpus text..."
            rows={3}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 resize-none"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newText.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg"
          >
            <Plus className="w-4 h-4" />
            {adding ? "Adding..." : "Add Item"}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            No corpus items yet. Add some above!
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="bg-gray-800 rounded-lg p-4 border border-gray-700"
            >
              {editingId === item.id ? (
                <div className="space-y-3">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={3}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveEdit}
                      className="flex items-center gap-1 px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm"
                    >
                      <Save className="w-4 h-4" />
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="flex items-center gap-1 px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-sm"
                    >
                      <X className="w-4 h-4" />
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <p className="text-gray-200 flex-1">{item.normalizedText}</p>
                    {getEmbedStatusBadge(item)}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </span>
                      {item.status === "approved" && (
                        <span className="text-xs px-2 py-0.5 bg-green-900/30 text-green-400 rounded border border-green-800">
                          Approved
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {item.embedStatus === "failed" && (
                        <button
                          onClick={() => handleRetryEmbed(item.id)}
                          disabled={retryingId === item.id}
                          className="p-2 hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
                          title="Retry Embedding"
                        >
                          {retryingId === item.id ? (
                            <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                          ) : (
                            <RotateCw className="w-4 h-4 text-blue-400" />
                          )}
                        </button>
                      )}
                      {item.embedStatus === "embedded" && (
                        <button
                          onClick={() => handleForceReembed(item.id)}
                          disabled={retryingId === item.id}
                          className="p-2 hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
                          title="Force Re-embed"
                        >
                          {retryingId === item.id ? (
                            <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                          ) : (
                            <Zap className="w-4 h-4 text-purple-400" />
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => handleEdit(item)}
                        className="p-2 hover:bg-gray-700 rounded transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4 text-gray-400" />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-2 hover:bg-gray-700 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
