import type { Context } from "hono";
import { OpenRouter } from "@openrouter/sdk";
import type { HonoEnv } from "./index";
import { CURATED_MODELS, FRONTIER_BASELINE, GLOBAL_MARKUP, USD_TO_INR } from "./config";
import {
  callRpc,
  getUserProfile,
  insertAssistantMessage,
  updateConversationAfterAssistant,
  fetchConversationSummaries,
  fetchMessagesRange,
  fetchMessageCount,
  insertConversationSummary,
  matchMessages,
} from "./supabase";

const SUMMARIZE_CHUNK_SIZE = 10;
const CHARS_PER_TOKEN = 4;

const EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2";

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

function getLastUserContent(messages: Array<Record<string, unknown>>): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if ((msg as { role?: string }).role !== "user") continue;
    const content = (msg as { content?: unknown }).content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      const textPart = content.find((p: { type?: string; text?: string }) => p.type === "text");
      if (textPart?.text) return textPart.text;
    }
  }
  return "";
}

async function classifySearchNeed(query: string, env: HonoEnv["Bindings"]): Promise<boolean> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://onyxai.app",
        "X-Title": "OnyxAI",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "user",
            content: `Does this query need real-time web search for current, accurate, or up-to-date information? Answer ONLY "yes" or "no": ${query}`,
          },
        ],
        max_tokens: 3,
      }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content?.toLowerCase().includes("yes") ?? false;
  } catch {
    return false;
  }
}

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN));
}

function modelConfig(modelId: string) {
  return CURATED_MODELS.find((model) => model.id === modelId) ?? CURATED_MODELS[0];
}

/* ------------------------------------------------------------------ */
/*  Context assembly                                                  */
/* ------------------------------------------------------------------ */

function buildSystemContext(
  summaries: Array<{
    message_start_idx: number;
    message_end_idx: number;
    summary_text: string;
    key_facts: string[];
  }>,
) {
  const parts: string[] = [];
  if (summaries.length) {
    parts.push("[Conversation history summaries]");
    for (const s of summaries) {
      parts.push(`Messages ${s.message_start_idx}-${s.message_end_idx}: ${s.summary_text}`);
      const facts = Array.isArray(s.key_facts) ? s.key_facts : [];
      if (facts.length) parts.push(`Key facts: ${facts.join("; ")}`);
    }
  }
  return parts.join("\n\n");
}

function getArtifactInstructions(): string {
  return `Generate styled HTML in \`\`\`html code fences for visual explanations.

For PDFs: add data-type="pdf" data-title="Title" to root <div>.
For diagrams: add data-type="artifact" to root <div>.

Use dark bg #0A0A0A, text #ECECED, accent #7C3AED. Left-aligned, max 3 colors, solid only.`;
}

/* ------------------------------------------------------------------ */
/*  /chat                                                             */
/* ------------------------------------------------------------------ */

export async function handleChat(c: Context<HonoEnv>) {
  try {
    const env = c.env;
    const userId = c.get("userId");

    const body = await c.req.json().catch(() => null);
    if (!body) {
      return c.json({ error: "invalid_json" }, 400);
    }

    let messages = Array.isArray(body.messages) ? (body.messages as Array<Record<string, unknown>>) : null;
    if (!messages || messages.length === 0) {
      return c.json({ error: "missing_messages" }, 400);
    }

    if (!env.OPENROUTER_API_KEY) {
      return c.json(
        {
          error: "missing_openrouter_api_key",
          note: "Fill worker/.dev.vars from the generated template before testing real streaming.",
          userId,
        },
        501,
      );
    }

    const model = modelConfig(body.model);
    const profile = await getUserProfile(env, userId);
    if (!profile) {
      return c.json({ error: "missing_user_profile" }, 404);
    }

    if (!model.isFree && !profile.is_superuser && Number(profile.credit_balance ?? 0) <= 0) {
      return c.json(
        { error: "insufficient_credits", detail: "Choose a free model or top up credits." },
        402,
      );
    }

    // Wave 5: search augmentation (Tavily)
    const enableSearch = body.enableSearch as boolean | undefined;
    const forceSearch = body.forceSearch as boolean | undefined;
    if (enableSearch !== false && env.TAVILY_API_KEY) {
      const lastUserContent = getLastUserContent(messages);
      let shouldSearch = forceSearch === true;
      if (!shouldSearch && lastUserContent) {
        try {
          shouldSearch = await classifySearchNeed(lastUserContent, env);
        } catch {
          // classification is best-effort
        }
      }
      if (shouldSearch && lastUserContent) {
        try {
          const tavilyRes = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              api_key: env.TAVILY_API_KEY,
              query: lastUserContent,
              search_depth: "advanced",
              include_answer: true,
              max_results: 2,
            }),
          });
          if (tavilyRes.ok) {
            const tavilyData = (await tavilyRes.json()) as {
              answer?: string;
              results?: Array<{ title: string; url: string; content: string }>;
            };
            const results = tavilyData.results ?? [];
            const answer = tavilyData.answer ?? "";
            if (results.length) {
              const searchCtx =
                "[Web search results]\n" +
                (answer ? `Summary: ${answer}\n\n` : "") +
                results.map((r) => `Title: ${r.title}\nSource: ${r.url}\nContent: ${r.content.slice(0, 500)}`).join("\n\n") +
                "\n\nUse these sources if relevant to the user's question. Cite them as [1], [2], etc.";
              messages = [{ role: "system", content: searchCtx }, ...messages];
            }
          }
        } catch {
          // search is best-effort
        }
      }
    }

    const convId = body.conversationId ?? null;
    let finalMessages = messages;
    const artifactInstructions = getArtifactInstructions();
    finalMessages = [{ role: "system", content: artifactInstructions }, ...finalMessages];
    if (convId) {
      const summaries = await fetchConversationSummaries(env, convId);
      const systemCtx = buildSystemContext(summaries);
      if (systemCtx) {
        finalMessages = [{ role: "system", content: systemCtx }, ...finalMessages];
      }

      // Wave 4 / Layer 3: semantic retrieval of relevant old messages
      const queryText = getLastUserContent(messages);
      if (queryText) {
        const queryEmbedding = await getEmbedding(queryText, env.OPENROUTER_API_KEY);
        if (queryEmbedding.length) {
          const relevant = await matchMessages(env, {
            queryEmbedding,
            matchThreshold: 0.55,
            matchCount: 3,
            conversationId: convId,
          }).catch(() => []);

          if (relevant?.length) {
            const retrievalCtx =
              "[Relevant context from earlier in this conversation]\n" +
              relevant.map((m) => `${m.role}: ${m.content}`).join("\n");
            finalMessages = [{ role: "system", content: retrievalCtx }, ...finalMessages];
          }
        }
      }
    }

    const estimatedPrompt = estimateTokens(JSON.stringify(finalMessages));
    const maxOutput = Math.max(4096, Math.min(model.maxOutput, model.contextWindow - estimatedPrompt - 1024));

    const orResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://onyxai.app",
        "X-Title": "OnyxAI",
      },
      body: JSON.stringify({
        model: model.id,
        messages: finalMessages,
        stream: true,
        max_tokens: maxOutput,
      }),
    });

    if (!orResponse.ok) {
      const errText = await orResponse.text().catch(() => "");
      return c.json({ error: "openrouter_error", status: orResponse.status, detail: errText }, 502);
    }

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    let fullContent = "";
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;

    const writeStream = (async () => {
      try {
        const reader = orResponse.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;
            const data = trimmed.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content ?? "";
              if (delta) fullContent += delta;
              if (parsed.usage) {
                promptTokens = parsed.usage.prompt_tokens ?? promptTokens;
                completionTokens = parsed.usage.completion_tokens ?? completionTokens;
                totalTokens = parsed.usage.total_tokens ?? totalTokens;
              }

              await writer.write(encoder.encode(`data: ${data}\n\n`));
            } catch {
              // skip malformed lines
            }
          }
        }

        if (!promptTokens) promptTokens = estimateTokens(JSON.stringify(finalMessages ?? []));
        if (!completionTokens) completionTokens = estimateTokens(fullContent);
        if (!totalTokens) totalTokens = promptTokens + completionTokens;

        const providerInputCostUsd = (promptTokens / 1_000_000) * model.inputCostPerMToken;
        const providerOutputCostUsd = (completionTokens / 1_000_000) * model.outputCostPerMToken;
        const providerTotalCostUsd = providerInputCostUsd + providerOutputCostUsd;
        const chargedTotalCostInr = model.isFree
          ? 0
          : Math.ceil(providerTotalCostUsd * GLOBAL_MARKUP * USD_TO_INR * 100) / 100;
        const frontierCostUsd =
          (promptTokens / 1_000_000) * FRONTIER_BASELINE.inputCostPerMToken +
          (completionTokens / 1_000_000) * FRONTIER_BASELINE.outputCostPerMToken;
        const savingsVsFrontierUsd = Math.max(0, frontierCostUsd - providerTotalCostUsd);

        let insertedMessageId: string | null = null;
        try {
          if (convId) {
            const inserted = await insertAssistantMessage(env, {
              conversationId: convId,
              userId,
              content: fullContent,
              model: model.id,
            });
            insertedMessageId = inserted.id;
          }
        } catch {
          // ignore persistence errors
        }

        try {
          const idempotencyKey = c.req.header("Idempotency-Key") ?? body.idempotency_key ?? null;
          if (convId && insertedMessageId && idempotencyKey) {
            await callRpc(env, "record_usage_and_charge", {
              p_user_id: userId,
              p_conversation_id: convId,
              p_message_id: insertedMessageId,
              p_model: model.id,
              p_prompt_tokens: promptTokens,
              p_completion_tokens: completionTokens,
              p_total_tokens: totalTokens,
              p_provider_input_cost_usd: providerInputCostUsd,
              p_provider_output_cost_usd: providerOutputCostUsd,
              p_provider_total_cost_usd: providerTotalCostUsd,
              p_charged_total_cost_inr: chargedTotalCostInr,
              p_frontier_model: FRONTIER_BASELINE.id,
              p_frontier_cost_usd: frontierCostUsd,
              p_savings_vs_frontier_usd: savingsVsFrontierUsd,
              p_idempotency_key: idempotencyKey,
            });
            await updateConversationAfterAssistant(env, {
              conversationId: convId,
              preview: fullContent.slice(0, 160),
              tokenCount: totalTokens,
              model: model.id,
            });
          }
        } catch {
          // ignore credit-record errors
        }

        const doneChunk = JSON.stringify({
          ok: true,
          messageId: insertedMessageId,
          usage: { promptTokens, completionTokens, totalTokens, chargedTotalCostInr },
          done: true,
        });
        await writer.write(encoder.encode(`data: ${doneChunk}\n\n`));
      } catch (streamErr: unknown) {
        const errMsg = streamErr instanceof Error ? streamErr.message : String(streamErr);
        await writer.write(encoder.encode(`data: {"error":${JSON.stringify(errMsg)}}\n\n`));
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err: unknown) {
    return c.json({ error: "proxy_error", detail: String(err) }, 500);
  }
}

/* ------------------------------------------------------------------ */
/*  /chat/summarize                                                   */
/* ------------------------------------------------------------------ */

export async function handleSummarize(c: Context<HonoEnv>) {
  try {
    const env = c.env;
    const userId = c.get("userId");

    const body = await c.req.json().catch(() => null);
    if (!body?.conversationId) {
      return c.json({ error: "missing_conversation_id" }, 400);
    }

    const convId = body.conversationId;
    const messageCount = await fetchMessageCount(env, convId);
    if (messageCount < SUMMARIZE_CHUNK_SIZE * 2) {
      return c.json({ ok: true, note: "too_few_messages" });
    }

    const startIdx = Math.max(0, messageCount - SUMMARIZE_CHUNK_SIZE * 2);
    const endIdx = messageCount - SUMMARIZE_CHUNK_SIZE;
    const chunk = await fetchMessagesRange(env, convId, startIdx, endIdx);
    if (chunk.length === 0) {
      return c.json({ ok: true, note: "no_messages_in_range" });
    }

    const summarizationPrompt =
      "Summarize the following conversation segment concisely. " +
      "Preserve facts, decisions, and context the assistant will need later. " +
      "Also list up to 5 key facts as a JSON array.\n\n" +
      "Respond in this exact JSON format (no markdown code fences):\n" +
      '{"summary":"...","key_facts":["fact1","fact2"]}\n\n' +
      chunk.map((m) => `${m.role}: ${m.content}`).join("\n\n");

    if (!env.OPENROUTER_API_KEY) {
      return c.json({ error: "missing_openrouter_api_key" }, 501);
    }

    // Use Gemini Flash Lite for reliable structured summarization
    const summaryModel = CURATED_MODELS.find((m) => m.id === "google/gemini-2.5-flash-lite") ?? CURATED_MODELS[0];
    const client = new OpenRouter({ apiKey: env.OPENROUTER_API_KEY });

    const completion = await client.chat.send({
      chatRequest: {
        model: summaryModel.id,
        messages: [{ role: "user", content: summarizationPrompt }],
        stream: false,
      },
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    let summaryText = "";
    let keyFacts: string[] = [];

    try {
      const cleaned = raw.replace(/```json\s*|\s*```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      summaryText = String(parsed.summary ?? "");
      keyFacts = Array.isArray(parsed.key_facts) ? parsed.key_facts : [];
    } catch {
      summaryText = raw.slice(0, 2000);
    }

    await insertConversationSummary(env, {
      conversationId: convId,
      messageStartIdx: startIdx,
      messageEndIdx: endIdx,
      summaryText,
      keyFacts,
    });

    return c.json({ ok: true, summary: summaryText, key_facts: keyFacts });
  } catch (err: unknown) {
    return c.json({ error: "summarize_error", detail: String(err) }, 500);
  }
}
