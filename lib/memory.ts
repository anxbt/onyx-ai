import { supabase } from "@/lib/supabase";
import type { MemoryFact } from "@/types";

function getWorkerUrl() {
  return (process.env.EXPO_PUBLIC_WORKER_URL || "http://localhost:8787").replace(/\/+$/, "");
}

export async function getEmbedding(text: string, accessToken: string): Promise<number[]> {
  const res = await fetch(`${getWorkerUrl()}/embed`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) throw new Error(`Embed failed: ${res.status}`);
  const data = (await res.json()) as { embedding?: number[] };
  return data.embedding ?? [];
}

export async function getMemorySystemPrompt(
  userId: string,
  query: string,
  accessToken: string,
): Promise<string> {
  try {
    const embedding = await getEmbedding(query, accessToken);
    if (!embedding.length) return "";

    const { data: facts, error } = await supabase!.rpc("match_memory_facts", {
      query_embedding: embedding,
      p_user_id: userId,
      match_threshold: 0.72,
      match_count: 8,
    });

    if (error || !facts?.length) return "";

    const factLines = (facts as Array<{ content: string; category: string; similarity: number }>)
      .map((f) => `- [${f.category}] ${f.content}`)
      .join("\n");

    return `You are OnyxAI, a helpful AI assistant. Here is what you know about the user from previous conversations:\n${factLines}\n\nUse this context naturally when it's relevant to the conversation.`;
  } catch {
    return "";
  }
}

export function formatMemoryFacts(facts: MemoryFact[]): string {
  if (!facts.length) return "";

  return facts
    .map((fact) => `- [${fact.category}] ${fact.content} (confidence: ${(fact.confidence * 100).toFixed(0)}%)`)
    .join("\n");
}

export async function extractMemoryFacts(
  conversationId: string,
  accessToken: string,
): Promise<void> {
  fetch(`${getWorkerUrl()}/memory/extract`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ conversationId }),
  }).catch(() => {});
}
