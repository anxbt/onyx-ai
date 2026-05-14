import type { Context } from "hono";
import { OpenRouter } from "@openrouter/sdk";
import type { HonoEnv } from "./index";
import { supabaseAdminKey, supabaseUrl } from "./env";
import { matchMemoryFacts } from "./supabase";

const TAVILY_URL = "https://api.tavily.com/search";
const TOPIC_EXTRACTION_MODEL = "google/gemini-2.5-flash-lite";
const EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2";

function restHeaders(env: HonoEnv["Bindings"]) {
  const key = supabaseAdminKey(env) ?? "";
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  } as Record<string, string>;
}

async function getEmbedding(text: string, apiKey: string): Promise<number[]> {
  try {
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
  } catch {
    return [];
  }
}

async function extractTopics(
  results: Array<{ title: string; content: string }>,
  apiKey: string,
): Promise<string[]> {
  try {
    const client = new OpenRouter({ apiKey });
    const completion = await client.chat.send({
      chatRequest: {
        model: TOPIC_EXTRACTION_MODEL,
        messages: [
          {
            role: "user",
            content:
              "Given these search results, extract 3-5 topic tags as a JSON array of strings. " +
              'Example: ["React", "state management", "Zustand"]\n\n' +
              results.map((r) => `${r.title}: ${r.content}`).join("\n"),
          },
        ],
        stream: false,
      },
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    const cleaned = raw.replace(/```json\s*|\s*```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return [];
  }
}

export async function handleSearch(c: Context<HonoEnv>) {
  try {
    const env = c.env;
    const userId = c.get("userId");

    if (!env.TAVILY_API_KEY) {
      return c.json({ error: "missing_tavily_api_key" }, 501);
    }

    if (!env.OPENROUTER_API_KEY) {
      return c.json({ error: "missing_openrouter_api_key" }, 501);
    }

    const body = await c.req.json().catch(() => null) as {
      query?: string;
      conversationId?: string;
    } | null;

    if (!body?.query || typeof body.query !== "string") {
      return c.json({ error: "missing_query" }, 400);
    }

    const baseUrl = supabaseUrl(env);

    // 1. Tavily search (auto-answers, structured results)
    const tavilyRes = await fetch(TAVILY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: env.TAVILY_API_KEY,
        query: body.query,
        search_depth: "advanced",
        include_answer: true,
        max_results: 5,
      }),
    });

    if (!tavilyRes.ok) {
      const errText = await tavilyRes.text().catch(() => "");
      return c.json({ error: "tavily_search_failed", status: tavilyRes.status, detail: errText }, 502);
    }

    const tavilyData = (await tavilyRes.json()) as {
      answer?: string;
      results?: Array<{ title: string; url: string; content: string; score?: number }>;
    };

    const results = tavilyData.results ?? [];
    const answer = tavilyData.answer ?? "";

    // 2. Extract topics for cross-referencing with memory_facts
    let topics: string[] = [];
    if (results.length && env.OPENROUTER_API_KEY) {
      topics = await extractTopics(results, env.OPENROUTER_API_KEY);
    }

    // 3. Cross-reference with memory_facts
    let relatedFacts: Array<{ content: string; category: string }> = [];
    try {
      const queryEmbedding = await getEmbedding(body.query, env.OPENROUTER_API_KEY);
      if (queryEmbedding.length) {
        const facts = await matchMemoryFacts(env, {
          queryEmbedding,
          matchThreshold: 0.72,
          matchCount: 3,
          userId,
        });
        relatedFacts = facts?.map((f) => ({ content: f.content, category: f.category })) ?? [];
      }
    } catch {
      // memory cross-reference is best-effort
    }

    // 4. Store in search_results
    let searchId: string | null = null;
    if (baseUrl) {
      try {
        const insertRes = await fetch(`${baseUrl}/rest/v1/search_results`, {
          method: "POST",
          headers: { ...restHeaders(env), Prefer: "return=representation" },
          body: JSON.stringify({
            user_id: userId,
            conversation_id: body.conversationId ?? null,
            query: body.query,
            results,
            summary: answer,
            topics,
          }),
        });
        if (insertRes.ok) {
          const rows = (await insertRes.json()) as Array<{ id: string }>;
          searchId = rows[0]?.id ?? null;
        }
      } catch {
        // persistence is best-effort
      }
    }

    return c.json({
      ok: true,
      results,
      answer,
      topics,
      relatedFacts,
      searchId,
    });
  } catch (err: unknown) {
    return c.json({ error: "search_error", detail: String(err) }, 500);
  }
}
