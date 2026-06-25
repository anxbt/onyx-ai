# onyxai — Closed AI

Open-source-model chat app for Indian engineering students. Cheap, fast, mobile-first. Currently in closed alpha on Google Play Store (v1.0.3, versionCode 13).

The positioning: same value as Claude / ChatGPT at ~1/40th the per-query cost, with open-source models routed via OpenRouter.

## Status as of June 3, 2026

- **Play Store**: v1.0.3 (versionCode 13) in Closed Testing Alpha
- **Live binary runtime**: `1.0.0` (baked in at build time before we bumped the project's `runtimeVersion`)
- **Source-tree runtime**: `1.0.1` (for future binary builds)
- **OTA strategy**: every push goes to BOTH runtimes (1.0.0 to reach the live broken binary, 1.0.1 for future binaries)
- **3–4 alpha users**

## Architecture (one-paragraph version)

```
React Native (Expo SDK 54) app ──┬── direct → Supabase (auth, conversations, storage, pgvector)
                                 │
                                 └── streaming → Cloudflare Worker /chat ──┬── OpenRouter (chat completions)
                                                                            └── Tavily (web search)
```

Full architectural decisions in [`ARCHITECTURE.md`](./ARCHITECTURE.md). Full implementation plan in `~/.claude/plans/so-here-are-the-noble-bunny.md`.

## Model catalog (June 3, 2026)

| Tier | Model | OpenRouter ID | Context | Pricing $/M | Reasoning |
|---|---|---|---|---|---|
| Free default | **Owl Alpha** | `openrouter/owl-alpha` | 1M | $0 / $0 (caveat: provider logs for training) | effort param |
| Paid default | DeepSeek V4 Pro | `deepseek/deepseek-v4-pro` | 1M | $0.435 / $0.87 | effort: low/med/high/xhigh |
| Multimodal | Qwen3.6 Plus | `qwen/qwen3.6-plus` | 1M | $0.325 / $1.95 | effort param |
| Deep reasoning | Kimi K2 Thinking | `moonshotai/kimi-k2-thinking` | 262K | $0.60 / $2.50 | always-on |
| Agentic reasoning | GLM-5.2 | `z-ai/glm-5.2` | 1M | $0.95 / $3.00 | effort: high/xhigh |

Internal-only (worker uses for OCR, classification, summarization): Gemini Flash Lite. Open-source replacement is on the roadmap.

## What's shipped (cumulative OTAs)

| Round | Sections | OTA(s) | Status |
|---|---|---|---|
| **Batch 1** — Bug fixes | 3 (vanishing first message), 3b (drawer cold-start), 3d (abort error banner), 3e (memory_facts wiring) | `b966de9e` (1.0.1), `9314f9b7` (1.0.0 backfill) | ✅ Live |
| **Settings patch** | "Check for updates" button + bundle ID display | `5aa6c5b4` | ✅ Live |
| **Auto-reload patch** | Updates fetch + reload on every cold start, kills the double-launch gotcha | `75cbe87c` | ✅ Live |
| **Batch 2a** — Catalog cleanup v1 | 4-model lineup (replaced with v2 below) | `c95b2ecf` | superseded |
| **Math placeholder fix** | 3c (a, d) — placeholder format no longer collides with markdown bold; AMS-LaTeX delimiters | `28978cbc` (1.0.1) + `64c587bb` (1.0.0) | ✅ Live |
| **Batch 3 + 5 + 7 + 7c** — see below | Catalog v2 (Owl Alpha) + reasoning UI + greeting + auto-scroll + reasoning panel | this round | ⏳ |

## Batch 3 + Section 5 + 7 + 7c (this round)

**What's bundled (all client + worker + 2 migrations)**:

| Section | What | Files |
|---|---|---|
| Batch 3 catalog | Owl Alpha at top (free, 1M context, agentic positioning) + DeepSeek V4 Pro paid default + GLM-5.2 agentic reasoning + Kimi output price (2.4→2.5) + per-model `reasoningConfig` | `constants/models.ts`, `worker/src/config.ts`, `types/index.ts`, migrations `0010` + `20260626091500` + `20260626093000` + `20260626093500` |
| Batch 3 reasoning UI | 💡 Thinking chip in input bar + bottom-sheet picker with 6 effort levels (none/min/low/med/high/xhigh) + per-model defaults + zustand persistence | `components/chat/ReasoningEffortSheet.tsx` (NEW), `store/app.ts`, `lib/openrouter.ts`, `hooks/useChat.ts`, `worker/src/chat.ts` |
| Section 7 | Time-of-day greeting (Good morning / Hello, night owl, etc.) + 3 starter prompt chips on every new chat | `lib/greeting.ts` (NEW), `constants/starter-prompts.ts` (NEW), `components/chat/NewChatGreeting.tsx` (NEW), `app/index.tsx` |
| Section 5 | Auto-scroll in MessageList during streaming, with 80px manual-scroll-up threshold | `components/chat/MessageList.tsx` |
| Section 7c | Reasoning panel: "Thinking…" with elapsed timer → collapsed "Thought for Xs" → tap to expand verbatim trace. Trace persisted in `messages.reasoning` column | `components/chat/ReasoningPanel.tsx` (NEW), `types/index.ts`, `lib/openrouter.ts`, `hooks/useChat.ts`, `lib/supabase.ts`, `worker/src/supabase.ts`, `worker/src/chat.ts`, `components/chat/MessageBubble.tsx`, `components/chat/MessageList.tsx`, migration `0011` |

**Deploy steps required before/with OTA**:
1. `supabase db push` → applies migrations `0010` + `0011`
2. `cd worker && npx wrangler deploy` → worker recognizes Owl Alpha ID + forwards `reasoning.effort` to OpenRouter + writes `messages.reasoning` column
3. OTA — published to both runtimes

## Pending work (in priority order)

| # | Section | What | Effort |
|---|---|---|---|
| 1 | 4c + 6 + 7b | Vision pipeline: upload OCR → text persists across all turns, auto-switch on image attach, always-include-attachment-turn | ~half day |
| 2 | 1 | Two-tier search foundation: Firecrawl integration + bolt button + worker plumbing | ~half day |
| 3 | 2 | Worker SSE hardening: explicit `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`, keepalive ping every 15s | ~30 min |
| 4 | 3c b/c | `<MathView>` WebView + KaTeX for actual math typesetting (currently math is positioned correctly but renders as raw LaTeX) | ~2-3 hrs |
| 5 | 4b | Replace internal Gemini Flash Lite with DeepSeek V4 Pro (text) + Qwen3.6 Plus (vision). Closes the open-source positioning leak | ~half day |

After those: **Chapter 2** (Perplexity-equivalent research engine, 5 days) and **Round 3** (Agent mode / tool use, ~1 week).

R&D track (research-only, not committed): Math Mode (PDE solver with critic loops), Visual diagrams (Mermaid + SVG).

## Key facts & lessons learned

### Runtime version gotcha
The v1.0.3 binary was built when `expo.runtimeVersion` was `"1.0.0"` (before we bumped to `"1.0.1"`). The binary asks for OTAs targeting runtime `1.0.0`. All my OTAs now go to BOTH runtimes — and that's the dance until users update to a future v1.0.4+ binary that has `runtimeVersion: "1.0.1"` baked in.

### Wrangler auth
Wrangler auth has expired on my local CLI; user runs `wrangler deploy` manually.

### `:free` model variants
DeepSeek V4 Flash's `:free` variant on OpenRouter is non-functional. The paid default now uses DeepSeek V4 Pro (`deepseek/deepseek-v4-pro`) instead.

### MATH placeholder format
Math placeholders use bare `MATH_N` (e.g. `MATH_8`) — NOT `__MATH_N__`. The former survives markdown parsing; the latter gets eaten by markdown's bold syntax (`__foo__` = `<strong>foo</strong>`).

### Reasoning protocol
OpenRouter normalizes reasoning across providers through `reasoning: { effort | max_tokens | enabled }` on input and `delta.reasoning_details[*]` on streaming output. No per-model `<think>` tag manipulation or `enable_thinking` plumbing needed. Effort levels: `none / minimal / low / medium / high / xhigh`.

### Supabase model_catalog table
The `model_catalog` table holds canonical pricing + visibility (`is_active`). Client picker reads `constants/models.ts` (hardcoded) rather than this table, but newly-installed clients with stale `MODELS` would respect the DB. Keep both in sync.

## Project structure (high level)

```
onyxai/
├── app/                     # Expo Router screens (index, auth, settings, etc.)
├── components/
│   ├── chat/               # MessageBubble, MessageList, MarkdownRenderer, MathView,
│   │                        # ReasoningPanel, ReasoningEffortSheet, NewChatGreeting, InputBar
│   ├── model/              # ModelSelector, ModelBadge
│   └── ui/                 # Drawer, Toast, generic
├── constants/              # colors, spacing, typography, models, starter-prompts
├── hooks/                  # useAuth, useChat, useConversations, useCredits
├── lib/                    # supabase, openrouter, markdown, greeting, uploads, models
├── store/                  # zustand (activeModelId, reasoningEffortByModel, etc.)
├── types/                  # ModelConfig, Message, ReasoningConfig, etc.
├── worker/                 # Cloudflare Worker (chat, search, memory, upload, supabase helpers)
├── supabase/migrations/    # 0001-0011 SQL migrations
├── ARCHITECTURE.md         # Decisions + reasoning
└── README.md               # this file
```

## Running

### Local dev (Expo Go)
```bash
npm install
npx expo start
```

### Worker dev
```bash
npm run worker:env   # sync env vars from .env to worker
npm run worker:dev   # wrangler dev
```

### Production OTA push
```bash
# Push to current binary runtime (v1.0.3 = 1.0.0)
# Temporarily edit app.json: "runtimeVersion": "1.0.0"
npx eas update --branch production --message "your message"
# Restore app.json: "runtimeVersion": "1.0.1"

# Push to future binary runtime (1.0.1)
npx eas update --branch production --message "your message"
```

### Apply Supabase migrations
```bash
supabase db push
```

### Deploy worker
```bash
cd worker && npx wrangler deploy
```

## Conversation index (for context recovery)

When the LLM context gets compacted and we lose history, key references:

- This README — current shipped state + pending work
- `ARCHITECTURE.md` — architectural decisions + the "why" behind them
- `~/.claude/plans/so-here-are-the-noble-bunny.md` — full implementation plan with all approved sections
- `supabase/migrations/0001-0011_*.sql` — schema evolution
- Worker dashboard (EAS, Supabase, Cloudflare) for live state

## Strategic positioning (one paragraph)

We build the **execution layer**, not new models. Tavily / Firecrawl / OpenRouter / Supabase do the heavy lifting; we orchestrate them into a chat experience tuned for Indian engineering students at a price they can actually pay. The wedge is the audience (BTech, GATE prep, basic CS through compiler design) and the price (~₹0.05/query vs ₹15/query Perplexity), not the underlying models. Compare early-Perplexity strategy in 2022 — same playbook, different audience.
