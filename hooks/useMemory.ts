import { useState } from "react";

import type { MemoryFact } from "@/types";

const factsSeed: MemoryFact[] = [
  {
    id: "fact-1",
    category: "project",
    content: "The user is building OnyxAI as a mobile-first Expo app with Supabase and Cloudflare Workers.",
    confidence: 0.98,
    updatedAt: "Today",
  },
  {
    id: "fact-2",
    category: "preference",
    content: "The user prefers clear checkpoints before major implementation steps.",
    confidence: 0.95,
    updatedAt: "Today",
  },
];

export function useMemory() {
  const [facts, setFacts] = useState(factsSeed);

  function deleteFact(factId: string) {
    setFacts((current) => current.filter((fact) => fact.id !== factId));
  }

  function clearAll() {
    setFacts([]);
  }

  return {
    facts,
    deleteFact,
    clearAll,
  };
}

