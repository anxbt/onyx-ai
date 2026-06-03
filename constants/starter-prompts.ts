// Curated starter prompts for the new-chat empty state. Tuned for the
// BTech-student audience but kept generic enough to also work for casual
// users.
//
// The component samples 3 of these per render (rotation = variety on every
// new chat). Keep entries short — they render as chips in the input area
// and shouldn't wrap to more than two lines on a typical phone.

export const STARTER_PROMPTS: readonly string[] = [
  "Explain a hash table in 60 seconds",
  "Help me debug this code",
  "Compare two algorithms",
  "Draft a project proposal",
  "Summarize this paper",
  "Walk me through dynamic programming",
  "What should I focus on for GATE?",
  "Translate this to plain English",
  "Plan a weekend study schedule",
  "Brainstorm side-project ideas",
];

// Pick `count` prompts pseudo-randomly. We don't seed — variety on every
// mount is the point.
export function pickStarterPrompts(count: number = 3): string[] {
  const pool = [...STARTER_PROMPTS];
  const picked: string[] = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}
