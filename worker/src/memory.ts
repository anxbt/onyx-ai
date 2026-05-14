import type { Context } from "hono";
import { OpenRouter } from "@openrouter/sdk";
import type { HonoEnv } from "./index";
import { supabaseAdminKey, supabaseUrl } from "./env";

const EXTRACTION_MODEL = "google/gemini-2.5-flash-lite";
const EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2";

function restHeaders(env: HonoEnv["Bindings"]) {
  const key = supabaseAdminKey(env) ?? "";
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  } as Record<string, string>;
}

async function getEmbedding(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://onyxai.app",
      "X-Title": "OnyxAI",
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
  });

  if (!res.ok) return [];
  const data = (await res.json()) as { data?: Array<{ embedding: number[] }> };
  return data.data?.[0]?.embedding ?? [];
}

export async function handleMemoryExtract(c: Context<HonoEnv>) {
  try {
    const env = c.env;
    const userId = c.get("userId");

    if (!env.OPENROUTER_API_KEY) {
      return c.json({ error: "missing_openrouter_api_key" }, 501);
    }

    const baseUrl = supabaseUrl(env);
    if (!baseUrl) {
      return c.json({ error: "missing_supabase_url" }, 500);
    }

    const body = await c.req.json().catch(() => null) as {
      conversationId?: string;
      messages?: Array<{ role: string; content: string }>;
    } | null;

    const messages = body?.messages;
    if (!messages?.length) {
      // Fallback: fetch recent messages from DB
      const res = await fetch(
        `${baseUrl}/rest/v1/messages?user_id=eq.${encodeURIComponent(userId)}&select=role,content&order=created_at.desc&limit=40`,
        { headers: restHeaders(env) },
      );

      if (!res.ok) {
        return c.json({ error: "fetch_messages_failed", status: res.status }, 500);
      }

      const dbMessages = (await res.json()) as Array<{ role: string; content: string }>;
      if (!dbMessages.length) {
        return c.json({ ok: true, extracted: 0, note: "no_messages" });
      }

      const client = new OpenRouter({ apiKey: env.OPENROUTER_API_KEY });
      const completion = await client.chat.send({
        chatRequest: {
          model: EXTRACTION_MODEL,
          messages: [
            {
              role: "user",
              content:
                "Extract up to 5 personal facts about the user from these messages. " +
                "Only include facts the user explicitly stated about themselves. " +
                'Each fact must have a category: "learning", "preference", "project", or "personal". ' +
                "Estimate confidence from 0 to 1. Respond in this exact JSON format (no markdown code fences):\n" +
                '[{"content":"...","category":"preference","confidence":0.9}]\n\n' +
                "If no personal facts found, return [].\n\n" +
                dbMessages.map((m) => `${m.role}: ${m.content}`).join("\n\n"),
            },
          ],
          stream: false,
        },
      });

      const raw = completion.choices[0]?.message?.content ?? "";
      let facts: Array<{ content: string; category: string; confidence: number }> = [];

      try {
        const cleaned = raw.replace(/```json\s*|\s*```/g, "").trim();
        facts = JSON.parse(cleaned);
        if (!Array.isArray(facts)) facts = [];
      } catch {
        return c.json({ ok: true, extracted: 0, note: "parse_failed", raw: raw.slice(0, 200) });
      }

      let inserted = 0;
      for (const fact of facts) {
        if (!fact.content || !fact.category) continue;
        const validCategories = ["learning", "preference", "project", "personal"];
        if (!validCategories.includes(fact.category)) continue;

        try {
          const embedding = await getEmbedding(fact.content, env.OPENROUTER_API_KEY);

          const insertRes = await fetch(`${baseUrl}/rest/v1/memory_facts`, {
            method: "POST",
            headers: { ...restHeaders(env), Prefer: "resolution=ignore-duplicates" },
            body: JSON.stringify({
              user_id: userId,
              content: fact.content,
              category: fact.category,
              embedding,
              confidence: Math.min(1, Math.max(0, fact.confidence ?? 1)),
              source_conversation_id: body?.conversationId ?? null,
            }),
          });

          // 409 = duplicate ignored (UNIQUE constraint)
          if (insertRes.ok || insertRes.status === 409) {
            inserted++;
          }
        } catch {
          // skip individual insert failures
        }
      }

      return c.json({ ok: true, extracted: inserted });
    }

    // Client-provided messages path
    const client = new OpenRouter({ apiKey: env.OPENROUTER_API_KEY });
    const completion = await client.chat.send({
      chatRequest: {
        model: EXTRACTION_MODEL,
        messages: [
          {
            role: "user",
            content:
              "Extract up to 5 personal facts about the user from these messages. " +
              "Only include facts the user explicitly stated. " +
              'Output JSON: [{"content":"...","category":"learning|preference|project|personal","confidence":0.9}]\n\n' +
              messages.map((m) => `${m.role}: ${m.content}`).join("\n\n"),
          },
        ],
        stream: false,
      },
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    let facts: Array<{ content: string; category: string; confidence: number }> = [];
    try {
      const cleaned = raw.replace(/```json\s*|\s*```/g, "").trim();
      facts = JSON.parse(cleaned);
      if (!Array.isArray(facts)) facts = [];
    } catch {
      return c.json({ ok: true, extracted: 0 });
    }

    let inserted = 0;
    for (const fact of facts) {
      if (!fact.content || !fact.category) continue;
      const validCategories = ["learning", "preference", "project", "personal"];
      if (!validCategories.includes(fact.category)) continue;

      try {
        const embedding = await getEmbedding(fact.content, env.OPENROUTER_API_KEY);
        const insertRes = await fetch(`${baseUrl}/rest/v1/memory_facts`, {
          method: "POST",
          headers: { ...restHeaders(env), Prefer: "resolution=ignore-duplicates" },
          body: JSON.stringify({
            user_id: userId,
            content: fact.content,
            category: fact.category,
            embedding,
            confidence: Math.min(1, Math.max(0, fact.confidence ?? 1)),
            source_conversation_id: body?.conversationId ?? null,
          }),
        });
        if (insertRes.ok || insertRes.status === 409) inserted++;
      } catch {
        // skip individual failures
      }
    }

    return c.json({ ok: true, extracted: inserted });
  } catch (err: unknown) {
    return c.json({ error: "extract_error", detail: String(err) }, 500);
  }
}
