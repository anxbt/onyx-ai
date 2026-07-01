# OnyxAI — Technical Specification

> **Version:** 2.0
> **Date:** May 2026
> **Status:** In Development
> **Stack:** React Native · Expo SDK 55 · Supabase · Cloudflare Workers · OpenRouter

---

## 1. Project Overview

OnyxAI is a native Android application providing a premium conversational AI experience powered by open-source and frontier models via OpenRouter. Differentiated by model switching, persistent memory, transparent pay-as-you-go credits, and proper formatting.

### Design Principles
- **Mobile-first, Android-first.** Every decision optimizes for Android. iOS is v2.
- **Dark mode only.** `#0A0A0A` background, `#7C3AED` accent. No light mode.
- **No premature abstraction.** Ship simple, refactor when needed.
- **Supabase is the backend.** CRUD via Supabase, only Workers for sensitive proxy logic.
- **OpenRouter is the gateway.** Never call providers directly from client.
- **Cost-transparency first.** Every user sees per-message cost in real time.

---

## Table of Contents

1. [Architecture](#2-architecture)
2. [Environment](#3-environment)
3. [Database Schema](#4-database-schema)
4. [Authentication](#5-authentication)
5. [API Layer — Cloudflare Workers](#6-api-layer)
6. [OpenRouter Integration](#7-openrouter)
7. [Memory System](#8-memory)
8. [Credit System](#9-credits)
9. [Chat History & Context Window](#10-chat-history)
10. [File, Image & RAG Handling](#11-file-image-rag)
11. [Search & Internet Access](#12-search)
12. [Markdown Rendering](#13-markdown)
13. [Streaming](#14-streaming)
14. [Screens](#15-screens)
15. [Build & Deploy](#16-build-deploy)

---

## 2. Architecture

```
Expo App (React Native)
├── Supabase (Auth + DB + Storage + Vector Search)
└── Cloudflare Worker (OpenRouter proxy + billing + embeddings + search)
```

### 2.1 Wave-Based Implementation

| Wave | Feature | Status | Validation |
|------|---------|--------|------------|
| **Wave 0** | Markdown Rendering + Syntax Highlighting | 🔄 Next | Code blocks render with dark theme and colors |
| **Wave 1** | Context Window Management | 📋 Planned | Long chats don't send all history; sliding window + summaries |
| **Wave 2** | Streaming Response | 📋 Planned | Real-time token streaming with SSE |
| **Wave 3** | Image & File Uploads | 📋 Planned | Camera, gallery, PDF upload with Supabase Storage |
| **Wave 4** | Semantic Memory & Retrieval | 📋 Planned | Embed messages and memory_facts, retrieve relevant |
| **Wave 5** | Brave Search & Internet Access | 📋 Planned | Auto/manual search with source cards |
| **Wave 6** | Document RAG (Chunking) | 📋 Planned | Chunk large docs, retrieve relevant sections |
| **Wave 7** | Structured Output / Artifacts | 📋 Planned | Resume templates, PPT, PDF export (client-side) |

---

## 3. Environment Variables
How well is our memory system working?

Because in wave 6, we have thought of implementing RAG, and in wave 4, we have thought of implementing semantic memory plus retrieval.
### Mobile `.env`
```bash
EXPO_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
EXPO_PUBLIC_WORKER_URL=https://onyxai.workers.dev
EXPO_PUBLIC_RAZORPAY_KEY_ID=rzp_live_xxxxx
```

### Worker Secrets
```bash
wrangler secret put OPENROUTER_API_KEY
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put SUPABASE_URL
wrangler secret put RAZORPAY_KEY_SECRET
wrangler secret put BRAVE_API_KEY          # for search
```

---

## 4. Database Schema

### 4.1 Core Tables

```sql
-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── user_profiles ─────────────────────────────────────────────────────────
CREATE TABLE user_profiles (
  id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name      TEXT,
  credit_balance    DECIMAL(10,4) NOT NULL DEFAULT 0,
  total_tokens_used INTEGER NOT NULL DEFAULT 0,
  preferred_model   TEXT NOT NULL DEFAULT 'qwen/qwen3.6-plus',
  is_superuser      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── conversations ─────────────────────────────────────────────────────────
CREATE TABLE conversations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL DEFAULT 'New Conversation',
  model         TEXT NOT NULL DEFAULT 'deepseek/deepseek-v3.2',
  token_count   INTEGER NOT NULL DEFAULT 0,
  preview       TEXT,
  is_archived   BOOLEAN NOT NULL DEFAULT FALSE,
  search_enabled BOOLEAN NOT NULL DEFAULT TRUE, -- per-conversation search toggle
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversations_user_updated ON conversations(user_id, updated_at DESC);

-- ─── messages ──────────────────────────────────────────────────────────────
CREATE TABLE messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role              TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content           TEXT NOT NULL,
  tokens_used       INTEGER NOT NULL DEFAULT 0,
  model             TEXT,
  has_attachment    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  embedding         VECTOR(384)  -- for semantic retrieval (Wave 4)
);

CREATE INDEX idx_messages_conversation_created ON messages(conversation_id, created_at ASC);
CREATE INDEX idx_messages_embedding ON messages USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ─── conversation_summaries ─────────────────────────────────────────────────
-- Wave 1: rolling summaries of old message blocks
CREATE TABLE conversation_summaries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_start_idx INTEGER NOT NULL, -- inclusive
  message_end_idx   INTEGER NOT NULL, -- inclusive
  summary_text      TEXT NOT NULL,
  key_facts         JSONB DEFAULT '[]', -- extracted facts from this block
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_summaries_conversation ON conversation_summaries(conversation_id, message_end_idx);

-- ─── uploads ─────────────────────────────────────────────────────────────────
-- Wave 3: images, PDFs, files stored in Supabase Storage
CREATE TABLE uploads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id   UUID REFERENCES conversations(id) ON DELETE SET NULL,
  storage_path      TEXT NOT NULL,
  filename          TEXT NOT NULL,
  mime_type         TEXT NOT NULL,
  size_bytes        INTEGER,
  content_type      TEXT, -- 'text', 'diagram', 'photo', 'screenshot', 'whiteboard', 'pdf', 'code'
  description       TEXT, -- AI-generated description
  transcribed_text  TEXT, -- extracted text if applicable
  embedding         VECTOR(384), -- for semantic search of uploads
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_uploads_user ON uploads(user_id, created_at DESC);
CREATE INDEX idx_uploads_embedding ON uploads USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ─── memory_facts ──────────────────────────────────────────────────────────
CREATE TABLE memory_facts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content                 TEXT NOT NULL,
  category                TEXT NOT NULL CHECK (category IN ('learning', 'preference', 'project', 'personal')),
  embedding               VECTOR(384),         -- changed from 1536 (Wave 4)
  confidence              REAL NOT NULL DEFAULT 1.0 CHECK (confidence BETWEEN 0 AND 1),
  source_conversation_id  UUID REFERENCES conversations(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, content)
);

CREATE INDEX idx_memory_facts_user ON memory_facts(user_id, updated_at DESC);
CREATE INDEX idx_memory_facts_embedding ON memory_facts USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ─── search_results ────────────────────────────────────────────────────────
-- Wave 5: Brave Search results stored for cross-conversation memory
CREATE TABLE search_results (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id   UUID REFERENCES conversations(id) ON DELETE SET NULL,
  query             TEXT NOT NULL,
  results           JSONB NOT NULL, -- Brave API response
  summary           TEXT, -- 1-sentence model summary
  topics            JSONB, -- extracted topics
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_search_results_user ON search_results(user_id, created_at DESC);

-- ─── document_chunks ───────────────────────────────────────────────────────
-- Wave 6: chunked documents for RAG
CREATE TABLE document_chunks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id         UUID NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  chunk_text        TEXT NOT NULL,
  chunk_index       INTEGER NOT NULL,
  embedding         VECTOR(384),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chunks_upload ON document_chunks(upload_id, chunk_index);
CREATE INDEX idx_chunks_embedding ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ─── credit_transactions ───────────────────────────────────────────────────
CREATE TABLE credit_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount            DECIMAL(10,4) NOT NULL,
  type              TEXT NOT NULL CHECK (type IN ('topup', 'usage')),
  model             TEXT,
  conversation_id   UUID REFERENCES conversations(id) ON DELETE SET NULL,
  message_id        UUID REFERENCES messages(id) ON DELETE SET NULL,
  tokens_used       INTEGER,
  idempotency_key   TEXT UNIQUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_credit_transactions_user ON credit_transactions(user_id, created_at DESC);

-- ─── usage_events (detailed billing) ────────────────────────────────────────
CREATE TABLE usage_events (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL,
  conversation_id         UUID NOT NULL,
  message_id                UUID NOT NULL,
  model                     TEXT NOT NULL,
  prompt_tokens             INTEGER NOT NULL DEFAULT 0,
  completion_tokens         INTEGER NOT NULL DEFAULT 0,
  total_tokens              INTEGER NOT NULL DEFAULT 0,
  provider_input_cost_usd   DECIMAL(12,8) NOT NULL DEFAULT 0,
  provider_output_cost_usd  DECIMAL(12,8) NOT NULL DEFAULT 0,
  provider_total_cost_usd   DECIMAL(12,8) NOT NULL DEFAULT 0,
  charged_total_cost_inr    DECIMAL(10,2) NOT NULL DEFAULT 0,
  frontier_model            TEXT NOT NULL,
  frontier_cost_usd         DECIMAL(12,8) NOT NULL DEFAULT 0,
  savings_vs_frontier_usd   DECIMAL(12,8) NOT NULL DEFAULT 0,
  deduction_bypassed        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usage_events_user ON usage_events(user_id, created_at DESC);

-- ─── Full-text search on conversations ────────────────────────────────────
ALTER TABLE conversations
  ADD COLUMN search_vector TSVECTOR
  GENERATED ALWAYS AS (
    to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(preview, ''))
  ) STORED;

CREATE INDEX idx_conversations_search ON conversations USING GIN(search_vector);
```

### 4.2 RPC Functions

```sql
-- Wave 4: Semantic search over messages in a conversation
CREATE OR REPLACE FUNCTION match_messages(
  query_embedding vector(384),
  conv_id UUID,
  match_threshold float,
  match_count int
)
RETURNS TABLE(id UUID, role TEXT, content TEXT, similarity float) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.role,
    m.content,
    1 - (m.embedding <=> query_embedding) AS similarity
  FROM messages m
  WHERE m.conversation_id = conv_id
    AND m.embedding IS NOT NULL
    AND 1 - (m.embedding <=> query_embedding) > match_threshold
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Wave 4: Semantic search over memory_facts
CREATE OR REPLACE FUNCTION match_memory_facts(
  query_embedding vector(384),
  p_user_id UUID,
  match_threshold float,
  match_count int
)
RETURNS TABLE(id UUID, content TEXT, category TEXT, similarity float) AS $$
BEGIN
  RETURN QUERY
  SELECT
    mf.id,
    mf.content,
    mf.category,
    1 - (mf.embedding <=> query_embedding) AS similarity
  FROM memory_facts mf
  WHERE mf.user_id = p_user_id
    AND mf.embedding IS NOT NULL
    AND 1 - (mf.embedding <=> query_embedding) > match_threshold
  ORDER BY mf.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Wave 6: Semantic search over document chunks
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector(384),
  p_upload_id UUID,
  match_threshold float,
  match_count int
)
RETURNS TABLE(id UUID, chunk_text TEXT, chunk_index INTEGER, similarity float) AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.chunk_text,
    dc.chunk_index,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM document_chunks dc
  WHERE dc.upload_id = p_upload_id
    AND dc.embedding IS NOT NULL
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;
```

### 4.3 RLS Policies

```sql
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own profile" ON user_profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "users manage own conversations" ON conversations FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users manage own messages" ON messages FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users manage own memory" ON memory_facts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users manage own uploads" ON uploads FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users read own search results" ON search_results FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users read own chunks" ON document_chunks FOR SELECT USING (
  EXISTS (SELECT 1 FROM uploads u WHERE u.id = document_chunks.upload_id AND u.user_id = auth.uid())
);
CREATE POLICY "users view own transactions" ON credit_transactions FOR SELECT USING (auth.uid() = user_id);
```

---

## 5. Authentication

Same as v1. Supabase Auth with email/password and Google OAuth. JWT passed to Worker in Authorization header. Worker verifies via `supabase.auth.getUser()`.

---

## 6. API Layer — Cloudflare Workers

### 6.1 Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/chat` | JWT | Main chat (Wave 2: streaming) |
| POST | `/chat/summarize` | JWT | Background summarization (Wave 1) |
| POST | `/embed` | JWT | Text → embedding (Wave 4) |
| POST | `/memory/extract` | JWT | Extract facts from conversation (Wave 4) |
| POST | `/upload/analyze` | JWT | Image caption / text extraction (Wave 3) |
| POST | `/search` | JWT | Brave Search proxy (Wave 5) |
| POST | `/payments/webhook` | Signature | Razorpay webhook |

### 6.2 Chat Endpoint (Wave 2 — Streaming)

```typescript
// worker/src/chat.ts
export async function handleChat(c: Context<HonoEnv>) {
  const env = c.env;
  const userId = c.get("userId");
  const body = await c.req.json();

  // 1. Credit check
  const balance = await getBalance(env, userId);
  const model = getModelConfig(body.model);
  if (!model.isFree && balance <= 0) {
    return c.json({ error: "insufficient_credits" }, 402);
  }

  // 2. Build messages with context window management
  const messages = await buildMessagesWithContext(body.conversationId, body.messages, model);

  // 3. Optional: search augmentation (Wave 5)
  if (body.enableSearch) {
    const searchResults = await braveSearch(body.messages.at(-1)?.content ?? "", env.BRAVE_API_KEY);
    messages.unshift({ role: "system", content: formatSearchContext(searchResults) });
  }

  // 4. Stream from OpenRouter
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
      messages,
      stream: true,
      max_tokens: model.maxOutput,
    }),
  });

  // 5. Transform SSE stream to client
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  let fullContent = "";
  let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  (async () => {
    const reader = orResponse.body!.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));
      for (const line of lines) {
        const data = line.slice(6);
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) fullContent += delta;
          if (parsed.usage) usage = parsed.usage;
          await writer.write(encoder.encode(line + "\n"));
        } catch {}
      }
    }
    await writer.close();

    // Record usage after stream
    await recordUsage({ userId, model: model.id, conversationId: body.conversationId, content: fullContent, usage, env });
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
```

---

## 7. OpenRouter Integration

### 7.1 Model Definitions (Updated IDs)

```typescript
// constants/models.ts
export const MODELS: ModelConfig[] = [
  {
    id: "qwen/qwen3.6-plus",
    displayName: "Qwen3.6 Plus",
    provider: "Alibaba",
    supportsVision: true,
    supportsReasoning: true,
    isFree: false,
    inputCostPerMToken: 0.325,
    outputCostPerMToken: 1.95,
    contextWindow: 1000000,
    maxOutput: 65536,
    description: "Default model. Strong multimodal chat and reasoning.",
  },
  {
    id: "google/gemini-2.5-flash-lite",
    displayName: "Gemini Flash Lite",
    provider: "Google",
    supportsVision: true,
    supportsReasoning: false,
    isFree: false,
    inputCostPerMToken: 0.1,
    outputCostPerMToken: 0.4,
    contextWindow: 1000000,
    maxOutput: 64000,
    description: "Fast and cheap. Best for everyday conversation.",
  },
  {
    id: "deepseek/deepseek-v3.2",
    displayName: "DeepSeek Smart",
    provider: "DeepSeek",
    supportsVision: false,
    supportsReasoning: true,
    isFree: false,
    inputCostPerMToken: 0.35,
    outputCostPerMToken: 1.4,
    contextWindow: 131072,
    maxOutput: 16384,
    description: "Default paid model. Strong reasoning, great value.",
  },
  {
    id: "qwen/qwen3-6-plus",
    displayName: "Qwen Plus",
    provider: "Alibaba",
    supportsVision: true,
    supportsReasoning: true,
    isFree: false,
    inputCostPerMToken: 0.5,
    outputCostPerMToken: 2,
    contextWindow: 131072,
    maxOutput: 16384,
    description: "Balanced. Handles images and complex tasks well.",
  },
  {
    id: "zai-org/glm-5.1",
    displayName: "GLM-5.1 Frontier",
    provider: "Zhipu AI",
    supportsVision: true,
    supportsReasoning: true,
    isFree: false,
    inputCostPerMToken: 1.05,
    outputCostPerMToken: 4.2,
    contextWindow: 200000,
    maxOutput: 128000,
    description: "Frontier quality. Competes with Claude Opus on coding.",
  },
];

export const DEFAULT_MODEL_ID = "qwen/qwen3.6-plus";
```

### 7.2 Background Task Models

| Task | Model | Why |
|------|-------|-----|
| Summarization (Wave 1) | `nvidia/nemotron-3-nano-30b-a3b:free` | Free, general-purpose, not coding-biased |
| Embeddings (Wave 4) | `sentence-transformers/all-MiniLM-L6-v2` | Free via OpenRouter, Tell me exactly why we need the Wave 6. Please give me a use case where we would use it and where its presence would really make sense.-dim, fast |
| Image captioning (Wave 3) | `google/gemini-2.5-flash-lite` | Cheap vision, excellent at description |
| Memory extraction (Wave 4) | `google/gemini-2.5-flash-lite` | Cheap, good at structured JSON output |

---

## 8. Memory System

### 8.1 Extraction (Wave 4 — Unchanged from v1)

Same extraction prompt, but now uses `gemini-2.5-flash-lite` instead of MiniMax for better JSON reliability.

### 8.2 Retrieval (Wave 4 — Semantic, not Recency)

```typescript
// lib/memory.ts — REVISED
export async function getMemorySystemPrompt(userId: string, query: string): Promise<string> {
  // 1. Get embedding for current query
  const embedding = await getEmbedding(query);

  // 2. Semantic search — only relevant facts
  const { data: facts } = await supabase.rpc("match_memory_facts", {
    query_embedding: embedding,
    p_user_id: userId,
    match_threshold: 0.72,
    match_count: 8,
  });

  if (!facts?.length) return "";

  const factLines = facts
    .map((f: any) => `- [${f.category}] ${f.content}`)
    .join("\n");

  return `You are OnyxAI. Here is what you know about the user from previous conversations:\n${factLines}\n\nUse this context naturally.`;
}
```

---

## 9. Credit System

Unchanged from v1. Same markup (1.4×), INR conversion, atomic deduction via `record_usage_and_charge` RPC.

---

## 10. Chat History & Context Window

### 10.1 The Problem

Current `lib/tokens.ts` sends **every message** to the API. At 20 turns with long responses, this is 15,000+ tokens per query. A 50-turn conversation becomes prohibitively expensive.

### 10.2 Solution: Summarize-and-Protect (Wave 1)

Three layers of memory:

**Layer 1: Ephemeral Window (Always Sent)**
Last 8 messages are always included verbatim. Preserves immediate conversational flow.

**Layer 2: Rolling Summaries (Background)**
Every 10 messages, fire-and-forget call to `/chat/summarize` using cheap model. Summarizes messages 1-10, stores in `conversation_summaries`. Injected as system context on subsequent turns.

**Layer 3: Semantic Retrieval (Safety Net)**
Embed user's new query, search `messages` table in this conversation for semantically relevant old messages. Retrieve top 3 and inject with `[Earlier in conversation]` prefix.

### 10.3 Implementation

```typescript
// lib/tokens.ts — REVISED for Wave 1
const EPHEMERAL_WINDOW = 8;
const SUMMARIZE_EVERY = 10;
const CHARS_PER_TOKEN = 4;

export async function buildMessagesArray(
  conversationId: string,
  newUserContent: string,
  modelContextWindow: number,
): Promise<{ role: string; content: string }[]> {
  const db = supabase;

  // 1. Fetch summaries for this conversation
  const { data: summaries } = await db
    .from("conversation_summaries")
    .select("summary_text, key_facts")
    .eq("conversation_id", conversationId)
    .order("message_end_idx", { ascending: true });

  // 2. Fetch recent messages (verbatim)
  const { data: recentMessages } = await db
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(EPHEMERAL_WINDOW);

  // 3. Semantic retrieval: find relevant old messages
  const { data: relevantOldMessages } = await db.rpc("match_messages", {
    query_embedding: await getEmbedding(newUserContent),
    conv_id: conversationId,
    match_threshold: 0.78,
    match_count: 3,
  });

  // 4. Build system prompt with summaries
  const systemContext = buildSystemContext(summaries, relevantOldMessages);

  // 5. Assemble, respecting token budget
  return assembleWithBudget(
    systemContext,
    recentMessages?.reverse() ?? [],
    newUserContent,
    modelContextWindow,
  );
}

function buildSystemContext(summaries: any[], relevantMessages: any[]) {
  const parts: string[] = [];

  if (summaries?.length) {
    parts.push("[Conversation history summaries]");
    for (const s of summaries) {
      parts.push(`Messages ${s.message_start_idx}-${s.message_end_idx}: ${s.summary_text}`);
      if (s.key_facts?.length) {
        parts.push(`Key facts: ${s.key_facts.join("; ")}`);
      }
    }
  }

  if (relevantMessages?.length) {
    parts.push("[Relevant context from earlier in this conversation]");
    for (const m of relevantMessages) {
      parts.push(`${m.role}: ${m.content}`);
    }
  }

  return parts.join("\n\n");
}

function assembleWithBudget(
  systemContext: string,
  recentMessages: { role: string; content: string }[],
  newContent: string,
  budget: number,
) {
  const systemTokens = estimateTokens(systemContext);
  const newTokens = estimateTokens(newContent);
  const recentTokens = recentMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0);

  // Reserve 20% of budget for the model's response
  const usableBudget = Math.floor(budget * 0.8);
  const totalNeeded = systemTokens + recentTokens + newTokens;

  if (totalNeeded > usableBudget && recentMessages.length > 4) {
    // Trim oldest from ephemeral window until we fit
    const trimmed = [...recentMessages];
    while (estimateTokens(systemContext) + trimmed.reduce((s, m) => s + estimateTokens(m.content), 0) + newTokens > usableBudget && trimmed.length > 4) {
      trimmed.shift();
    }
    return [
      { role: "system", content: systemContext },
      ...trimmed.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: newContent },
    ];
  }

  return [
    { role: "system", content: systemContext },
    ...recentMessages.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: newContent },
  ];
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN));
}

export function shouldSummarize(messageCount: number): boolean {
  return messageCount > 0 && messageCount % SUMMARIZE_EVERY === 0;
}
```

### 10.4 Cost Comparison

| Approach | Tokens/query (50-turn convo) | Cost (DeepSeek V3) |
|----------|------------------------------|-------------------|
| Naive (current) | 15,000+ | ₹0.24/query |
| Sliding window only | 4,000 | ₹0.06/query |
| **Summarize-and-Protect** | **4,500** | **₹0.07/query** |

---

## 11. File & Image Handling

### 11.1 Architecture

**Supabase Storage** is the object store. Same auth as the database. RLS policies enforce user-scoped access. Free tier: 1GB.

| Bucket | Visibility | Purpose |
|--------|-----------|---------|
| `chat-images` | Public URL | Images sent to vision models |
| `chat-files` | Private (RLS) | PDFs, text files, documents |

### 11.2 Image Upload Flow (Wave 3)

```
User taps camera icon
  → expo-image-picker launches
  → expo-image-manipulator resizes to max 1024px, JPEG 0.75
  → Upload to Supabase Storage chat-images/{userId}/{timestamp}.jpg
  → Get public URL
  → Send message with image_url (public URL, not base64)
  → Show thumbnail preview in AttachmentPreview
```

**Why public URL not base64:**
- Base64 bloats the prompt with ~500KB of text per image
- URL costs ~10 tokens regardless of image size
- OpenRouter charges by image resolution, not encoding method
- The image provider (Google, etc.) fetches the URL directly

### 11.3 Background Understanding (Wave 3)

After upload, Worker calls cheapest vision model asynchronously:

```
System: Describe this image in detail. If it contains text, transcribe it.
If it's a diagram, explain what it depicts. Output JSON:
{ "type": "text|diagram|photo|screenshot|whiteboard", "description": "...", "transcribed_text": "..." }
```

Store result in `uploads` table. This enables:
- Semantic search: "Find that whiteboard photo from last week"
- Text extraction from book pages without re-sending the image
- Future retrieval even if the conversation is old

### 11.4 File Upload Flow (Wave 3)

```
User picks PDF via expo-document-picker
  → Upload to Supabase Storage chat-files/{userId}/{fileId}
  → Worker reads file, extracts text (PDF parsing library)
  → Store extracted text in uploads.transcribed_text
  → For large PDFs: also chunk and store in document_chunks (Wave 6)
```

---

### 11.5 RAG Implementation (Wave 6)

#### When to Use RAG

| Document Size | Strategy | Why |
|--------------|----------|-----|
| **< 8K tokens** | Send full text | Cheaper than embedding + retrieval overhead |
| **8K–32K tokens** | Send full text (if model context allows) | Gemini Flash Lite has 1M context — just send it |
| **> 32K tokens** | Chunk + RAG | Must chunk; even Gemini can't fit a 100-page PDF |
| **Multiple documents** | Always RAG | Cross-document retrieval finds relevant sections |

**Decision rule:** If `document_tokens > model_context_window × 0.3`, use RAG. The 0.3 leaves room for conversation history, system prompt, and response.

#### Chunking Strategy: Hybrid Semantic

We use a **two-pass chunking** approach that beats naive fixed-size:

**Pass 1 — Structure-Aware Splitting**
```
PDF / Markdown / Code
  → Detect headers, page breaks, code block boundaries
  → Split at natural boundaries (paragraphs, sections, functions)
  → Minimum chunk: 256 tokens, Maximum: 512 tokens
```

**Pass 2 — Semantic Re-chunking**
```
For each boundary chunk:
  → Embed the chunk
  → Compare cosine similarity with next chunk
  → If similarity > 0.85, merge them (they're the same topic)
  → If similarity < 0.55, split further at sentence level
```

This produces **variable-length semantic chunks** that align with topic boundaries, not arbitrary character counts.

| Strategy | Pros | Cons | Our Choice |
|----------|------|------|------------|
| Fixed-size (512 tokens, 50 overlap) | Simple, fast | Cuts mid-sentence, loses context | ❌ Not used |
| Recursive (paragraph → sentence → word) | Respects structure | Can create tiny chunks | ⚠️ Partial |
| Semantic (ours) | Topic-aligned, best retrieval | More compute upfront | ✅ Primary |
| Agentic (model decides chunks) | Optimal boundaries | Expensive, slow | ⚠️ For code only |

#### Chunk Overlap

- **Standard documents:** 10% overlap (e.g., 512-token chunks → 51-token overlap)
- **Code files:** 20% overlap — functions often reference variables declared earlier
- **Legal / contracts:** 0% overlap — every clause should stand alone

#### Retrieval Strategy

```
User asks: "What was the termination clause in the NDA?"
  → 1. Embed the query
  → 2. Search document_chunks for this upload_id
  → 3. Get top 5 chunks by cosine similarity
  → 4. Re-rank: boost chunks containing keywords from query
  → 5. Inject into system prompt:
```

```
[Document: NDA.pdf]
Relevant sections:
Section 7.3: "Either party may terminate this agreement with 30 days written notice..."
Section 12.1: "Upon termination, all confidential information must be returned..."
Section 3.2: "This agreement remains in effect for 12 months from the effective date..."
```

**Re-ranking boost:** If query contains "termination", chunks containing "terminate", "termination", "ended" get +0.1 similarity bump.

#### Implementation

```typescript
// worker/src/rag.ts
export async function chunkAndEmbedDocument(
  uploadId: string,
  text: string,
  env: Env
): Promise<void> {
  // 1. Structure-aware split
  const rawChunks = splitByStructure(text, { minTokens: 256, maxTokens: 512 });

  // 2. Semantic re-chunking
  const semanticChunks = await semanticRechunk(rawChunks, env);

  // 3. Embed each chunk
  for (let i = 0; i < semanticChunks.length; i++) {
    const chunk = semanticChunks[i];
    const embedding = await getEmbedding(chunk.text, env.OPENROUTER_API_KEY);

    await supabase.from("document_chunks").insert({
      upload_id: uploadId,
      chunk_text: chunk.text,
      chunk_index: i,
      embedding,
    });
  }
}

function splitByStructure(text: string, opts: { minTokens: number; maxTokens: number }): string[] {
  // Detect headers (^#{1,6} ), page breaks (\f), code blocks (```)
  const boundaries = /\n#{1,6}\s|\n\n|\f|```[a-z]*\n/g;
  const parts = text.split(boundaries);
  const chunks: string[] = [];
  let current = "";

  for (const part of parts) {
    if (estimateTokens(current + part) > opts.maxTokens && current.length > 0) {
      chunks.push(current.trim());
      current = part;
    } else {
      current += "\n" + part;
    }
    if (estimateTokens(current) >= opts.minTokens) {
      chunks.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

async function semanticRechunk(
  chunks: string[],
  env: Env
): Promise<{ text: string }[]> {
  if (chunks.length <= 1) return chunks.map((c) => ({ text: c }));

  const embeddings = await Promise.all(
    chunks.map((c) => getEmbedding(c, env.OPENROUTER_API_KEY))
  );

  const merged: string[] = [];
  let current = chunks[0];

  for (let i = 1; i < chunks.length; i++) {
    const sim = cosineSimilarity(embeddings[i - 1], embeddings[i]);
    if (sim > 0.85) {
      current += "\n\n" + chunks[i];
    } else {
      merged.push(current);
      current = chunks[i];
    }
  }
  merged.push(current);
  return merged.map((c) => ({ text: c }));
}
```

#### Cost Analysis

| Step | Tokens | Cost (embedding model) |
|------|--------|----------------------|
| Chunk 100-page PDF (~50K tokens) | 50,000 | $0.00 (free via OpenRouter) |
| Embed 100 chunks | 100 calls × 384-dim | $0.00 (free via OpenRouter) |
| Retrieval per query | 1 embedding call | $0.00 |
| **Total RAG overhead** | Negligible | **Effectively free** |

**vs. sending full document every query:** 50K tokens × ₹0.005/token = ₹250 per query. RAG pays for itself on the first query.

---

## 12. Search & Internet Access

### 12.1 Brave Search Integration (Wave 5)


```
User sends query
  → Worker checks if search is enabled for this conversation
  → If auto: model decides if search is needed via a cheap classification call
  → If force search: always call Brave API first
  → Brave Search API returns top 5 results
  → Worker formats results as [Search Results] context block
  → Include in prompt before calling OpenRouter
```

### 12.2 Search Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| **Auto** | Model decides if search needed | Default. "Explain RSA" → no search. "Latest NIST standard?" → searches |
| **Force** | Always search before answering | "Compare top 3 libraries for X" |
| **Off** | Never search | Deep theory where web results would dilute precision |

Stored per-conversation in `conversations.search_enabled`.

### 12.3 Source Cards

When search is used, show collapsible cards above response:
- URL + title + favicon
- Snippet preview
- Date (crucial for crypto/tech standards)
- Relevance indicator

Model response includes numbered citations `[1]` linking to cards.

### 12.4 Search Memory

```sql
-- search_results table (see §4)
```

Before answering in any conversation, check: *"Has this user searched for related topics before?"* If yes, inject summary: *"You previously researched NIST PQC standards (3 days ago). CRYSTALS-Kyber was approved as FIPS 203."*

---

## 13. Markdown Rendering

### 13.1 Current State (BROKEN)

`components/chat/MarkdownRenderer.tsx` currently just wraps text in `<Text>`. No parsing. Code blocks show raw backticks. Bold shows `**text**`. Lists show `- item`.

### 13.2 Wave 0: Fix

Install `react-native-markdown-display` for parsing + custom renderers.

```typescript
// components/chat/MarkdownRenderer.tsx
import Markdown from "react-native-markdown-display";
import { useTheme } from "@/constants/colors";

const customStyles = {
  body: { color: Colors.textPrimary, fontSize: 15, lineHeight: 22 },
  code_inline: {
    backgroundColor: Colors.surface,
    borderRadius: 4,
    paddingHorizontal: 4,
    fontFamily: "JetBrainsMono",
    fontSize: 13,
  },
  code_block: {
    backgroundColor: "#1a1a2e",
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
    fontFamily: "JetBrainsMono",
    fontSize: 13,
    color: "#e0e0e0",
  },
  fence: {
    backgroundColor: "#1a1a2e",
    borderRadius: 8,
    padding: 12,
  },
  heading1: { fontSize: 22, fontWeight: "700", marginVertical: 12 },
  heading2: { fontSize: 18, fontWeight: "600", marginVertical: 10 },
  bullet_list: { marginLeft: 8 },
  ordered_list: { marginLeft: 8 },
  link: { color: Colors.accent, textDecorationLine: "underline" },
};

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <Markdown style={customStyles}>
      {content}
    </Markdown>
  );
}
```

### 13.3 Code Syntax Highlighting

For fenced code blocks, use `react-native-syntax-highlighter` with a dark theme (monokai or custom).

```typescript
// In the fence renderer
import SyntaxHighlighter from "react-native-syntax-highlighter";
import { monokai } from "react-native-syntax-highlighter/styles/hljs";

<SyntaxHighlighter
  language={language || "text"}
  style={monokai}
  fontSize={13}
  highlighter={"hljs"}
>
  {code}
</SyntaxHighlighter>
```

### 13.4 Streaming Markdown

During streaming, detect unclosed code fences and temporarily close them for rendering:

```typescript
function fixPartialMarkdown(text: string): string {
  const openFences = (text.match(/```/g) || []).length;
  if (openFences % 2 === 1) {
    return text + "\n```";
  }
  return text;
}
```

---

## 14. Streaming

### 14.1 Worker (SSE)

Already described in §6.2. Key points:
- `stream: true` in OpenRouter request
- `TransformStream` pipes chunks to client
- Token usage recorded after `[DONE]`

### 14.2 Client (SSE Reader)

```typescript
// lib/openrouter.ts — REVISED for Wave 2
export async function streamChatFromWorker({
  accessToken,
  conversationId,
  messages,
  modelId,
  onChunk,
}: {
  accessToken: string;
  conversationId: string;
  messages: Message[];
  modelId: string;
  onChunk: (text: string) => void;
}) {
  const workerUrl = process.env.EXPO_PUBLIC_WORKER_URL;
  const res = await fetch(`${workerUrl}/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `${conversationId}:${Date.now()}`,
    },
    body: JSON.stringify({ conversationId, model: modelId, messages }),
  });

  if (!res.ok) throw new Error(`Worker error: ${res.status}`);

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));
    for (const line of lines) {
      const data = line.slice(6);
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content ?? "";
        accumulated += delta;
        onChunk(accumulated);
      } catch {}
    }
  }

  return accumulated;
}
```

---

## 15. Screens

Same as v1 (see original spec §12). Key additions:

- **Chat Screen**: Add search toggle in InputBar (Auto/Force/Off)
- **History Screen**: Search overlay with full-text search on `search_vector`
- **Settings Screen**: Add "Default Search Mode" setting

---

## 16. Build & Deployment

Same as v1:
```bash
cd worker && wrangler deploy
expo build:android
```

---

## Honest Gaps (Not Yet Built)

1. Wave 0: Markdown rendering is placeholder text
2. Wave 1: Context window sends all messages, no summarization
3. Wave 2: Chat is non-streaming (full response returned)
4. Wave 3: Attach and web buttons in composer are visual only
5. Wave 4: Memory dumps all facts, no semantic retrieval
6. Wave 5: No internet access
7. Wave 6: No document chunking
8. Wave 7: No structured output / resume generation

---

## Wave Implementation Order

```
Wave 0 → Markdown Rendering (immediate UX fix)
Wave 1 → Context Window Management (cost control foundation)
Wave 2 → Streaming (real-time feel)
Wave 3 → Image & File Uploads (core use case)
Wave 4 → Semantic Memory & Retrieval (intelligence)
Wave 5 → Brave Search (internet access)
Wave 6 → Document RAG (large document handling)
Wave 7 → Structured Output / Artifacts (PDF, PPT, resumes)
```

Start with Wave 0. It requires no backend changes — pure client-side, immediate user-visible improvement. Then Wave 1, which is the foundation for all subsequent cost-sensitive features.
