import type { Context } from "hono";
import type { HonoEnv } from "./index";

export async function handleMemoryExtract(c: Context<HonoEnv>) {
  const env = c.env;
  const userId = c.get("userId");

  if (!env.OPENAI_API_KEY || !env.OPENROUTER_API_KEY) {
    return c.json(
      {
        error: "missing_memory_env",
        note: "OPENAI_API_KEY and OPENROUTER_API_KEY are both required for extraction + embeddings.",
        userId,
      },
      501,
    );
  }

  return c.json({
    ok: true,
    route: "/memory/extract",
    note: "Memory extraction contract is scaffolded for the next checkpoint.",
  });
}
