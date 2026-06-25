import { supabase } from "@/lib/supabase";
import type { Attachment, Message } from "@/types";

const EPHEMERAL_WINDOW = 8;
const SUMMARIZE_EVERY = 10;
const CHARS_PER_TOKEN = 4;

export function estimateTokens(input: string): number {
  return Math.max(1, Math.ceil(input.trim().length / CHARS_PER_TOKEN));
}

export function buildMessagesArray(
  messages: Message[],
  nextContent: string,
  attachments: Attachment[] = [],
) {
  const base = messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));

  if (!attachments.length) {
    base.push({ role: "user", content: nextContent });
    return base;
  }

  base.push({
    role: "user",
    content: `${nextContent}\n\nAttachments:\n${attachments.map((item) => `- ${item.name}`).join("\n")}`,
  });
  return base;
}

export function shouldSummarize(messageCount: number): boolean {
  return messageCount > 0 && messageCount % SUMMARIZE_EVERY === 0;
}

export async function buildMessagesWithContext(
  conversationId: string,
  newUserContent: string,
  modelContextWindow: number,
): Promise<{ role: string; content: string }[]> {
  if (!supabase) throw new Error("Supabase not configured");

  // 1. Fetch summaries for this conversation
  const { data: summaries } = await supabase
    .from("conversation_summaries")
    .select("message_start_idx, message_end_idx, summary_text, key_facts")
    .eq("conversation_id", conversationId)
    .order("message_end_idx", { ascending: true });

  // 2. Fetch recent messages (verbatim)
  const { data: recentMessages } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(EPHEMERAL_WINDOW);

  // 3. Build system prompt with summaries
  const systemContext = buildSystemContext(summaries ?? []);

  // 4. Assemble, respecting token budget
  return assembleWithBudget(
    systemContext,
    (recentMessages ?? []).reverse(),
    newUserContent,
    modelContextWindow,
  );
}

function buildSystemContext(
  summaries: { message_start_idx: number; message_end_idx: number; summary_text: string; key_facts: any }[],
) {
  const parts: string[] = [];

  if (summaries.length) {
    parts.push("[Conversation history summaries]");
    for (const s of summaries) {
      parts.push(`Messages ${s.message_start_idx}-${s.message_end_idx}: ${s.summary_text}`);
      const facts = Array.isArray(s.key_facts) ? s.key_facts : [];
      if (facts.length) {
        parts.push(`Key facts: ${facts.join("; ")}`);
      }
    }
  }

  return parts.join("\n\n");
}

function assembleWithBudget(
  systemContext: string,
  recentMessages: { role: string; content: string }[],
  newContent: string,
  budget: number,
) {
  const systemTokens = estimateTokens(systemContext);
  const newTokens = estimateTokens(newContent);
  const recentTokens = recentMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0);

  // Reserve 20% of budget for the model's response
  const usableBudget = Math.floor(budget * 0.8);
  const totalNeeded = systemTokens + recentTokens + newTokens;

  if (totalNeeded > usableBudget && recentMessages.length > 4) {
    // Trim oldest from ephemeral window until we fit
    const trimmed = [...recentMessages];
    while (
      estimateTokens(systemContext) +
        trimmed.reduce((s, m) => s + estimateTokens(m.content), 0) +
        newTokens >
        usableBudget &&
      trimmed.length > 4
    ) {
      trimmed.shift();
    }
    return [
      { role: "system", content: systemContext },
      ...trimmed.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: newContent },
    ];
  }

  return [
    { role: "system", content: systemContext },
    ...recentMessages.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: newContent },
  ];
}
