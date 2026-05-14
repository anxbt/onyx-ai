import type { Context } from "hono";
import { OpenRouter } from "@openrouter/sdk";
import type { HonoEnv } from "./index";
import { supabaseAdminKey, supabaseUrl } from "./env";

const VISION_MODEL = "google/gemini-2.5-flash-lite";

interface AnalyzeRequest {
  uploadId: string;
  storagePath: string;
  mimeType: string;
}

function restHeaders(env: HonoEnv["Bindings"]) {
  const key = supabaseAdminKey(env) ?? "";
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  } as Record<string, string>;
}

export async function handleUploadAnalyze(c: Context<HonoEnv>) {
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

    const body = await c.req.json().catch(() => null) as AnalyzeRequest | null;
    if (!body?.uploadId || !body?.storagePath || !body?.mimeType) {
      return c.json({ error: "missing_required_fields" }, 400);
    }

    const isImage = body.mimeType.startsWith("image/");

    const publicUrl = `${baseUrl}/storage/v1/object/public/${body.storagePath}`;

    let contentType = "";
    let description = "";
    let transcribedText = "";

    if (isImage) {
      const client = new OpenRouter({ apiKey: env.OPENROUTER_API_KEY });
      const completion = await client.chat.send({
        chatRequest: {
          model: VISION_MODEL,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text:
                    "Describe this image in detail. If it contains text, transcribe all of it. " +
                    "If it's a diagram, explain what it depicts. " +
                    'Output JSON: {"type":"text|diagram|photo|screenshot|whiteboard","description":"...","transcribed_text":"..."}',
                },
                {
                  type: "image_url",
                  imageUrl: { url: publicUrl },
                },
              ],
            },
          ],
          stream: false,
        },
      });

      const raw = completion.choices[0]?.message?.content ?? "";
      try {
        const cleaned = raw.replace(/```json\s*|\s*```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        contentType = String(parsed.type ?? "photo");
        description = String(parsed.description ?? "");
        transcribedText = String(parsed.transcribed_text ?? "");
      } catch {
        description = raw.slice(0, 2000);
        contentType = "photo";
      }
    } else {
      contentType = body.mimeType.includes("pdf") ? "pdf" : "text";
      description = `Uploaded file: ${body.storagePath}`;
    }

    const response = await fetch(`${baseUrl}/rest/v1/uploads?id=eq.${encodeURIComponent(body.uploadId)}`, {
      method: "PATCH",
      headers: restHeaders(env),
      body: JSON.stringify({
        content_type: contentType,
        description,
        transcribed_text: transcribedText || null,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return c.json({ error: "update_failed", detail: errText }, 500);
    }

    return c.json({
      ok: true,
      contentType,
      description,
      transcribedText: transcribedText || null,
    });
  } catch (err: unknown) {
    return c.json({ error: "analyze_error", detail: String(err) }, 500);
  }
}
