import type { Env } from "./types";
import { isSupabaseSecretKey, supabaseAdminKey, supabaseUrl } from "./env";

const restHeaders = (env: Env) => {
  const key = adminKey(env);
  return {
    apikey: key,
    ...(isSupabaseSecretKey(key) ? {} : { Authorization: `Bearer ${key}` }),
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
};

function baseUrl(env: Env) {
  const url = supabaseUrl(env);
  if (!url || !supabaseAdminKey(env)) {
    throw new Error("Missing Supabase worker secrets");
  }

  return url;
}

function adminKey(env: Env) {
  const key = supabaseAdminKey(env);
  if (!key) {
    throw new Error("Missing Supabase worker secret key");
  }

  return key;
}

export async function supabaseAuthUser(env: Env, accessToken: string) {
  const response = await fetch(`${baseUrl(env)}/auth/v1/user`, {
    headers: {
      apikey: adminKey(env),
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase auth lookup failed: ${response.status}`);
  }

  return response.json() as Promise<{ id: string; email?: string }>;
}

export async function getUserProfile(env: Env, userId: string) {
  const response = await fetch(
    `${baseUrl(env)}/rest/v1/user_profiles?id=eq.${encodeURIComponent(
      userId,
    )}&select=id,credit_balance,total_tokens_used,preferred_model,display_name,is_superuser`,
    {
      headers: restHeaders(env),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch user profile: ${response.status}`);
  }

  const rows = (await response.json()) as Array<{
    id: string;
    credit_balance: number;
    total_tokens_used: number;
    preferred_model: string;
    display_name: string | null;
    is_superuser: boolean;
  }>;

  return rows[0] ?? null;
}

export async function insertAssistantMessage(
  env: Env,
  params: {
    conversationId: string;
    userId: string;
    content: string;
    model: string;
    // Optional chain-of-thought trace for reasoning-capable models. Stored
    // in messages.reasoning text column (migration 0011). Null/omitted when
    // the model didn't emit any reasoning content.
    reasoning?: string | null;
  },
) {
  const body: Record<string, unknown> = {
    conversation_id: params.conversationId,
    user_id: params.userId,
    role: "assistant",
    content: params.content,
    model: params.model,
    has_attachment: false,
  };
  if (params.reasoning) {
    body.reasoning = params.reasoning;
  }

  const response = await fetch(`${baseUrl(env)}/rest/v1/messages`, {
    method: "POST",
    headers: restHeaders(env),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Failed to insert assistant message: ${response.status}`);
  }

  const rows = (await response.json()) as Array<{ id: string }>;
  return rows[0];
}

export async function updateConversationAfterAssistant(
  env: Env,
  params: {
    conversationId: string;
    preview: string;
    tokenCount: number;
    model: string;
  },
) {
  const response = await fetch(
    `${baseUrl(env)}/rest/v1/conversations?id=eq.${encodeURIComponent(params.conversationId)}`,
    {
      method: "PATCH",
      headers: restHeaders(env),
      body: JSON.stringify({
        preview: params.preview,
        token_count: params.tokenCount,
        model: params.model,
        title: params.preview.slice(0, 48),
        updated_at: new Date().toISOString(),
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to update conversation: ${response.status}`);
  }
}

export async function callRpc<T>(env: Env, fn: string, payload: Record<string, unknown>) {
  const response = await fetch(`${baseUrl(env)}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: restHeaders(env),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`RPC ${fn} failed: ${response.status} ${body}`);
  }

  return response.json() as Promise<T>;
}

export async function insertTopUpOrder(
  env: Env,
  payload: {
    userId: string;
    packId: string;
    amountInr: number;
    creditsInr: number;
    razorpayOrderId: string;
  },
) {
  const response = await fetch(`${baseUrl(env)}/rest/v1/top_up_orders`, {
    method: "POST",
    headers: restHeaders(env),
    body: JSON.stringify({
      user_id: payload.userId,
      pack_id: payload.packId,
      amount_inr: payload.amountInr,
      credits_inr: payload.creditsInr,
      razorpay_order_id: payload.razorpayOrderId,
      status: "created",
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to insert top up order: ${response.status}`);
  }
}

export async function upsertModelCatalog(env: Env, rows: Array<Record<string, unknown>>) {
  const response = await fetch(`${baseUrl(env)}/rest/v1/model_catalog?on_conflict=id`, {
    method: "POST",
    headers: {
      ...restHeaders(env),
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(rows),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to sync model catalog: ${response.status} ${body}`);
  }
}

/* ------------------------------------------------------------------ */
/*  Conversation summaries (Wave 1)                                   */
/* ------------------------------------------------------------------ */

export async function fetchConversationSummaries(env: Env, conversationId: string) {
  const response = await fetch(
    `${baseUrl(env)}/rest/v1/conversation_summaries?conversation_id=eq.${encodeURIComponent(conversationId)}&select=message_start_idx,message_end_idx,summary_text,key_facts&order=message_end_idx.asc`,
    { headers: restHeaders(env) },
  );
  if (!response.ok) return [];
  return (await response.json()) as Array<{
    message_start_idx: number;
    message_end_idx: number;
    summary_text: string;
    key_facts: string[];
  }>;
}

export async function fetchMessagesRange(env: Env, conversationId: string, startIdx: number, endIdx: number) {
  const response = await fetch(
    `${baseUrl(env)}/rest/v1/messages?conversation_id=eq.${encodeURIComponent(conversationId)}&select=role,content&order=created_at.asc&offset=${startIdx}&limit=${endIdx - startIdx}`,
    { headers: restHeaders(env) },
  );
  if (!response.ok) return [];
  return (await response.json()) as Array<{ role: string; content: string }>;
}

export async function fetchMessageCount(env: Env, conversationId: string) {
  const response = await fetch(
    `${baseUrl(env)}/rest/v1/messages?conversation_id=eq.${encodeURIComponent(conversationId)}&select=count`,
    { headers: { ...restHeaders(env), Prefer: "count=exact" } },
  );
  if (!response.ok) return 0;
  const countHeader = response.headers.get("content-range");
  if (countHeader) {
    const match = countHeader.match(/\/(\d+)/);
    if (match) return parseInt(match[1], 10);
  }
  const rows = (await response.json()) as Array<Record<string, unknown>>;
  return rows.length;
}

export async function insertConversationSummary(
  env: Env,
  params: {
    conversationId: string;
    messageStartIdx: number;
    messageEndIdx: number;
    summaryText: string;
    keyFacts: string[];
  },
) {
  const response = await fetch(`${baseUrl(env)}/rest/v1/conversation_summaries`, {
    method: "POST",
    headers: restHeaders(env),
    body: JSON.stringify({
      conversation_id: params.conversationId,
      message_start_idx: params.messageStartIdx,
      message_end_idx: params.messageEndIdx,
      summary_text: params.summaryText,
      key_facts: params.keyFacts,
    }),
  });
  if (!response.ok) throw new Error(`Failed to insert summary: ${response.status}`);
  return (await response.json()) as Array<{ id: string }>;
}

/* ------------------------------------------------------------------ */
/*  match_messages RPC (Wave 1)                                       */
/* ------------------------------------------------------------------ */

export async function matchMessages(
  env: Env,
  params: {
    queryEmbedding: number[];
    matchThreshold: number;
    matchCount: number;
    conversationId: string;
  },
) {
  return callRpc<
    Array<{
      id: string;
      role: string;
      content: string;
      created_at: string;
      similarity: number;
    }>
  >(env, "match_messages", {
    query_embedding: params.queryEmbedding,
    match_threshold: params.matchThreshold,
    match_count: params.matchCount,
    conv_id: params.conversationId,
  });
}

/* ------------------------------------------------------------------ */
/*  match_memory_facts RPC (Wave 4)                                   */
/* ------------------------------------------------------------------ */

export async function matchMemoryFacts(
  env: Env,
  params: {
    queryEmbedding: number[];
    matchThreshold: number;
    matchCount: number;
    userId: string;
  },
) {
  return callRpc<
    Array<{
      id: string;
      content: string;
      category: string;
      similarity: number;
    }>
  >(env, "match_memory_facts", {
    query_embedding: params.queryEmbedding,
    match_threshold: params.matchThreshold,
    match_count: params.matchCount,
    p_user_id: params.userId,
  });
}
