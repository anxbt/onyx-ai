import type { Context } from "hono";
import type { HonoEnv } from "./index";
import { supabaseAdminKey, supabaseUrl } from "./env";

const FIRECRAWL_URL = "https://api.firecrawl.dev/v1/scrape";

function restHeaders(env: HonoEnv["Bindings"]) {
  const key = supabaseAdminKey(env) ?? "";
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  } as Record<string, string>;
}

export async function handleCrawl(c: Context<HonoEnv>) {
  try {
    const env = c.env;
    const userId = c.get("userId");

    if (!env.FIRECRAWL_API_KEY) {
      return c.json({ error: "missing_firecrawl_api_key" }, 501);
    }

    const body = await c.req.json().catch(() => null) as {
      url?: string;
    } | null;

    if (!body?.url || typeof body.url !== "string") {
      return c.json({ error: "missing_url" }, 400);
    }

    // 1. Firecrawl extract
    const fcRes = await fetch(FIRECRAWL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: body.url,
        formats: ["markdown"],
      }),
    });

    if (!fcRes.ok) {
      const errText = await fcRes.text().catch(() => "");
      return c.json({ error: "firecrawl_failed", status: fcRes.status, detail: errText }, 502);
    }

    const fcData = (await fcRes.json()) as {
      success?: boolean;
      data?: { markdown?: string; title?: string };
    };

    if (!fcData.success || !fcData.data?.markdown) {
      return c.json({ error: "firecrawl_no_content" }, 502);
    }

    const markdown = fcData.data.markdown;
    const title = fcData.data.title ?? new URL(body.url).hostname;

    return c.json({
      ok: true,
      title,
      url: body.url,
      content: markdown,
      contentLength: markdown.length,
    });
  } catch (err: unknown) {
    return c.json({ error: "crawl_error", detail: String(err) }, 500);
  }
}
