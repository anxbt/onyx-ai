import type { Context } from "hono";
import { OpenRouter } from "@openrouter/sdk";
import type { HonoEnv } from "./index";
import { CURATED_MODELS, FRONTIER_BASELINE, GLOBAL_MARKUP, USD_TO_INR } from "./config";
import {
  callRpc,
  getUserProfile,
  insertAssistantMessage,
  updateConversationAfterAssistant,
} from "./supabase";

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function modelConfig(modelId: string) {
  return CURATED_MODELS.find((model) => model.id === modelId) ?? CURATED_MODELS[0];
}

export async function handleChat(c: Context<HonoEnv>) {
  try {
    const env = c.env;
    const userId = c.get("userId");

    const body = await c.req.json().catch(() => null);
    if (!body) {
      return c.json({ error: "invalid_json" }, 400);
    }

    const messages = Array.isArray(body.messages) ? body.messages : null;
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

    const client = new OpenRouter({ apiKey: env.OPENROUTER_API_KEY });
    const completion = await client.chat.send({
      chatRequest: {
        model: model.id,
        messages,
        stream: false,
      },
    });

    const assistant =
      completion.choices[0]?.message?.content ?? JSON.stringify(completion);

    const promptTokens =
      completion.usage?.promptTokens ?? estimateTokens(JSON.stringify(messages ?? []));
    const completionTokens =
      completion.usage?.completionTokens ?? estimateTokens(assistant);
    const totalTokens = completion.usage?.totalTokens ?? promptTokens + completionTokens;

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
    const convId = body.conversationId ?? null;
    try {
      if (convId) {
        const inserted = await insertAssistantMessage(env, {
          conversationId: convId,
          userId,
          content: assistant,
          model: model.id,
        });
        insertedMessageId = inserted.id;
      }
    } catch {
      // ignore persistence errors; still return assistant text to client
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
          preview: assistant.slice(0, 160),
          tokenCount: totalTokens,
          model: model.id,
        });
      }
    } catch {
      // ignore credit-record errors
    }

    return c.json({
      ok: true,
      route: "/chat",
      assistant,
      messageId: insertedMessageId,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
        chargedTotalCostInr,
      },
      note: "non_streaming",
      cost_saving_message:
        "We are not streaming the model response to save server costs. You will receive the full reply once ready.",
      provider: "openrouter",
    });
  } catch (err: unknown) {
    return c.json({ error: "proxy_error", detail: String(err) }, 500);
  }
}
