# OnyxAI Implementation Checkpoints

## Checkpoint 1: Foundation

- Replace the temporary Express prototype with the spec architecture.
- Scaffold Expo Router, route tree, shared constants/types/store, Worker folders, and Supabase folders.
- Create env placeholders for mobile and Worker secrets.

Validation prompt:
`Confirm the project structure, scripts, and env placeholders look right before wiring real data.`

## Checkpoint 2: Core App Shell

- Build auth, chat, history, memory, credits, and settings screens.
- Add reusable UI components, model selector, message list, and input bar.
- Keep everything runnable in preview mode without real credentials.

Validation prompt:
`Open the Expo app and confirm screen structure, navigation, and visual direction before backend wiring.`

## Checkpoint 3: Client Data Wiring

- Add Supabase client integration and auth session handling.
- Connect Zustand state, conversation hooks, memory hooks, and credit hooks.
- Replace preview-only data with real reads where credentials exist.

Validation prompt:
`Test sign-in, conversation loading, and balance fetching before enabling model streaming.`

## Checkpoint 4: Worker + Billing + Memory

- Implement Worker auth verification, `/chat`, `/memory/extract`, and `/payments/webhook`.
- Connect OpenRouter streaming, usage recording, and credit deduction.
- Add memory extraction and retrieval flow.

Validation prompt:
`Verify worker auth, streaming responses, and credit deduction against test accounts before shipping.`

## Checkpoint 5: Hardening

- Finish DB migrations, error states, polish, and deployment config.
- Add tests and a final production checklist.

Validation prompt:
`Run through staging on device before enabling real top-ups or wider testing.`

---

## Wave 1: Context-Window Management (Complete)

**Date:** 2026-05-13

### Changes

1. **DB Schema** (`supabase/migrations/0004_wave1_context_window.sql`)
   - Added `conversation_summaries` table with GIN index on `key_facts`.
   - Added `pgvector` extension + `match_messages` RPC for semantic retrieval.
   - Added `embedding` vector column to `messages`.

2. **Worker** (`worker/src/`)
   - New `POST /chat/summarize` endpoint (`handleSummarize`) — runs summarization on the 2nd-last 10-message chunk using the cheapest available model.
   - Updated `POST /chat` (`handleChat`) — prepends summary context as a system message when `conversationId` is provided.
   - Added `fetchConversationSummaries`, `fetchMessagesRange`, `fetchMessageCount`, `insertConversationSummary`, `matchMessages` helpers in `worker/src/supabase.ts`.

3. **Mobile** (`hooks/useChat.ts`, `lib/openrouter.ts`, `lib/tokens.ts`)
   - `useChat` trims request history to last **8 messages** before sending to worker.
   - Auto-triggers `summarizeConversation()` every **10 messages** (fire-and-forget, errors swallowed).
   - `estimateTokens()` updated to use `meta-llama/llama-4-scout:free` (128k context) as default.
   - Added `summarizeConversation()` helper in `lib/openrouter.ts`.

### Validation prompt:
`Create a conversation with >10 messages and verify summaries appear in the DB + context is injected into new /chat requests.`

