type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function lmstudioChat(
  messages: ChatMessage[],
  opts?: { temperature?: number; max_tokens?: number }
) {
  // TEST MODE: Return deterministic response in test environment
  // This is guarded by NODE_ENV check to prevent use in production
  if (process.env.NODE_ENV === "test" && process.env.TEST_MODE === "true") {
    return "Test response from mocked AI service";
  }

  const base = process.env.LMSTUDIO_BASE_URL;
  const model = process.env.LMSTUDIO_MODEL;
  if (!base || !model) throw new Error("Missing LMSTUDIO_BASE_URL or LMSTUDIO_MODEL");

  const r = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts?.temperature ?? 0.4,
      max_tokens: opts?.max_tokens ?? 800,
    }),
  });

  if (!r.ok) throw new Error(`LM Studio HTTP ${r.status}: ${await r.text()}`);
  const j: any = await r.json();
  return j?.choices?.[0]?.message?.content ?? "";
}


