# OnyxAI — Technical Specification

> **Version:** 1.0  
> **Author:** Rishav (anxbt)  
> **Date:** May 2026  
> **Status:** Draft  
> **Stack:** React Native · Expo SDK 55 · Supabase · Cloudflare Workers · OpenRouter  

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Repository Structure](#2-repository-structure)
3. [Environment Variables](#3-environment-variables)
4. [Database Schema](#4-database-schema)
5. [Authentication](#5-authentication)
6. [API Layer — Cloudflare Workers](#6-api-layer--cloudflare-workers)
7. [OpenRouter Integration](#7-openrouter-integration)
8. [Memory System](#8-memory-system)
9. [Credit System](#9-credit-system)
10. [File and Image Handling](#10-file-and-image-handling)
11. [Context Window Management](#11-context-window-management)
12. [Screen Specifications](#12-screen-specifications)
13. [Component Library](#13-component-library)
14. [Navigation Structure](#14-navigation-structure)
15. [State Management](#15-state-management)
16. [Push Notifications](#16-push-notifications)
17. [Error Handling](#17-error-handling)
18. [Testing Strategy](#18-testing-strategy)
19. [Build and Deployment](#19-build-and-deployment)
20. [Analytics and Observability](#20-analytics-and-observability)

---

## 1. Project Overview

OnyxAI is a native Android application (iOS deferred to v2) that provides a premium conversational AI experience powered by open-source and Chinese frontier models via OpenRouter. The product is a direct competitor to the Claude and ChatGPT mobile apps, differentiated by:

- Model switching across 5 curated open-weight models
- Persistent cross-conversation memory via pgvector semantic retrieval
- Transparent pay-as-you-go credit system (no subscription)
- File and image upload including camera capture
- Full markdown rendering with code block syntax highlighting

### Design Principles

- **Mobile-first, Android-first.** Every decision optimises for Android. iOS is a later concern.
- **Dark mode only in v1.** `#0A0A0A` background, `#7C3AED` accent. No light mode toggle.
- **No premature abstraction.** Write the simplest code that ships. Refactor when pain is real.
- **Supabase is the backend.** No separate Node.js server for CRUD — only Cloudflare Workers for sensitive proxy logic.
- **OpenRouter is the model gateway.** Never call model providers directly from the client.

---

## 2. Repository Structure

```
onyxai/
├── app/                          # Expo Router — all screens
│   ├── (tabs)/
│   │   ├── _layout.tsx           # Bottom tab navigator
│   │   ├── index.tsx             # Chat screen (main)
│   │   └── history.tsx           # Conversation history
│   ├── auth/
│   │   ├── sign-in.tsx
│   │   └── sign-up.tsx
│   ├── memory.tsx                # Memory management screen
│   ├── credits.tsx               # Credits + top-up screen
│   ├── settings.tsx
│   └── _layout.tsx               # Root layout, auth guard
│
├── components/
│   ├── chat/
│   │   ├── MessageList.tsx       # FlashList wrapper
│   │   ├── MessageBubble.tsx     # User + assistant messages
│   │   ├── MarkdownRenderer.tsx  # Markdown → RN components
│   │   ├── InputBar.tsx          # Text input + attachment + send
│   │   ├── AttachmentPreview.tsx # Thumbnail before send
│   │   └── StreamingIndicator.tsx
│   ├── model/
│   │   ├── ModelSelector.tsx     # Bottom sheet
│   │   └── ModelBadge.tsx        # Active model chip
│   ├── memory/
│   │   ├── MemoryFactCard.tsx
│   │   └── MemoryIndicator.tsx   # "From memory" chip
│   ├── credits/
│   │   ├── CreditBalance.tsx
│   │   └── TopUpSheet.tsx
│   └── ui/
│       ├── BottomSheet.tsx       # Reusable bottom sheet
│       ├── Button.tsx
│       ├── Card.tsx
│       ├── Badge.tsx
│       └── EmptyState.tsx
│
├── lib/
│   ├── supabase.ts               # Supabase client singleton
│   ├── openrouter.ts             # OpenRouter streaming client
│   ├── memory.ts                 # Memory extraction + injection
│   ├── credits.ts                # Credit deduction logic
│   ├── tokens.ts                 # Token estimation utilities
│   └── models.ts                 # Model config + capabilities map
│
├── hooks/
│   ├── useChat.ts                # Core chat state + streaming
│   ├── useConversations.ts       # History CRUD
│   ├── useMemory.ts              # Memory facts CRUD
│   ├── useCredits.ts             # Balance + transactions
│   └── useAuth.ts                # Session management
│
├── store/
│   └── app.ts                    # Zustand global store
│
├── types/
│   └── index.ts                  # All shared TypeScript types
│
├── constants/
│   ├── models.ts                 # Model definitions
│   ├── colors.ts                 # Design tokens
│   └── config.ts                 # App-wide config values
│
├── worker/                       # Cloudflare Worker (separate deploy)
│   ├── src/
│   │   ├── index.ts              # Worker entry point + router
│   │   ├── chat.ts               # /chat endpoint
│   │   ├── memory.ts             # /memory/extract endpoint
│   │   ├── payments.ts           # /payments/webhook endpoint
│   │   └── auth.ts               # JWT verification middleware
│   └── wrangler.toml
│
├── supabase/
│   ├── migrations/               # SQL migration files
│   └── seed.sql
│
├── app.json
├── babel.config.js
├── tailwind.config.js            # NativeWind config
└── tsconfig.json
```

---

## 3. Environment Variables

### Mobile App `.env`

```bash
EXPO_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
EXPO_PUBLIC_WORKER_URL=https://onyxai.workers.dev
EXPO_PUBLIC_RAZORPAY_KEY_ID=rzp_live_xxxxx
```

> **Rule:** Never put `OPENROUTER_API_KEY` or `RAZORPAY_KEY_SECRET` in the mobile app env. These live exclusively in the Cloudflare Worker environment.

### Cloudflare Worker Secrets

```bash
wrangler secret put OPENROUTER_API_KEY
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put SUPABASE_URL
wrangler secret put RAZORPAY_KEY_SECRET
wrangler secret put OPENAI_API_KEY   # for text-embedding-3-small
```

---

## 4. Database Schema

All tables live in Supabase Postgres. Row Level Security (RLS) is enabled on every table. The mobile client uses the `anon` key — data isolation is enforced at the DB level, not the application level.

### 4.1 Migrations

Run in order via Supabase CLI:

```bash
supabase migration new init_schema
supabase db push
```

### 4.2 Full Schema

```sql
-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── user_profiles ─────────────────────────────────────────────────────────
CREATE TABLE user_profiles (
  id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name      TEXT,
  credit_balance    DECIMAL(10,4) NOT NULL DEFAULT 0,
  total_tokens_used INTEGER NOT NULL DEFAULT 0,
  preferred_model   TEXT NOT NULL DEFAULT 'deepseek/deepseek-v3.2',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own profile"
  ON user_profiles FOR ALL
  USING (auth.uid() = id);

-- Auto-create profile on sign up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── conversations ─────────────────────────────────────────────────────────
CREATE TABLE conversations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL DEFAULT 'New Conversation',
  model         TEXT NOT NULL,
  token_count   INTEGER NOT NULL DEFAULT 0,
  preview       TEXT,                         -- last message snippet, max 120 chars
  is_archived   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversations_user_updated
  ON conversations(user_id, updated_at DESC);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own conversations"
  ON conversations FOR ALL
  USING (auth.uid() = user_id);

-- ─── messages ──────────────────────────────────────────────────────────────
CREATE TABLE messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role              TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content           TEXT NOT NULL,
  tokens_used       INTEGER NOT NULL DEFAULT 0,
  model             TEXT,
  has_attachment    BOOLEAN NOT NULL DEFAULT FALSE,
  attachment_type   TEXT CHECK (attachment_type IN ('image', 'pdf', 'text', NULL)),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation_created
  ON messages(conversation_id, created_at ASC);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own messages"
  ON messages FOR ALL
  USING (auth.uid() = user_id);

-- ─── memory_facts ──────────────────────────────────────────────────────────
CREATE TABLE memory_facts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content                 TEXT NOT NULL,
  category                TEXT NOT NULL CHECK (
                            category IN ('learning', 'preference', 'project', 'personal')
                          ),
  embedding               VECTOR(1536),         -- text-embedding-3-small
  confidence              REAL NOT NULL DEFAULT 1.0 CHECK (confidence BETWEEN 0 AND 1),
  source_conversation_id  UUID REFERENCES conversations(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_memory_facts_user
  ON memory_facts(user_id, updated_at DESC);

-- pgvector cosine similarity index
CREATE INDEX idx_memory_facts_embedding
  ON memory_facts USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

ALTER TABLE memory_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own memory"
  ON memory_facts FOR ALL
  USING (auth.uid() = user_id);

-- ─── credit_transactions ───────────────────────────────────────────────────
CREATE TABLE credit_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount            DECIMAL(10,4) NOT NULL,     -- positive = topup, negative = spend
  type              TEXT NOT NULL CHECK (type IN ('topup', 'usage')),
  model             TEXT,
  conversation_id   UUID REFERENCES conversations(id) ON DELETE SET NULL,
  message_id        UUID REFERENCES messages(id) ON DELETE SET NULL,
  tokens_used       INTEGER,
  idempotency_key   TEXT UNIQUE,                -- prevent double-charge on retry
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_credit_transactions_user
  ON credit_transactions(user_id, created_at DESC);

ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users view own transactions"
  ON credit_transactions FOR SELECT
  USING (auth.uid() = user_id);
-- INSERT/UPDATE only via service role (Cloudflare Worker)

-- ─── Full-text search on conversations ────────────────────────────────────
ALTER TABLE conversations
  ADD COLUMN search_vector TSVECTOR
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(preview, ''))
  ) STORED;

CREATE INDEX idx_conversations_search
  ON conversations USING GIN(search_vector);
```

### 4.3 Type Generation

After schema is finalized, generate TypeScript types:

```bash
npx supabase gen types typescript \
  --project-id $SUPABASE_PROJECT_ID \
  > types/supabase.ts
```

---

## 5. Authentication

### 5.1 Supabase Client

```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import { Database } from '../types/supabase'

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
}

export const supabase = createClient<Database>(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
)
```

### 5.2 Auth Hook

```typescript
// hooks/useAuth.ts
import { useEffect, useState } from 'react'
import { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setSession(session)
    )

    return () => subscription.unsubscribe()
  }, [])

  const signInWithEmail = (email: string, password: string) =>
    supabase.auth.signInWithPassword({ email, password })

  const signUpWithEmail = (email: string, password: string) =>
    supabase.auth.signUp({ email, password })

  const signInWithGoogle = () =>
    supabase.auth.signInWithOAuth({ provider: 'google' })

  const signOut = () => supabase.auth.signOut()

  return { session, loading, signInWithEmail, signUpWithEmail, signInWithGoogle, signOut }
}
```

### 5.3 Auth Guard in Root Layout

```typescript
// app/_layout.tsx
import { useAuth } from '../hooks/useAuth'
import { Redirect, Stack } from 'expo-router'

export default function RootLayout() {
  const { session, loading } = useAuth()

  if (loading) return <SplashScreen />
  if (!session) return <Redirect href="/auth/sign-in" />

  return <Stack />
}
```

---

## 6. API Layer — Cloudflare Workers

The Worker is the only component that holds secrets. The mobile client sends its Supabase JWT with every request. The Worker verifies the JWT before processing.

### 6.1 Worker Entry Point

```typescript
// worker/src/index.ts
import { verifyJWT } from './auth'
import { handleChat } from './chat'
import { handleMemoryExtract } from './memory'
import { handlePaymentWebhook } from './payments'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    // Payment webhook — verified by Razorpay signature, not JWT
    if (url.pathname === '/payments/webhook') {
      return handlePaymentWebhook(request, env)
    }

    // All other routes require valid Supabase JWT
    const authHeader = request.headers.get('Authorization')
    if (!authHeader) return unauthorized()

    const userId = await verifyJWT(authHeader.replace('Bearer ', ''), env)
    if (!userId) return unauthorized()

    if (url.pathname === '/chat' && request.method === 'POST')
      return handleChat(request, env, userId)

    if (url.pathname === '/memory/extract' && request.method === 'POST')
      return handleMemoryExtract(request, env, userId)

    return new Response('Not found', { status: 404 })
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const unauthorized = () =>
  new Response('Unauthorized', { status: 401, headers: corsHeaders })

interface Env {
  OPENROUTER_API_KEY: string
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  RAZORPAY_KEY_SECRET: string
  OPENAI_API_KEY: string
}
```

### 6.2 JWT Verification

```typescript
// worker/src/auth.ts
export async function verifyJWT(token: string, env: Env): Promise<string | null> {
  try {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      },
    })
    if (!res.ok) return null
    const { id } = await res.json() as { id: string }
    return id
  } catch {
    return null
  }
}
```

### 6.3 Chat Endpoint

```typescript
// worker/src/chat.ts
export async function handleChat(
  request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  const body = await request.json() as ChatRequest

  // 1. Check credit balance
  const balance = await getBalance(userId, env)
  if (balance <= 0 && body.model !== 'qwen/qwen3-coder-480b:free') {
    return new Response(JSON.stringify({ error: 'insufficient_credits' }), {
      status: 402,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    })
  }

  // 2. Generate idempotency key
  const idempotencyKey = `${userId}-${body.messageId}`

  // 3. Forward to OpenRouter with streaming
  const orResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://onyxai.app',
      'X-Title': 'OnyxAI',
    },
    body: JSON.stringify({
      model: body.model,
      messages: body.messages,
      stream: true,
      max_tokens: body.maxTokens ?? 4096,
    }),
  })

  if (!orResponse.ok) {
    const err = await orResponse.text()
    return new Response(err, { status: orResponse.status, headers: corsHeaders })
  }

  // 4. Stream response back to client, accumulate for billing
  let fullContent = ''
  let usage = { prompt_tokens: 0, completion_tokens: 0 }

  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()

  // Process stream in background
  const streamPromise = (async () => {
    const reader = orResponse.body!.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split('\n').filter(l => l.startsWith('data: '))

      for (const line of lines) {
        const data = line.slice(6)
        if (data === '[DONE]') continue
        try {
          const parsed = JSON.parse(data)
          const delta = parsed.choices?.[0]?.delta?.content
          if (delta) fullContent += delta
          if (parsed.usage) usage = parsed.usage
          await writer.write(encoder.encode(line + '\n'))
        } catch {}
      }
    }

    await writer.close()

    // 5. Record usage and deduct credits after stream completes
    if (usage.completion_tokens > 0 || fullContent.length > 0) {
      const totalTokens = usage.prompt_tokens + usage.completion_tokens
      await recordUsage({
        userId,
        model: body.model,
        conversationId: body.conversationId,
        messageId: body.messageId,
        tokensUsed: totalTokens,
        idempotencyKey,
        env,
      })
    }
  })()

  streamPromise.catch(console.error)

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      ...corsHeaders,
    },
  })
}

interface ChatRequest {
  model: string
  messages: { role: string; content: string | ContentPart[] }[]
  conversationId: string
  messageId: string
  maxTokens?: number
}

interface ContentPart {
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string }
}
```

---

## 7. OpenRouter Integration

### 7.1 Model Definitions

```typescript
// constants/models.ts
export interface ModelConfig {
  id: string
  displayName: string
  provider: string
  supportsVision: boolean
  supportsReasoning: boolean
  isFree: boolean
  inputCostPerMToken: number   // USD per million input tokens
  outputCostPerMToken: number  // USD per million output tokens
  contextWindow: number        // tokens
  maxOutput: number            // tokens
  description: string
}

export const MODELS: ModelConfig[] = [
  {
    id: 'qwen/qwen3-coder-480b:free',
    displayName: 'Qwen3 Coder',
    provider: 'Alibaba',
    supportsVision: false,
    supportsReasoning: false,
    isFree: true,
    inputCostPerMToken: 0,
    outputCostPerMToken: 0,
    contextWindow: 262000,
    maxOutput: 8192,
    description: 'Free model. Great for onboarding and lightweight tasks.',
  },
  {
    id: 'minimax/minimax-m2.7',
    displayName: 'MiniMax Fast',
    provider: 'MiniMax',
    supportsVision: true,
    supportsReasoning: false,
    isFree: false,
    inputCostPerMToken: 0.30,
    outputCostPerMToken: 1.10,
    contextWindow: 1000000,
    maxOutput: 8192,
    description: 'Fast and cheap. Best for everyday conversation.',
  },
  {
    id: 'deepseek/deepseek-v3.2',
    displayName: 'DeepSeek Smart',
    provider: 'DeepSeek',
    supportsVision: false,
    supportsReasoning: true,
    isFree: false,
    inputCostPerMToken: 0.35,
    outputCostPerMToken: 1.40,
    contextWindow: 131072,
    maxOutput: 16384,
    description: 'Default paid model. Strong reasoning, great value.',
  },
  {
    id: 'qwen/qwen3-6-plus',
    displayName: 'Qwen Plus',
    provider: 'Alibaba',
    supportsVision: true,
    supportsReasoning: true,
    isFree: false,
    inputCostPerMToken: 0.50,
    outputCostPerMToken: 2.00,
    contextWindow: 131072,
    maxOutput: 16384,
    description: 'Balanced. Handles images and complex tasks well.',
  },
  {
    id: 'zai-org/glm-5.1',
    displayName: 'GLM-5.1 Frontier',
    provider: 'Zhipu AI',
    supportsVision: true,
    supportsReasoning: true,
    isFree: false,
    inputCostPerMToken: 1.05,
    outputCostPerMToken: 4.20,
    contextWindow: 200000,
    maxOutput: 128000,
    description: 'Frontier quality. Competes with Claude Opus on coding.',
  },
]

export const DEFAULT_MODEL_ID = 'deepseek/deepseek-v3.2'
export const FREE_MODEL_ID = 'qwen/qwen3-coder-480b:free'

export const getModel = (id: string): ModelConfig =>
  MODELS.find(m => m.id === id) ?? MODELS[2]
```

### 7.2 Client-Side Streaming Hook

```typescript
// hooks/useChat.ts
import { useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { buildMessagesArray } from '../lib/tokens'
import { getMemorySystemPrompt } from '../lib/memory'

export function useChat(conversationId: string, modelId: string) {
  const [messages, setMessages] = useState<Message[]>([])
  const [streaming, setStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(async (
    content: string,
    attachments?: Attachment[]
  ) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    // 1. Save user message to DB
    const userMsg: Message = {
      id: crypto.randomUUID(),
      conversationId,
      role: 'user',
      content,
      hasAttachment: (attachments?.length ?? 0) > 0,
      createdAt: new Date().toISOString(),
    }

    await supabase.from('messages').insert({
      id: userMsg.id,
      conversation_id: conversationId,
      user_id: session.user.id,
      role: 'user',
      content,
      has_attachment: userMsg.hasAttachment,
    })

    setMessages(prev => [...prev, userMsg])

    // 2. Build context
    const [contextMessages, memoryPrompt] = await Promise.all([
      buildMessagesArray(conversationId, content, attachments),
      getMemorySystemPrompt(session.user.id, content),
    ])

    // 3. Stream from Worker
    setStreaming(true)
    setStreamingContent('')

    abortRef.current = new AbortController()
    const assistantMessageId = crypto.randomUUID()

    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_WORKER_URL}/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            model: modelId,
            messages: contextMessages,
            systemPrompt: memoryPrompt,
            conversationId,
            messageId: assistantMessageId,
          }),
          signal: abortRef.current.signal,
        }
      )

      if (!response.ok) {
        const err = await response.json() as { error: string }
        throw new Error(err.error)
      }

      // 4. Process SSE stream
      let accumulated = ''
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '))

        for (const line of lines) {
          const data = line.slice(6)
          if (data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data)
            const delta = parsed.choices?.[0]?.delta?.content ?? ''
            accumulated += delta
            setStreamingContent(accumulated)
          } catch {}
        }
      }

      // 5. Save assistant message to DB
      await supabase.from('messages').insert({
        id: assistantMessageId,
        conversation_id: conversationId,
        user_id: session.user.id,
        role: 'assistant',
        content: accumulated,
        model: modelId,
      })

      setMessages(prev => [...prev, {
        id: assistantMessageId,
        conversationId,
        role: 'assistant',
        content: accumulated,
        model: modelId,
        createdAt: new Date().toISOString(),
      }])

      // 6. Auto-title if first assistant response
      if (messages.length === 0) {
        triggerAutoTitle(conversationId, content, session.access_token)
      }

      // 7. Trigger memory extraction (non-blocking)
      scheduleMemoryExtraction(conversationId, session.access_token)

    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') return
      throw err
    } finally {
      setStreaming(false)
      setStreamingContent('')
    }
  }, [conversationId, modelId, messages.length])

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort()
    setStreaming(false)
  }, [])

  return { messages, setMessages, streaming, streamingContent, sendMessage, stopStreaming }
}
```

---

## 8. Memory System

### 8.1 Memory Extraction Prompt

```typescript
// worker/src/memory.ts

const EXTRACTION_PROMPT = `You are a memory extraction system. Given a conversation, extract factual information about the USER ONLY (not the AI). 

Extract facts in these categories:
- learning: what they are studying, reading, or trying to understand
- preference: how they like to communicate, work, or receive information  
- project: active projects, their status, and technical details
- personal: name, location, occupation, background facts

Rules:
- Only extract facts that will still be relevant in future conversations
- Do not extract transient details (specific code snippets, one-off questions)
- Each fact must be a self-contained sentence
- Maximum 10 facts per extraction
- If no clear facts exist, return an empty array

Return ONLY a JSON array with no preamble or markdown:
[{"content": "...", "category": "learning|preference|project|personal", "confidence": 0.0-1.0}]`

export async function handleMemoryExtract(
  request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  const { conversationId, messages } = await request.json() as {
    conversationId: string
    messages: { role: string; content: string }[]
  }

  // Extract facts
  const extractionResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'minimax/minimax-m2.7',  // cheap model for extraction
      messages: [
        { role: 'system', content: EXTRACTION_PROMPT },
        { role: 'user', content: JSON.stringify(messages.slice(-20)) },
      ],
      max_tokens: 1000,
    }),
  })

  const data = await extractionResponse.json() as any
  const rawContent = data.choices?.[0]?.message?.content ?? '[]'

  let newFacts: { content: string; category: string; confidence: number }[]
  try {
    newFacts = JSON.parse(rawContent.replace(/```json|```/g, '').trim())
  } catch {
    return new Response(JSON.stringify({ extracted: 0 }), { status: 200 })
  }

  if (!newFacts.length) {
    return new Response(JSON.stringify({ extracted: 0 }), { status: 200 })
  }

  // Embed each fact
  const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: newFacts.map(f => f.content),
    }),
  })

  const embData = await embeddingResponse.json() as any
  const embeddings = embData.data.map((d: any) => d.embedding)

  // Upsert to Supabase via service role
  const supabaseAdmin = createSupabaseAdmin(env)
  const rows = newFacts.map((fact, i) => ({
    user_id: userId,
    content: fact.content,
    category: fact.category,
    confidence: fact.confidence,
    embedding: JSON.stringify(embeddings[i]),
    source_conversation_id: conversationId,
    updated_at: new Date().toISOString(),
  }))

  await supabaseAdmin.from('memory_facts').upsert(rows, {
    onConflict: 'user_id,content',
    ignoreDuplicates: false,
  })

  return new Response(JSON.stringify({ extracted: newFacts.length }), { status: 200 })
}
```

### 8.2 Memory Retrieval (Client-side)

```typescript
// lib/memory.ts
import { supabase } from './supabase'

const MEMORY_SYSTEM_PREFIX = `You are OnyxAI, a helpful AI assistant. Here is what you know about the user from previous conversations:`

export async function getMemorySystemPrompt(
  userId: string,
  currentMessage: string
): Promise<string> {
  // Get embedding for current message via Worker
  // For now, fall back to recency-based retrieval
  const { data: facts } = await supabase
    .from('memory_facts')
    .select('content, category')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(12)

  if (!facts?.length) return ''

  const factLines = facts
    .map(f => `- [${f.category}] ${f.content}`)
    .join('\n')

  return `${MEMORY_SYSTEM_PREFIX}\n${factLines}\n\nUse this context naturally. Do not explicitly mention having a memory system unless asked.`
}

export async function getMemoryFacts(userId: string) {
  return supabase
    .from('memory_facts')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
}

export async function deleteMemoryFact(factId: string) {
  return supabase
    .from('memory_facts')
    .delete()
    .eq('id', factId)
}

export async function clearAllMemory(userId: string) {
  return supabase
    .from('memory_facts')
    .delete()
    .eq('user_id', userId)
}
```

---

## 9. Credit System

### 9.1 Pricing Config

```typescript
// constants/models.ts (extension)

// OnyxAI markup: 40% over OpenRouter cost
const MARKUP = 1.40

// INR per USD
const USD_TO_INR = 83.5

export function calculateCreditCost(
  model: ModelConfig,
  inputTokens: number,
  outputTokens: number
): number {
  const inputCostUSD = (inputTokens / 1_000_000) * model.inputCostPerMToken * MARKUP
  const outputCostUSD = (outputTokens / 1_000_000) * model.outputCostPerMToken * MARKUP
  const totalINR = (inputCostUSD + outputCostUSD) * USD_TO_INR
  return Math.ceil(totalINR * 100) / 100  // round up to nearest paisa
}
```

### 9.2 Credit Deduction (Worker)

```typescript
// worker/src/chat.ts (recordUsage function)
async function recordUsage(params: {
  userId: string
  model: string
  conversationId: string
  messageId: string
  tokensUsed: number
  idempotencyKey: string
  env: Env
}) {
  const model = getModelConfig(params.model)
  // Approximate split: 40% input, 60% output for billing purposes
  // Actual split comes from OpenRouter usage object when available
  const estimatedInput = Math.floor(params.tokensUsed * 0.4)
  const estimatedOutput = Math.floor(params.tokensUsed * 0.6)
  const costINR = calculateCreditCost(model, estimatedInput, estimatedOutput)

  // Atomic deduct + record via Postgres function
  const supabaseAdmin = createSupabaseAdmin(params.env)
  await supabaseAdmin.rpc('deduct_credits_and_record', {
    p_user_id: params.userId,
    p_amount: costINR,
    p_model: params.model,
    p_conversation_id: params.conversationId,
    p_message_id: params.messageId,
    p_tokens_used: params.tokensUsed,
    p_idempotency_key: params.idempotencyKey,
  })
}
```

### 9.3 Atomic Deduction SQL Function

```sql
CREATE OR REPLACE FUNCTION deduct_credits_and_record(
  p_user_id UUID,
  p_amount DECIMAL,
  p_model TEXT,
  p_conversation_id UUID,
  p_message_id UUID,
  p_tokens_used INTEGER,
  p_idempotency_key TEXT
) RETURNS VOID AS $$
BEGIN
  -- Check idempotency
  IF EXISTS (
    SELECT 1 FROM credit_transactions WHERE idempotency_key = p_idempotency_key
  ) THEN
    RETURN;
  END IF;

  -- Deduct from balance
  UPDATE user_profiles
  SET
    credit_balance = credit_balance - p_amount,
    total_tokens_used = total_tokens_used + p_tokens_used,
    updated_at = NOW()
  WHERE id = p_user_id;

  -- Record transaction
  INSERT INTO credit_transactions (
    user_id, amount, type, model,
    conversation_id, message_id, tokens_used, idempotency_key
  ) VALUES (
    p_user_id, -p_amount, 'usage', p_model,
    p_conversation_id, p_message_id, p_tokens_used, p_idempotency_key
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 9.4 Razorpay Top-Up Flow

```typescript
// worker/src/payments.ts
import crypto from 'crypto'

const CREDIT_PACKAGES = {
  'pkg_100': { amountINR: 100, creditsINR: 100 },
  'pkg_250': { amountINR: 250, creditsINR: 262 },   // +5% bonus
  'pkg_500': { amountINR: 500, creditsINR: 535 },   // +7% bonus
  'pkg_1000': { amountINR: 1000, creditsINR: 1100 }, // +10% bonus
}

export async function handlePaymentWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  const body = await request.text()
  const signature = request.headers.get('X-Razorpay-Signature')

  // Verify signature
  const expectedSig = crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex')

  if (signature !== expectedSig) {
    return new Response('Invalid signature', { status: 400 })
  }

  const event = JSON.parse(body)

  if (event.event !== 'payment.captured') {
    return new Response('OK', { status: 200 })
  }

  const payment = event.payload.payment.entity
  const userId = payment.notes?.userId
  const packageId = payment.notes?.packageId

  if (!userId || !packageId || !CREDIT_PACKAGES[packageId]) {
    return new Response('Missing metadata', { status: 400 })
  }

  const { creditsINR } = CREDIT_PACKAGES[packageId]
  const idempotencyKey = `topup-${payment.id}`

  const supabaseAdmin = createSupabaseAdmin(env)

  // Check idempotency
  const { data: existing } = await supabaseAdmin
    .from('credit_transactions')
    .select('id')
    .eq('idempotency_key', idempotencyKey)
    .single()

  if (existing) return new Response('OK', { status: 200 })

  // Add credits
  await supabaseAdmin.from('user_profiles')
    .update({ credit_balance: supabaseAdmin.rpc('increment', { x: creditsINR }) })
    .eq('id', userId)

  await supabaseAdmin.from('credit_transactions').insert({
    user_id: userId,
    amount: creditsINR,
    type: 'topup',
    idempotency_key: idempotencyKey,
  })

  return new Response('OK', { status: 200 })
}
```

---

## 10. File and Image Handling

### 10.1 Image Capture and Encoding

```typescript
// lib/attachments.ts
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system'

export interface Attachment {
  type: 'image' | 'pdf' | 'text'
  mimeType: string
  base64: string
  uri: string
  name: string
  sizeBytes: number
}

export async function pickImageFromLibrary(): Promise<Attachment | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    base64: true,
    allowsEditing: false,
  })

  if (result.canceled || !result.assets[0]) return null

  const asset = result.assets[0]
  if (!asset.base64) return null

  const sizeBytes = asset.fileSize ?? 0
  if (sizeBytes > 10 * 1024 * 1024) throw new Error('image_too_large')

  return {
    type: 'image',
    mimeType: asset.mimeType ?? 'image/jpeg',
    base64: asset.base64,
    uri: asset.uri,
    name: asset.fileName ?? 'image.jpg',
    sizeBytes,
  }
}

export async function captureFromCamera(): Promise<Attachment | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync()
  if (!permission.granted) throw new Error('camera_permission_denied')

  const result = await ImagePicker.launchCameraAsync({
    quality: 0.8,
    base64: true,
  })

  if (result.canceled || !result.assets[0]) return null

  const asset = result.assets[0]
  if (!asset.base64) return null

  return {
    type: 'image',
    mimeType: 'image/jpeg',
    base64: asset.base64,
    uri: asset.uri,
    name: `photo_${Date.now()}.jpg`,
    sizeBytes: asset.fileSize ?? 0,
  }
}

export function attachmentToMessageContent(
  text: string,
  attachments: Attachment[]
): string | ContentPart[] {
  if (!attachments.length) return text

  const parts: ContentPart[] = [{ type: 'text', text }]

  for (const att of attachments) {
    if (att.type === 'image') {
      parts.push({
        type: 'image_url',
        image_url: {
          url: `data:${att.mimeType};base64,${att.base64}`,
        },
      })
    }
  }

  return parts
}
```

---

## 11. Context Window Management

```typescript
// lib/tokens.ts
import { supabase } from './supabase'
import { getModel } from '../constants/models'

const CHARS_PER_TOKEN = 4
const MIN_RECENT_MESSAGES = 6
const TOKEN_BUDGET_BY_MODEL: Record<string, number> = {
  'qwen/qwen3-coder-480b:free': 12000,
  'minimax/minimax-m2.7': 16000,
  'deepseek/deepseek-v3.2': 14000,
  'qwen/qwen3-6-plus': 16000,
  'zai-org/glm-5.1': 20000,
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

export async function buildMessagesArray(
  conversationId: string,
  newUserContent: string,
  attachments?: Attachment[]
): Promise<ApiMessage[]> {
  const { data: allMessages } = await supabase
    .from('messages')
    .select('role, content, model')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  if (!allMessages?.length) return []

  // Get current model from conversation
  const { data: conv } = await supabase
    .from('conversations')
    .select('model')
    .eq('id', conversationId)
    .single()

  const budget = TOKEN_BUDGET_BY_MODEL[conv?.model ?? 'deepseek/deepseek-v3.2']

  // Always keep last MIN_RECENT_MESSAGES
  const recent = allMessages.slice(-MIN_RECENT_MESSAGES)
  const older = allMessages.slice(0, -MIN_RECENT_MESSAGES)

  let tokenCount = recent.reduce((sum, m) => sum + estimateTokens(m.content), 0)
  const included: typeof allMessages = []

  // Fill budget with older messages newest-first
  for (let i = older.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(older[i].content)
    if (tokenCount + msgTokens > budget) break
    included.unshift(older[i])
    tokenCount += msgTokens
  }

  return [...included, ...recent].map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))
}

interface ApiMessage {
  role: 'user' | 'assistant' | 'system'
  content: string | ContentPart[]
}
```

---

## 12. Screen Specifications

### 12.1 Chat Screen `app/(tabs)/index.tsx`

**State:**
- `activeConversationId: string | null` — null means no conversation selected
- `activeModelId: string` — persisted to AsyncStorage
- `streaming: boolean`
- `creditBalance: number` — real-time from Supabase subscription

**Behaviors:**
- On mount: load last conversation or create new one
- On new conversation: auto-generate ID, insert row to `conversations` table
- On model change: update `conversations.model` for current conversation
- On attachment: show `AttachmentPreview`, disable send until confirmed or removed
- On credit balance ≤ 0 (non-free model): disable input, show top-up CTA
- Conversation resume after 24h: inject resume prompt into system context (silent, not shown in UI)

**Performance requirements:**
- FlashList inverted with `estimatedItemSize={80}`
- `keyboardShouldPersistTaps="handled"` on scroll container
- `react-native-keyboard-controller` for keyboard avoiding (not `KeyboardAvoidingView`)

### 12.2 History Screen `app/(tabs)/history.tsx`

**State:**
- `conversations: Conversation[]` — paginated, 20 per page
- `searchQuery: string`
- `page: number`

**Behaviors:**
- Search debounced 300ms, runs Supabase full-text search
- Swipe left on conversation row → delete (with confirmation)
- Pull to refresh
- Long press → archive

**Query:**
```typescript
// Normal load
supabase
  .from('conversations')
  .select('id, title, model, preview, token_count, updated_at')
  .eq('user_id', userId)
  .eq('is_archived', false)
  .order('updated_at', { ascending: false })
  .range(offset, offset + 19)

// Search
supabase
  .from('conversations')
  .select('id, title, model, preview, updated_at')
  .eq('user_id', userId)
  .textSearch('search_vector', query, { type: 'websearch' })
  .order('updated_at', { ascending: false })
  .limit(20)
```

### 12.3 Memory Screen `app/memory.tsx`

**State:**
- `facts: MemoryFact[]` — all facts for user, grouped by category
- `editingFactId: string | null`

**Behaviors:**
- Grouped by category with section headers
- Tap fact → inline edit with save/cancel
- Swipe right → delete with undo toast (3s)
- "Clear all" → modal confirmation → delete all → navigate back

### 12.4 Credits Screen `app/credits.tsx`

**State:**
- `balance: number`
- `transactions: CreditTransaction[]` — last 50
- `selectedPackage: string | null`

**Top-up packages displayed:**

| Package | Price | Credits | Bonus |
|---------|-------|---------|-------|
| Starter | ₹100 | ₹100 | — |
| Popular | ₹250 | ₹262 | +5% |
| Value | ₹500 | ₹535 | +7% |
| Pro | ₹1000 | ₹1100 | +10% |

---

## 13. Component Library

### 13.1 Design Tokens

```typescript
// constants/colors.ts
export const Colors = {
  background: '#0A0A0A',
  surface: '#1A1A1A',
  surfaceElevated: '#242424',
  accent: '#7C3AED',
  accentMuted: '#4C1D95',
  accentSubtle: '#1E0A3C',
  textPrimary: '#FFFFFF',
  textSecondary: '#A1A1AA',
  textTertiary: '#52525B',
  border: '#27272A',
  borderStrong: '#3F3F46',
  danger: '#EF4444',
  dangerMuted: '#7F1D1D',
  success: '#22C55E',
  warning: '#F59E0B',
  userBubble: '#7C3AED',
  assistantSurface: '#1A1A1A',
} as const
```

### 13.2 MessageBubble

```typescript
// components/chat/MessageBubble.tsx
// Props: role, content, model, hasAttachment, isStreaming

// User bubble: right-aligned, accent background, white text
// Assistant bubble: left-aligned, surface background, full markdown
// Streaming: show cursor animation at end of content
// Code blocks: monospace font, surface+1 background, copy button
// Images: if has_attachment, show camera icon indicator
```

### 13.3 ModelSelector Bottom Sheet

```typescript
// components/model/ModelSelector.tsx
// Triggered by tapping model badge in header
// Uses @gorhom/bottom-sheet
// Snap points: ['50%', '80%']
// Shows all 5 models as cards
// Active model: left border accent + checkmark
// Each card: name, provider, capability badges (Vision, Reasoning, Free)
// On select: close sheet + update model in store + update conversation in DB
```

### 13.4 InputBar

```typescript
// components/chat/InputBar.tsx
// Left: camera icon (disabled if model has no vision), attachment icon
// Center: multiline TextInput, expands up to 5 lines then scrolls
// Right: send button (arrow up icon) OR stop button (square) if streaming
// When attachment selected: shows AttachmentPreview above the bar
// When credit balance = 0 and non-free model: entire bar replaced with top-up CTA
```

---

## 14. Navigation Structure

```
app/
├── _layout.tsx                   # Root: auth guard, Zustand provider
│
├── auth/
│   ├── sign-in.tsx               # Stack screen, no tabs
│   └── sign-up.tsx
│
├── (tabs)/
│   ├── _layout.tsx               # Bottom tabs: Chat, History
│   ├── index.tsx                 # Chat (default tab)
│   └── history.tsx
│
├── memory.tsx                    # Pushed from settings
├── credits.tsx                   # Pushed from header balance tap
└── settings.tsx                  # Pushed from hamburger menu
```

Bottom tabs: 2 tabs only (Chat, History). Memory, Credits, Settings are pushed screens not tabs — keeps the bottom bar clean.

---

## 15. State Management

Zustand for global state. Supabase realtime for credit balance. No Redux.

```typescript
// store/app.ts
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

interface AppStore {
  activeModelId: string
  setActiveModelId: (id: string) => void

  creditBalance: number
  setCreditBalance: (balance: number) => void

  activeConversationId: string | null
  setActiveConversationId: (id: string | null) => void

  memoryIndicatorVisible: boolean
  setMemoryIndicatorVisible: (visible: boolean) => void
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      activeModelId: 'deepseek/deepseek-v3.2',
      setActiveModelId: (id) => set({ activeModelId: id }),

      creditBalance: 0,
      setCreditBalance: (balance) => set({ creditBalance: balance }),

      activeConversationId: null,
      setActiveConversationId: (id) => set({ activeConversationId: id }),

      memoryIndicatorVisible: false,
      setMemoryIndicatorVisible: (visible) => set({ memoryIndicatorVisible: visible }),
    }),
    {
      name: 'onyxai-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        activeModelId: state.activeModelId,
        // Do not persist balance or conversationId — always fetch fresh
      }),
    }
  )
)
```

### Real-time Credit Balance

```typescript
// Subscribe to credit balance changes in root layout
useEffect(() => {
  const channel = supabase
    .channel('credit_balance')
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'user_profiles',
      filter: `id=eq.${session.user.id}`,
    }, (payload) => {
      setCreditBalance(payload.new.credit_balance)
    })
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}, [session.user.id])
```

---

## 16. Push Notifications

Deferred to v2. Not implemented in v1. Do not install `expo-notifications` in v1 to avoid complexity — add it when the feature is scoped.

The schema and Worker are ready to send notifications when implemented — user device tokens can be stored in a `device_tokens` table added in a migration.

---

## 17. Error Handling

### 17.1 Error Types

```typescript
// types/index.ts
export type AppError =
  | { type: 'insufficient_credits' }
  | { type: 'model_unavailable'; model: string }
  | { type: 'network_error'; message: string }
  | { type: 'rate_limited'; retryAfter: number }
  | { type: 'image_too_large'; maxMB: number }
  | { type: 'camera_permission_denied' }
  | { type: 'unknown'; message: string }
```

### 17.2 Retry Logic

```typescript
// lib/openrouter.ts
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastError: Error

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err as Error

      // Don't retry on client errors or aborts
      if (err instanceof Response && err.status < 500) throw err
      if ((err as Error).name === 'AbortError') throw err

      if (attempt < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, attempt)))
      }
    }
  }

  throw lastError!
}
```

### 17.3 Error UI

- `insufficient_credits` → replace input bar with top-up CTA
- `model_unavailable` → toast + auto-switch to free model
- `network_error` → retry button on failed message
- `rate_limited` → show countdown toast
- All other → toast with message, log to console in dev

---

## 18. Testing Strategy

### Unit Tests (Jest)

```bash
npx jest lib/tokens.test.ts
npx jest lib/memory.test.ts
npx jest lib/credits.test.ts
```

Test: token estimation, context window truncation, credit calculation, memory prompt generation.

### Integration Tests

Test Worker endpoints with `miniflare` (Cloudflare Workers local runtime):

```bash
cd worker && npx miniflare src/index.ts --test
```

Test: JWT verification rejection, credit deduction idempotency, streaming response passthrough.

### E2E Tests

Deferred to v2. Use Detox for E2E on Android emulator when the app is stable.

### Manual Test Checklist (pre-release)

- [ ] Sign up with email, verify email, sign in
- [ ] Sign in with Google
- [ ] Create conversation, send message, receive streaming response
- [ ] Switch model mid-conversation
- [ ] Upload photo from library (vision model)
- [ ] Capture photo from camera
- [ ] Attempt image upload on non-vision model — confirm button disabled
- [ ] Top up credits with Razorpay (use test mode)
- [ ] Confirm credit deduction per message
- [ ] Attempt message with zero balance — confirm blocked
- [ ] View conversation history, search by keyword
- [ ] View memory facts after 2+ conversations
- [ ] Delete individual memory fact
- [ ] Clear all memory
- [ ] Sign out, sign back in — confirm history persists

---

## 19. Build and Deployment

### 19.1 Development

```bash
# Install dependencies
npm install

# Start Expo dev server
npx expo start

# Run on connected Android device
npx expo run:android

# Run Cloudflare Worker locally
cd worker && npx wrangler dev
```

### 19.2 EAS Build (Android APK for testing)

```bash
# Install EAS CLI
npm install -g eas-cli

# Configure (first time)
npx eas build:configure

# Build APK for internal testing
npx eas build --platform android --profile preview

# Build AAB for Play Store
npx eas build --platform android --profile production
```

### 19.3 `eas.json`

```json
{
  "cli": { "version": ">= 10.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": { "buildType": "apk" }
    },
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" }
    },
    "production": {
      "android": { "buildType": "app-bundle" }
    }
  },
  "submit": {
    "production": {}
  }
}
```

### 19.4 Worker Deployment

```bash
cd worker
npx wrangler deploy
```

### 19.5 Supabase Migrations

```bash
# Apply migrations to production
npx supabase db push --linked

# Generate types after schema change
npx supabase gen types typescript --linked > ../types/supabase.ts
```

---

## 20. Analytics and Observability

### 20.1 Events to Track

Track via a lightweight analytics table in Supabase — no third-party SDK in v1:

```sql
CREATE TABLE analytics_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id),
  event      TEXT NOT NULL,
  properties JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Key events:

| Event | Properties |
|---|---|
| `conversation_started` | model, has_memory_context |
| `message_sent` | model, has_attachment, token_estimate |
| `model_switched` | from_model, to_model |
| `memory_fact_deleted` | category |
| `memory_cleared` | facts_count |
| `credit_topup` | package_id, amount_inr |
| `credits_exhausted` | current_model |
| `image_attached` | model, source (camera/library) |

### 20.2 Cloudflare Worker Observability

Use `console.log` in the Worker — logs appear in `wrangler tail` and the Cloudflare dashboard. Log: request path, userId (hashed), model, response status, latency.

### 20.3 Error Monitoring

Log all unhandled errors from the Worker to a Supabase `error_logs` table with timestamp, error type, and stack trace. Review weekly.

---

## Appendix A — Dependencies

### Mobile (`package.json`)

```json
{
  "dependencies": {
    "expo": "~55.0.0",
    "expo-router": "~7.0.0",
    "expo-secure-store": "~14.0.0",
    "expo-image-picker": "~16.0.0",
    "expo-file-system": "~18.0.0",
    "@supabase/supabase-js": "^2.45.0",
    "@shopify/flash-list": "^1.7.0",
    "nativewind": "^4.0.0",
    "react-native-markdown-display": "^7.0.0",
    "zustand": "^5.0.0",
    "@gorhom/bottom-sheet": "^5.0.0",
    "react-native-reanimated": "~3.17.0",
    "react-native-gesture-handler": "~2.21.0",
    "@react-native-async-storage/async-storage": "^2.0.0",
    "react-native-keyboard-controller": "^1.14.0"
  }
}
```

### Worker (`worker/package.json`)

```json
{
  "dependencies": {
    "hono": "^4.0.0"
  },
  "devDependencies": {
    "wrangler": "^3.0.0",
    "@cloudflare/workers-types": "^4.0.0"
  }
}
```

---

## Appendix B — Coding Standards

- **TypeScript strict mode** — no `any` except in third-party type gaps
- **No default exports** from lib files — named exports only for tree-shaking
- **No inline styles** — NativeWind classes or StyleSheet.create only
- **No `console.log` in production** — use a `log()` utility that no-ops in prod
- **Every Supabase call checks for error** — `const { data, error } = await ...; if (error) throw error`
- **No magic numbers** — all constants in `constants/` files
- **File naming** — PascalCase for components, camelCase for hooks and lib files
- **One component per file** — no barrel files except for `components/ui/index.ts`

---

*OnyxAI spec.md — v1.0 — May 2026 — Internal use only*