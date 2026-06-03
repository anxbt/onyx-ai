import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

import type {
  Conversation,
  CreditTransaction,
  Message,
  ModelCatalogEntry,
  UsageEvent,
  UserProfile,
} from "@/types";

export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
export const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey);

// Web storage adapter for Supabase auth
const webStorage = {
  getItem: (key: string) => {
    if (typeof window === "undefined") return null;
    return Promise.resolve(window.localStorage.getItem(key));
  },
  setItem: (key: string, value: string) => {
    if (typeof window === "undefined") return Promise.resolve();
    window.localStorage.setItem(key, value);
    return Promise.resolve();
  },
  removeItem: (key: string) => {
    if (typeof window === "undefined") return Promise.resolve();
    window.localStorage.removeItem(key);
    return Promise.resolve();
  },
};

const isWeb = Platform.OS === "web";

export const supabase: SupabaseClient | null = hasSupabaseEnv
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        storage: isWeb ? webStorage : AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        flowType: "pkce",
        detectSessionInUrl: false,
      },
    })
  : null;

function ensureSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  return supabase;
}

export async function getCurrentSession() {
  const client = ensureSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) {
    throw error;
  }
  return data.session;
}

export async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const client = ensureSupabase();
  const { data, error } = await client
    .from("user_profiles")
    .select("id, display_name, credit_balance, total_tokens_used, preferred_model, is_superuser")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    displayName: data.display_name,
    creditBalance: Number(data.credit_balance ?? 0),
    totalTokensUsed: data.total_tokens_used ?? 0,
    preferredModel: data.preferred_model,
    isSuperuser: Boolean(data.is_superuser),
  };
}

export async function ensureUserProfile(
  userId: string,
  userInfo?: { email?: string; displayName?: string | null },
): Promise<UserProfile> {
  const existing = await fetchProfile(userId);
  const emailPrefix = userInfo?.email ? userInfo.email.split("@")[0] : null;
  const displayName = userInfo?.displayName || emailPrefix;

  if (existing) {
    if (
      displayName &&
      (!existing.displayName || existing.displayName === emailPrefix)
    ) {
      const client = ensureSupabase();
      const { error } = await client
        .from("user_profiles")
        .update({ display_name: displayName })
        .eq("id", userId);

      if (!error) {
        return {
          ...existing,
          displayName,
        };
      }
    }

    return existing;
  }

  const client = ensureSupabase();
  const { error } = await client.from("user_profiles").insert({
    id: userId,
    display_name: displayName,
  });

  if (error) {
    throw error;
  }

  const profile = await fetchProfile(userId);
  if (!profile) {
    throw new Error("Could not create user profile");
  }

  return profile;
}

export async function fetchConversationsForUser(
  userId: string,
  searchQuery = "",
  page = 0,
): Promise<Conversation[]> {
  const client = ensureSupabase();
  const query = client
    .from("conversations")
    .select("id, title, model, preview, token_count, updated_at, is_archived")
    .eq("user_id", userId)
    .eq("is_archived", false)
    .order("updated_at", { ascending: false })
    .range(page * 20, page * 20 + 19);

  const { data, error } = await (searchQuery.trim()
    ? query.or(`title.ilike.%${searchQuery.trim()}%,preview.ilike.%${searchQuery.trim()}%`)
    : query);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title ?? "Untitled chat",
    model: row.model,
    preview: row.preview ?? "",
    tokenCount: row.token_count ?? 0,
    updatedAt: row.updated_at,
    isArchived: row.is_archived ?? false,
  }));
}

export async function fetchMessagesForConversation(conversationId: string): Promise<Message[]> {
  const client = ensureSupabase();
  const { data, error } = await client
    .from("messages")
    .select(
      "id, conversation_id, role, content, model, has_attachment, attachments, reasoning, created_at",
    )
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role as Message["role"],
    content: row.content,
    model: row.model ?? undefined,
    hasAttachment: row.has_attachment ?? false,
    attachments: Array.isArray(row.attachments)
      ? (row.attachments as Message["attachments"])
      : undefined,
    reasoning: typeof row.reasoning === "string" ? row.reasoning : undefined,
    createdAt: row.created_at,
  }));
}

export async function fetchUsageForCurrentMonth(userId: string): Promise<UsageEvent[]> {
  const client = ensureSupabase();
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  const { data, error } = await client
    .from("usage_events")
    .select(
      "id, model, prompt_tokens, completion_tokens, total_tokens, provider_total_cost_usd, charged_total_cost_inr, frontier_model, savings_vs_frontier_usd, deduction_bypassed, created_at",
    )
    .eq("user_id", userId)
    .gte("created_at", start.toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    model: row.model,
    promptTokens: row.prompt_tokens ?? 0,
    completionTokens: row.completion_tokens ?? 0,
    totalTokens: row.total_tokens ?? 0,
    providerTotalCostUsd: Number(row.provider_total_cost_usd ?? 0),
    chargedTotalCostInr: Number(row.charged_total_cost_inr ?? 0),
    frontierModel: row.frontier_model,
    savingsVsFrontierUsd: Number(row.savings_vs_frontier_usd ?? 0),
    deductionBypassed: Boolean(row.deduction_bypassed),
    createdAt: row.created_at,
  }));
}

export async function fetchCreditTransactions(userId: string): Promise<CreditTransaction[]> {
  const client = ensureSupabase();
  const { data, error } = await client
    .from("credit_transactions")
    .select("id, amount, type, model, tokens_used, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    amount: Number(row.amount ?? 0),
    type: row.type as CreditTransaction["type"],
    model: row.model ?? undefined,
    tokensUsed: row.tokens_used ?? undefined,
    createdAt: row.created_at,
  }));
}

export async function fetchModelCatalog(): Promise<ModelCatalogEntry[]> {
  const client = ensureSupabase();
  const { data, error } = await client
    .from("model_catalog")
    .select(
      "id, display_name, provider, supports_vision, supports_reasoning, is_free, provider_input_cost_per_m_token, provider_output_cost_per_m_token, app_input_cost_per_m_token, app_output_cost_per_m_token, context_window, max_output, description, is_active",
    )
    .eq("is_active", true)
    .order("display_name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    displayName: row.display_name,
    provider: row.provider,
    modality: row.supports_vision ? "text+image" : "text",
    supportsReasoning: row.supports_reasoning ?? false,
    isFree: row.is_free ?? false,
    inputCostPerMToken: Number(row.provider_input_cost_per_m_token ?? 0),
    outputCostPerMToken: Number(row.provider_output_cost_per_m_token ?? 0),
    appInputCostPerMToken: Number(row.app_input_cost_per_m_token ?? 0),
    appOutputCostPerMToken: Number(row.app_output_cost_per_m_token ?? 0),
    contextWindow: row.context_window ?? 0,
    maxOutput: row.max_output ?? 0,
    description: row.description ?? "",
    isActive: row.is_active ?? true,
  }));
}

export async function createConversation(userId: string, modelId: string): Promise<Conversation> {
  const client = ensureSupabase();
  const { data, error } = await client
    .from("conversations")
    .insert({
      user_id: userId,
      title: "New chat",
      model: modelId,
      preview: "",
      token_count: 0,
    })
    .select("id, title, model, preview, token_count, updated_at, is_archived")
    .single();

  if (error) {
    throw error;
  }

  return {
    id: data.id,
    title: data.title ?? "New chat",
    model: data.model,
    preview: data.preview ?? "",
    tokenCount: data.token_count ?? 0,
    updatedAt: data.updated_at,
    isArchived: data.is_archived ?? false,
  };
}

export async function insertUserMessage(
  userId: string,
  conversationId: string,
  content: string,
  hasAttachment: boolean,
  attachments?: Message["attachments"],
) {
  const client = ensureSupabase();
  const persistable = attachments?.length
    ? attachments.map((att) => ({
        id: att.id,
        name: att.name,
        type: att.type,
        remoteUrl: att.remoteUrl,
        mimeType: att.mimeType,
        sizeBytes: att.sizeBytes,
      }))
    : null;

  const { data, error } = await client
    .from("messages")
    .insert({
      conversation_id: conversationId,
      user_id: userId,
      role: "user",
      content,
      has_attachment: hasAttachment,
      attachments: persistable,
    })
    .select("id, conversation_id, role, content, model, has_attachment, attachments, created_at")
    .single();

  if (error) {
    throw error;
  }

  return {
    id: data.id,
    conversationId: data.conversation_id,
    role: data.role as Message["role"],
    content: data.content,
    model: data.model ?? undefined,
    hasAttachment: data.has_attachment ?? false,
    attachments: Array.isArray(data.attachments)
      ? (data.attachments as Message["attachments"])
      : undefined,
    createdAt: data.created_at,
  };
}

export async function deleteMessagesAfter(
  conversationId: string,
  afterCreatedAt: string,
  includeBoundary = false,
) {
  const client = ensureSupabase();
  const builder = client.from("messages").delete().eq("conversation_id", conversationId);
  const { error } = await (includeBoundary
    ? builder.gte("created_at", afterCreatedAt)
    : builder.gt("created_at", afterCreatedAt));

  if (error) {
    throw error;
  }
}

export async function updateMessageContent(messageId: string, content: string) {
  const client = ensureSupabase();
  const { error } = await client
    .from("messages")
    .update({ content })
    .eq("id", messageId);

  if (error) {
    throw error;
  }
}

export async function updateConversationSummary(
  conversationId: string,
  preview: string,
  modelId: string,
  tokenCount: number,
) {
  const client = ensureSupabase();
  const { error } = await client
    .from("conversations")
    .update({
      preview,
      model: modelId,
      token_count: tokenCount,
      updated_at: new Date().toISOString(),
      title: preview.slice(0, 48),
    })
    .eq("id", conversationId);

  if (error) {
    throw error;
  }
}
