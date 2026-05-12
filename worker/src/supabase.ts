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
  },
) {
  const response = await fetch(`${baseUrl(env)}/rest/v1/messages`, {
    method: "POST",
    headers: restHeaders(env),
    body: JSON.stringify({
      conversation_id: params.conversationId,
      user_id: params.userId,
      role: "assistant",
      content: params.content,
      model: params.model,
      has_attachment: false,
    }),
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
