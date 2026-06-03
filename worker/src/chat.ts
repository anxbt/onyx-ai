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
  matchMemoryFacts,
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

function userWantsPdf(text: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  return /\b(make|create|generate|write|export|give\s+me|build|produce|draft|prepare)\s+(a|an|the)?\s*(pdf|document|report|memo|letter|whitepaper|essay|proposal|one[- ]pager)\b/.test(t)
      || /\b(as\s+a|in\s+a|formatted\s+as\s+a)\s+(pdf|document|report|memo|letter|proposal)\b/.test(t)
      || /\b(download(?:able)?|printable|export\s+to)\s+(pdf|document|report)\b/.test(t);
}

function getResponseTypeInstructions(): string {
  return `Begin EVERY response with a single hidden HTML comment tagging the response type. Use exactly one of:
<!--type:answer--> for direct Q&A and factual lookups
<!--type:analysis--> for evaluations, comparisons, breakdowns
<!--type:tutorial--> for step-by-step instructions
<!--type:creative--> for writing, brainstorming, ideation

After the comment, write the response normally. Do not mention the comment to the user.`;
}

function getArtifactInstructions(): string {
  return `The user explicitly asked for a PDF/document. Generate the content as semantic HTML inside a \`\`\`html code fence with a root <div data-type="pdf" data-title="Title">. Do NOT generate Markdown outside the HTML fence for the document body.

DESIGN SYSTEM — STRICT RULES:
1. ONLY use the CSS classes listed below. NEVER write inline style attributes. NEVER use <style> tags inside the HTML.
2. Colors: ONLY #111 (near-black for headings) and #2563EB (deep blue accent). NO purple, violet, magenta, or neon. NO gradients.
3. Background: White (#FFF) for the document body. NO dark backgrounds on print documents.
4. Typography: Use serif for body text (class="body") and sans-serif for headings (classes h1-h6). NO monospace fonts outside code blocks.
5. NO rounded cards, bordered boxes, or shadow containers. Use plain headings and paragraphs. For separating sections, use a horizontal rule (<hr>) or extra whitespace, NOT visual boxes.
6. NO emojis in headings or document content.
7. Layout: Left-aligned body text. NO center-aligned body text.
8. Code blocks: Only when genuinely needed. Use <pre><code> with class="code-block".

PERMITTED CLASSES — USE THEM PURPOSEFULLY:
- <div class="doc-header"> — document title block (contains h1 + subtitle + meta). Always present at top.
- <span class="meta"> — date, author, version inside doc-header. Example: <span class="meta">May 2026 · Closed AI</span>
- <h1> through <h6> — headings (NEVER center-aligned). Use H1 once for title, H2 for sections, H3 for subsections.
- <p class="lead"> — ALWAYS the first paragraph after the title. Opens the doc with the thesis in 2-3 sentences. Renders larger with a slightly heavier weight. Use EXACTLY ONCE per document.
- <p class="body"> — all standard body paragraphs.
- <p class="caption"> — placed under tables or figure headings; small gray text.
- <blockquote class="pull"> — for ONE striking takeaway per major section. Max 1-2 per document total. Renders as an indented callout with accent border.
- <span class="highlight"> — for inline emphasis of a proper noun or key term on first introduction. Max 1-2 per page equivalent. Renders in accent color, bold.
- <ul class="list"> / <ol class="list"> with <li class="item"> — for parallel lists.
- <table class="data-table"> — for tabular data. First row uses <th> for headers.
- <pre class="code-block"><code> — only for actual code or commands.
- <hr> — section dividers between major sections. NOT after every heading.
- <div class="two-col"> — wraps a section that contains naturally parallel content (definitions, glossary, FAQ pairs, comparison points). NEVER force-wrap narrative prose. Only use when there is genuinely two-column-friendly content.

STRUCTURAL GUIDANCE:
- 1-2 page document: skip TOC, skip subsections, lead with .lead paragraph, 2-4 main sections.
- 3-5 page document: include H2 sections with H3 subsections where needed. Optional TOC.
- 5+ pages: lead with an executive summary section before the body.
- Use <hr> between major sections (after H2 closes), NOT after every heading.

ANTI-AI WRITING RULES:
- NEVER start sections with "In today's world..." or "In conclusion..."
- NEVER use words: delve, leverage, robust, comprehensive, cutting-edge, paradigm, synergy, holistic, actionable, transformative.
- NEVER use filler phrases: "It is important to note that...", "As mentioned previously...", "It goes without saying..."
- Write directly. One idea per sentence. Vary sentence length.
- Some sections can be one paragraph; others can be several. Do NOT force uniform length.
- Use concrete examples and specific numbers instead of vague qualifiers.

For non-PDF artifacts (diagrams, charts, etc.): add data-type="artifact" to root <div>.`;
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

    // Wave 5: search augmentation (Tavily) — explicit opt-in only
    const enableSearch = body.enableSearch as boolean | undefined;
    const forceSearch = body.forceSearch as boolean | undefined;
    // Per-request reasoning depth. Forwarded to OpenRouter as
    // `reasoning: { effort }`. OpenRouter normalizes across providers
    // (DeepSeek V4 Flash supports up to "xhigh"; others vary). Omitted for
    // models with always-on reasoning (Kimi K2 Thinking) — those models
    // reason regardless of this param, so the client passes undefined.
    const reasoningEffort = body.reasoningEffort as
      | "none"
      | "minimal"
      | "low"
      | "medium"
      | "high"
      | "xhigh"
      | undefined;
    let tavilySources: Array<{ title: string; url: string; snippet: string }> = [];
    if (enableSearch === true && env.TAVILY_API_KEY) {
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
              max_results: 4,
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
              tavilySources = results.map((r) => ({
                title: r.title,
                url: r.url,
                snippet: r.content.slice(0, 200),
              }));
              const searchCtx =
                "[Web search results]\n" +
                (answer ? `Summary: ${answer}\n\n` : "") +
                results.map((r, i) => `[${i + 1}] ${r.title}\nSource: ${r.url}\nContent: ${r.content.slice(0, 500)}`).join("\n\n") +
                "\n\nUse these sources to answer. Cite them inline as [1], [2], etc. If the sources do not contain the answer, say so plainly — do NOT fabricate numbers, prices, or current events.";
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

    // Response-type marker: always prepend so client can render a "ANSWER / ANALYSIS / TUTORIAL / CREATIVE" badge
    finalMessages = [{ role: "system", content: getResponseTypeInstructions() }, ...finalMessages];

    // PDF artifact instructions: only inject when user explicitly asks for a document
    const lastUserContent = getLastUserContent(messages);
    if (userWantsPdf(lastUserContent)) {
      finalMessages = [{ role: "system", content: getArtifactInstructions() }, ...finalMessages];
    }
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

          // Layer 4.5: memory facts retrieval (Wave 4 wiring fix — Section 3e)
          // Reuse queryEmbedding from Layer 3. Higher threshold (0.72) than
          // message retrieval (0.55) so only strongly-relevant facts join the
          // context. Strictly additive — no-op when memory_facts is empty.
          const facts = await matchMemoryFacts(env, {
            queryEmbedding,
            matchThreshold: 0.72,
            matchCount: 6,
            userId,
          }).catch(() => []);

          if (facts?.length) {
            const memoryCtx =
              "[What you remember about this user]\n" +
              facts.map((f) => `• ${f.content} (${f.category})`).join("\n");
            finalMessages = [{ role: "system", content: memoryCtx }, ...finalMessages];
          }
        }
      }
    }

    const estimatedPrompt = estimateTokens(JSON.stringify(finalMessages));
    const maxOutput = Math.max(4096, Math.min(model.maxOutput, model.contextWindow - estimatedPrompt - 1024));

    // Build the reasoning param for OpenRouter.
    //   - a real effort level → request that depth
    //   - "none" → explicitly DISABLE reasoning. Omitting the param doesn't
    //     turn reasoning off (the model reasons by default), which is why
    //     "Off" still showed a thinking trace. `enabled: false` disables it.
    //   - undefined (no preference sent) → omit, model default.
    const reasoningParam =
      reasoningEffort === "none"
        ? { reasoning: { enabled: false } }
        : reasoningEffort
          ? { reasoning: { effort: reasoningEffort } }
          : {};

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
        ...reasoningParam,
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
    let fullReasoning = "";
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;

    const writeStream = (async () => {
      try {
        // Emit citation sources BEFORE streaming model tokens so client can render Perplexity-style cards
        if (tavilySources.length) {
          await writer.write(
            encoder.encode(`data: ${JSON.stringify({ type: "sources", sources: tavilySources })}\n\n`),
          );
        }

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

              // Accumulate reasoning trace from OpenRouter's normalized
              // delta.reasoning_details (array of typed entries). We persist
              // this separately from `content` so the saved assistant
              // message's visible answer doesn't include the trace.
              const reasoningDetails =
                parsed.choices?.[0]?.delta?.reasoning_details;
              if (Array.isArray(reasoningDetails)) {
                for (const entry of reasoningDetails) {
                  if (
                    entry &&
                    typeof entry === "object" &&
                    (entry.type === "reasoning.text" ||
                      entry.type === "reasoning.summary") &&
                    typeof entry.text === "string"
                  ) {
                    fullReasoning += entry.text;
                  }
                }
              }
              // Some providers also emit a simple `delta.reasoning` string.
              const reasoningStr = parsed.choices?.[0]?.delta?.reasoning;
              if (typeof reasoningStr === "string" && reasoningStr.length > 0) {
                fullReasoning += reasoningStr;
              }

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
              reasoning: fullReasoning || null,
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
            const previewClean = fullContent
              .replace(/^\s*<!--\s*type\s*:\s*[a-z]+\s*-->\s*/i, "")
              .trim();
            await updateConversationAfterAssistant(env, {
              conversationId: convId,
              preview: previewClean.slice(0, 160),
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
