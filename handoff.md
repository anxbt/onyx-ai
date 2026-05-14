# Handoff — OnyxAI Wave 1: Context-Window Management

**Date:** 2026-05-14  
**Branch:** `main` (uncommitted)  
**Last commit:** `f5b3c4c` — syntax-highlight-formatting  
**Session:** Wave 1 implementation + handoff documentation  

---

## 🐐 What We're Trying to Build

OnyxAI is a native Android AI chat app (Expo SDK 55 + React Native). The product thesis is:
- **Model switching** — pick from free/cheap frontier models per message
- **Persistent memory** — facts extracted and recalled across conversations
- **Pay-as-you-go credits** — transparent per-message INR pricing
- **Proper formatting** — dark-themed markdown + syntax highlighting

**Wave 1 goal:** Prevent long conversations from sending unbounded message history to OpenRouter by implementing a **sliding context window** (last 8 messages + rolling summaries of older chunks).

---

## 📍 Current State

| Layer | Status |
|-------|--------|
| **DB Schema** | ✅ `conversation_summaries` table + `pgvector` + `match_messages` RPC deployed via migration |
| **Worker** | ✅ `POST /chat/summarize` endpoint + summary context injection in `POST /chat` |
| **Mobile** | ✅ History trimmed to last 8 messages + auto-trigger summarization every 10 messages |
| **TypeScript** | ✅ Both mobile (`npx tsc --noEmit`) and worker (`npx tsc --noEmit`) compile cleanly |
| **Tests** | ⬜ None yet — validation is manual |
| **Commits** | ⬜ All changes are **uncommitted** — need a commit before next wave |

### Wave Status (from `spec.md`)

| Wave | Feature | Status |
|------|---------|--------|
| Wave 0 | Markdown Rendering + Syntax Highlighting | 🔄 Next |
| **Wave 1** | **Context Window Management** | **✅ Complete (uncommitted)** |
| Wave 2 | Streaming Response | 📋 Planned |
| Wave 3 | Image & File Uploads | 📋 Planned |
| Wave 4 | Semantic Memory & Retrieval | 📋 Planned |

---

## ✈️ Files in Flight (Active Modifications)

These files have uncommitted changes and are the "hot" surface for the next session:

### New Files
| File | Purpose |
|------|---------|
| `supabase/migrations/0004_wave1_context_window.sql` | DB migration: summaries table + pgvector + match_messages RPC |

### Modified Files
| File | What Changed |
|------|-------------|
| `worker/src/chat.ts` | Added `handleSummarize` (+144 lines). `handleChat` now prepends summary context as system message. |
| `worker/src/index.ts` | Registered `POST /chat/summarize` route. |
| `worker/src/supabase.ts` | Added 5 new helpers: `fetchConversationSummaries`, `fetchMessagesRange`, `fetchMessageCount`, `insertConversationSummary`, `matchMessages`. |
| `hooks/useChat.ts` | Trims outgoing messages to last 8. Auto-triggers `summarizeConversation()` every 10 messages (fire-and-forget). |
| `lib/openrouter.ts` | Added `summarizeConversation()` helper calling worker `/chat/summarize`. |
| `lib/tokens.ts` | Rewrote from scratch: `buildMessagesWithContext()`, `buildSystemContext()`, `assembleWithBudget()`, `shouldSummarize()`. |
| `CHECKPOINTS.md` | Added "Wave 1: Context-Window Management (Complete)" section. |

### Deleted Files (build artifacts)
| File | Note |
|------|------|
| `worker/.wrangler/tmp/...` | 4 build artifacts deleted — safe to ignore |

---

## ✅ Changed This Session

### 1. Database — `supabase/migrations/0004_wave1_context_window.sql`
- **`conversation_summaries`** table: `id`, `conversation_id`, `message_start_idx`, `message_end_idx`, `summary_text`, `key_facts` (JSONB), `created_at`
- **RLS policy**: users can only access summaries for conversations they own
- **`pgvector` extension** + `embedding` column on `messages` (384-dim, for Wave 4)
- **`match_messages` RPC**: semantic search within a single conversation using cosine similarity

### 2. Worker — `worker/src/chat.ts`
- **`handleSummarize`** (new endpoint):
  - Requires ≥20 messages (2× chunk size) before running
  - Targets the 2nd-last 10-message chunk (`messages[-20:-10]`)
  - Uses the cheapest free model for summarization
  - Prompt asks for JSON: `{"summary":"...","key_facts":["..."]}`
  - Falls back to raw text if JSON parsing fails
  - Stores result in `conversation_summaries`
- **`handleChat`** (modified):
  - If `conversationId` provided, fetches summaries from DB
  - Prepends `buildSystemContext(summaries)` as a `role: "system"` message
  - System context format: `[Conversation history summaries]\n\nMessages X-Y: ...\nKey facts: ...`

### 3. Worker — `worker/src/supabase.ts`
- `fetchConversationSummaries` — ordered by `message_end_idx ASC`
- `fetchMessagesRange` — paginated by offset/limit on `created_at`
- `fetchMessageCount` — tries `content-range` header first, falls back to row count
- `insertConversationSummary` — POST to `conversation_summaries`
- `matchMessages` — RPC wrapper for `match_messages` (prepped for Wave 4)

### 4. Mobile — `hooks/useChat.ts`
- Outgoing messages sliced to `.slice(-8)` before sending to worker
- After each assistant response, checks `totalMessageCount % 10 === 0`
- If hit, calls `summarizeConversation()` fire-and-forget (`.catch(() => {})`)
- Errors swallowed intentionally — summarization is best-effort

### 5. Mobile — `lib/openrouter.ts`
- New `summarizeConversation({ accessToken, conversationId })` → `POST /chat/summarize`

### 6. Mobile — `lib/tokens.ts`
- Complete rewrite from simple `estimateTokens()` to full context-window builder:
  - `EPHEMERAL_WINDOW = 8` (messages kept verbatim)
  - `SUMMARIZE_EVERY = 10` (trigger cadence)
  - `buildMessagesWithContext()` — fetches summaries + recent messages from Supabase, assembles with token budget
  - `assembleWithBudget()` — reserves 20% of context window for response, trims oldest ephemeral messages if over budget
  - `shouldSummarize()` — `messageCount % 10 === 0`

> **Note:** `lib/tokens.ts` has rich helpers (`buildMessagesWithContext`, `assembleWithBudget`) but the current `useChat.ts` uses a simpler approach (just `.slice(-8)` + let the worker inject summaries). The token.ts helpers are **ready for future use** when we want client-side budget-aware assembly instead of worker-side.

---

## ❌ Failed Attempts

| Attempt | Why It Failed | Resolution |
|---------|--------------|------------|
| Initial `handleSummarize` had `SUMMARIZE_CHUNK_SIZE = 10` but was summarizing the *last* 10 messages (most recent) instead of the 2nd-last chunk | Would mean summaries never capture "old enough" history — always summarizing the most recent messages that are about to be in the ephemeral window | Fixed: now targets `messages[-20:-10]` (the chunk *before* the ephemeral window) |
| `match_messages` RPC signature had `conv_id` as 2nd param but PostgREST RPC sends named params in body | Was worried about param ordering | Switched to named params in `callRpc()` — works because PostgREST accepts JSON body for RPC |
| `lib/tokens.ts` was going to be used directly by `useChat.ts` for full budget-aware assembly | Over-engineering for Wave 1; worker already handles summary injection | Kept the rich helpers in `tokens.ts` for future waves, but `useChat.ts` uses simple `.slice(-8)` for now |

---

## 🎯 Next Step

### Immediate (before next wave)
1. **Commit Wave 1** — `git add` all changes, write a commit message:
   ```bash
   git add -A
   git commit -m "feat: wave 1 context-window management
   
   - Add conversation_summaries table + pgvector + match_messages RPC
   - Worker: /chat/summarize endpoint + summary context injection
   - Mobile: trim history to last 8 messages, auto-summarize every 10
   - lib/tokens: token budget estimation + context assembly helpers"
   ```

2. **Apply migration** — if not already applied to Supabase project:
   ```bash
   npx supabase migration up
   # or
   npx supabase db push
   ```

3. **Validate** — create a conversation with >10 messages, verify:
   - `conversation_summaries` rows appear
   - New `/chat` requests include `[Conversation history summaries]` system message
   - Token counts in `conversations.token_count` stay reasonable

### Then: Wave 0 or Wave 2?
The `spec.md` says Wave 0 (Markdown Rendering) is "🔄 Next" but Wave 1 is now done. **Decision needed:**
- **Option A:** Do Wave 0 now (polish markdown rendering, code blocks, dark theme)
- **Option B:** Skip to Wave 2 (Streaming Response with SSE)
- **Option C:** Do Wave 0 + 2 in parallel (they're independent)

**Recommendation:** Wave 2 (Streaming) — it's a bigger user-facing win and the architecture is already set up for it (worker has `stream: false` hardcoded, mobile has `streaming` state in `useChat.ts`).

---

## 🗺️ Architecture Quick Reference

```
Expo App (React Native)
├── Supabase (Auth + DB + Storage + Vector Search)
│   └── conversation_summaries  ← NEW (Wave 1)
│   └── match_messages RPC      ← NEW (Wave 1)
└── Cloudflare Worker
    ├── POST /chat              ← MODIFIED (injects summaries)
    ├── POST /chat/summarize    ← NEW (Wave 1)
    ├── POST /memory/extract
    └── POST /payments/...
```

---

## 🔑 Key Numbers

| Constant | Value | Location | Meaning |
|----------|-------|----------|---------|
| `EPHEMERAL_WINDOW` | `8` | `lib/tokens.ts` | Messages kept verbatim in context |
| `SUMMARIZE_CHUNK_SIZE` | `10` | `worker/src/chat.ts` | Messages per summary chunk |
| `SUMMARIZE_EVERY` | `10` | `lib/tokens.ts` | Trigger summarization every N messages |
| `CHARS_PER_TOKEN` | `4` | `lib/tokens.ts`, `worker/src/chat.ts` | Naïve token estimation |
| Budget reserve | `20%` | `lib/tokens.ts` | Reserved for model response |
| Vector dim | `384` | migration | `all-MiniLM-L6-v2` compatible (Wave 4) |

---

## 📝 Notes for Next Developer

1. **The `lib/tokens.ts` helpers are dormant but ready.** `useChat.ts` currently uses `.slice(-8)` and lets the worker handle summary injection. If you want client-side budget-aware assembly, swap `requestMessages = allMessages.slice(-8)` for `buildMessagesWithContext(conversationId, content, modelContextWindow)`.

2. **Summarization is best-effort.** Errors in `summarizeConversation()` are silently caught. The chat flow continues regardless. This is intentional — don't make summarization a hard dependency.

3. **`matchMessages` RPC is prepped for Wave 4** but unused. The `embedding` column on `messages` is also empty until Wave 4 adds embedding generation.

4. **The migration is idempotent.** `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION` — safe to re-run.

5. **Worker compiles but hasn't been deployed.** Run `cd worker && wrangler deploy` after committing.

---

## 🔄 Schema Sync: How to Resync Local ↔ Supabase

Your project uses **Supabase CLI** (not installed in `package.json` — use `npx supabase` or install globally with `npm i -g supabase`). The config lives in `supabase/config.toml`.

### Scenario A: You changed the DB schema locally (migrations)

You wrote `supabase/migrations/0004_wave1_context_window.sql`. Now push it to the remote Supabase project:

```bash
# 1. Check what migrations are pending
npx supabase migration list

# 2. Push all pending migrations to the linked Supabase project
npx supabase db push

# 3. If you want to see the diff first
npx supabase db diff --linked
```

> **Prerequisite:** Your project must be linked to a Supabase project:
> ```bash
> npx supabase login          # one-time auth
> npx supabase link           # links local project to remote (creates .temp/)
> ```

### Scenario B: Someone else changed the remote schema

A teammate added a table/column via Supabase Dashboard or pushed a migration. Pull those changes into your local migrations:

```bash
# Pull remote schema changes into a new migration file
npx supabase db pull

# This creates: supabase/migrations/0005_remote_schema.sql
# Review it, then commit it to git.
```

### Scenario C: Regenerate TypeScript types after schema changes

After any schema change (local or remote), regenerate your TypeScript types so the client knows about new tables/columns:

```bash
# Generate types from the linked remote project
npx supabase gen types typescript --linked > types/supabase.ts

# Or from local (if running supabase start locally)
npx supabase gen types typescript --local > types/supabase.ts
```

> **Note:** Your project currently has `types/index.ts` (hand-written). Consider adding `types/supabase.ts` (auto-generated from DB) and importing from it for DB-backed types.

### Scenario D: Start fresh with a local Supabase instance

```bash
# Start local Postgres + PostgREST + Auth + Storage
npx supabase start

# Apply all migrations to the local instance
npx supabase migration up

# Seed with test data
npx supabase db seed

# Stop local instance
npx supabase stop
```

### Quick Reference Table

| Command | What it does |
|---------|-------------|
| `npx supabase db push` | Push local migrations → remote |
| `npx supabase db pull` | Pull remote schema → local migration |
| `npx supabase migration up` | Apply pending migrations to local/remote |
| `npx supabase migration list` | Show applied vs pending migrations |
| `npx supabase db diff` | Show schema diff between local and remote |
| `npx supabase gen types typescript` | Generate TS types from DB schema |
| `npx supabase start` | Start local Supabase stack |
| `npx supabase stop` | Stop local Supabase stack |
| `npx supabase status` | Check local services health |

### For This Project Specifically

After Wave 1, you need to:

```bash
# 1. Link project (if not already)
npx supabase link

# 2. Push the new migration
npx supabase db push

# 3. Verify pgvector extension is enabled
# (it should be — it's in the migration)

# 4. Optional: generate types
npx supabase gen types typescript --linked > types/supabase.ts
```

---

*End of handoff.*
