import type { MemoryFact } from "@/types";

const MEMORY_SYSTEM_PREFIX =
  "You are OnyxAI, a helpful AI assistant. Here is what you know about the user from previous conversations:";

export function getMemorySystemPrompt(facts: MemoryFact[]) {
  if (!facts.length) {
    return "";
  }

  const factLines = facts.map((fact) => `- [${fact.category}] ${fact.content}`).join("\n");
  return `${MEMORY_SYSTEM_PREFIX}\n${factLines}\n\nUse this context naturally.`;
}

