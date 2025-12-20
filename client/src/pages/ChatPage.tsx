import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { Send, Bot, User, AlertCircle, History, ChevronDown, ChevronUp, BookOpen } from "lucide-react";

interface ChatPageProps {
  intelligenceLevel: number;
}

interface Source {
  chunkText: string;
  score: number;
  title: string | null;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  sources?: Source[];
  isGrounded?: boolean;
}

export function ChatPage({ intelligenceLevel }: ChatPageProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Message[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [ollamaStatus, setOllamaStatus] = useState<{
    ok: boolean;
    error?: string;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const toggleSources = (messageId: string) => {
    setExpandedSources(prev => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  useEffect(() => {
    api.health.ollamaCheck().then(setOllamaStatus).catch(() => {
      setOllamaStatus({ ok: false, error: "Failed to check AI status" });
    });

    api.chat.getHistory(20).then((data) => {
      const formatted = data.flatMap((m) => [
        { id: `${m.id}-user`, role: "user" as const, content: m.userMessage, timestamp: m.createdAt },
        { id: `${m.id}-ai`, role: "assistant" as const, content: m.aiResponse, timestamp: m.createdAt },
      ]);
      setHistory(formatted);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const response = await api.chat.send(input.trim(), intelligenceLevel);
      const aiMessage: Message = {
        id: response.id,
        role: "assistant",
        content: response.response,
        sources: response.sources || [],
        isGrounded: response.isGrounded,
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (err: any) {
      setError(err.message || "Failed to get response");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex h-[calc(100vh-140px)] max-w-6xl mx-auto">
      {showHistory && (
        <div className="w-80 bg-gray-900 border-r border-gray-800 p-4 overflow-y-auto">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <History className="w-4 h-4" />
            Chat History
          </h3>
          {history.length === 0 ? (
            <p className="text-sm text-gray-400">No history yet</p>
          ) : (
            <div className="space-y-2">
              {history.filter(m => m.role === "user").slice(0, 10).map((m) => (
                <div
                  key={m.id}
                  className="p-2 bg-gray-800 rounded text-sm truncate cursor-pointer hover:bg-gray-700"
                  title={m.content}
                >
                  {m.content}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="bg-purple-900/50 rounded-full p-2">
              <Bot className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h2 className="font-semibold">HiveMind AI</h2>
              <p className="text-sm text-gray-400">
                Intelligence Level: {intelligenceLevel}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`p-2 rounded-lg transition-colors ${
                showHistory ? "bg-purple-600" : "bg-gray-800 hover:bg-gray-700"
              }`}
            >
              <History className="w-5 h-5" />
            </button>
            <div
              className={`w-3 h-3 rounded-full ${
                ollamaStatus?.ok ? "bg-green-500" : "bg-red-500"
              }`}
              title={ollamaStatus?.ok ? "AI Online" : ollamaStatus?.error || "AI Offline"}
            />
          </div>
        </div>

        {!ollamaStatus?.ok && (
          <div className="bg-red-900/30 border border-red-800 mx-4 mt-4 p-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <p className="text-sm text-red-300">
              {ollamaStatus?.error || "Official AI is currently offline. Please try again later."}
            </p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-400 py-12">
              <Bot className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>Start a conversation with HiveMind AI</p>
              <p className="text-sm mt-2">
                The AI's responses vary based on its intelligence level
              </p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${
                message.role === "user" ? "flex-row-reverse" : ""
              }`}
            >
              <div
                className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  message.role === "user"
                    ? "bg-blue-600"
                    : "bg-purple-600"
                }`}
              >
                {message.role === "user" ? (
                  <User className="w-4 h-4" />
                ) : (
                  <Bot className="w-4 h-4" />
                )}
              </div>
              <div className="max-w-[70%]">
                <div
                  className={`rounded-xl p-4 ${
                    message.role === "user"
                      ? "bg-blue-600"
                      : "bg-gray-800"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
                
                {message.role === "assistant" && message.sources && message.sources.length > 0 && (
                  <div className="mt-2">
                    <button
                      onClick={() => toggleSources(message.id)}
                      className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-300 transition-colors"
                    >
                      <BookOpen className="w-3 h-3" />
                      <span>{message.sources.length} source{message.sources.length > 1 ? "s" : ""}</span>
                      {expandedSources.has(message.id) ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>
                    
                    {expandedSources.has(message.id) && (
                      <div className="mt-2 space-y-2">
                        {message.sources.map((source, idx) => (
                          <div
                            key={idx}
                            className="bg-gray-900 border border-gray-700 rounded-lg p-3 text-sm"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-purple-400 font-medium">
                                {source.title || `Source ${idx + 1}`}
                              </span>
                              <span className="text-xs text-gray-500">
                                {Math.round(source.score * 100)}% match
                              </span>
                            </div>
                            <p className="text-gray-400 text-xs">{source.chunkText}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                
                {message.role === "assistant" && message.isGrounded === false && (
                  <div className="mt-1 text-xs text-yellow-500 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Ungrounded response
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-gray-800 rounded-xl p-4">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-900/30 border border-red-800 p-3 rounded-lg">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t border-gray-800">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
              disabled={loading || !ollamaStatus?.ok}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 focus:outline-none focus:border-purple-500 disabled:opacity-50"
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim() || !ollamaStatus?.ok}
              className="px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
