import type { Context } from "hono";
import type { HonoEnv } from "./index";

const EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2";

export async function handleEmbed(c: Context<HonoEnv>) {
  try {
    const env = c.env;
    const body = await c.req.json().catch(() => null) as { text?: string } | null;

    if (!body?.text || typeof body.text !== "string") {
      return c.json({ error: "missing_text" }, 400);
    }

    if (!env.OPENROUTER_API_KEY) {
      return c.json({ error: "missing_openrouter_api_key" }, 501);
    }

    const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://onyxai.app",
        "X-Title": "OnyxAI",
      },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: body.text,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return c.json({ error: "embed_failed", status: res.status, detail: errText }, 502);
    }

    const data = (await res.json()) as { data?: Array<{ embedding: number[] }> };
    const embedding = data.data?.[0]?.embedding ?? [];

    return c.json({ ok: true, embedding });
  } catch (err: unknown) {
    return c.json({ error: "embed_error", detail: String(err) }, 500);
  }
}
