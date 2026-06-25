# OnyxAI Web App — Plan

Rebuild the mobile (Expo/RN) app as a fast web app. Reuse the same backend (Cloudflare Worker + Supabase) unchanged — the web client implements the same API contract.

---

## Stack decision

| Concern | Choice | Why |
|---|---|---|
| Build tool | **Vite** (not Next.js) | This directly fixes your "too slow to reflect changes" pain. Vite HMR is near-instant; Metro/Expo rebuilds are the slow part. It's an authed SPA — you don't need SSR/SEO, so Next.js adds complexity for nothing. |
| UI lib | **React 18 + TypeScript** | Same mental model as RN; reuse all your types. |
| Data fetching | **TanStack Query** ✅ | Correct call. Supabase reads -> `useQuery`, writes -> `useMutation`. Caching + auto-refetch removes the manual `useState/useEffect` fetching you have now. |
| Styling | **Tailwind** ✅ | Required. Port `constants/colors.ts` + `spacing.ts` + `typography.ts` into `tailwind.config` theme tokens so the design stays identical. |
| Routing | **React Router v6/7** | Replaces expo-router file routing. 7 routes total — small. |
| Global state | **Zustand (keep as-is)** | Already web-compatible; only swap AsyncStorage -> localStorage (5-line change, or use `persist` middleware). |
| Auth/DB | **@supabase/supabase-js (same client)** | Web storage adapter already exists in `lib/supabase.ts:22-37`. |
| Streaming | **native `fetch` + ReadableStream** | Browser fetch supports streaming, so swap `expoFetch` -> `fetch`. SSE parse logic is unchanged. |

---

## Repo structure (monorepo, share the pure core)

A large amount of your `lib/` is framework-agnostic. Don't fork it — share it.

```
onyxai/
  app/ components/ ...        <- existing Expo app (untouched)
  web/                        <- NEW Vite React app
    src/
      routes/                 <- React Router pages (mirror app/ screens)
      components/             <- HTML+Tailwind rebuilds of components/
      features/               <- TanStack Query hooks
      app.css                 <- Tailwind entry
  core/  (or keep in place and import via path alias)
      types/                  <- types/index.ts (verbatim)
      api/                    <- supabase queries, openrouter SSE, memory, search
      lib/                    <- markdown.ts, tokens.ts (pure)
      constants/              <- models.ts, colors.ts, spacing.ts, typography.ts
```

Pragmatic MVP: a standalone `web/` Vite app that imports the pure modules via a TS path alias (`@core/*` -> repo root). Promote to a real shared package later if it proves out.

---

## Reuse vs rewrite

### Ports cleanly (import / tiny edit)
- `types/index.ts` — verbatim
- `constants/models.ts`, `colors.ts`, `spacing.ts`, `typography.ts` — verbatim (colors also feed Tailwind theme)
- `lib/markdown.ts`, `lib/tokens.ts`, `lib/memory.ts` — pure TS, zero native deps
- `lib/supabase.ts` — already web-aware (web storage adapter exists)
- All Supabase table queries (conversations/messages/profile/usage/credits) — same calls
- SSE JSON protocol — same parse loop; just `expoFetch` -> `fetch`
- Zustand store — swap AsyncStorage -> localStorage

### Must rewrite for web
- Every screen + component (RN `View/Text/Pressable/FlatList/TextInput/ScrollView` -> HTML + Tailwind)
- Navigation: expo-router -> React Router (7 routes)
- File/image pickers: `expo-image-picker`/`expo-document-picker` -> `<input type="file">` (upload + resize web paths already written in `lib/uploads.ts`)
- `useAuth`: drop expo-linking / expo-web-browser / native google-signin; web OAuth path already exists behind `Platform.OS==="web"`
- Artifacts: `Flowchart` WebView -> `mermaid.render()` into a div; `ArtifactViewer.web.tsx` iframe already web-ready; FunctionPlot/Molecule3D/Chart re-impl with web libs
- Markdown: `react-native-markdown-display` -> `react-markdown` + remark/rehype (re-implement the custom fence dispatch + citation pills + math placeholders)
- KeyboardAvoidingView / SafeArea / gesture-handler -> delete; CSS handles it

---

## Backend contract (already mapped — the web client must implement)

Worker base: `EXPO_PUBLIC_WORKER_URL` (web env: `VITE_WORKER_URL`). All authed via `Authorization: Bearer <supabase access token>`.

- `GET  /health`
- `POST /chat` -> **SSE stream** (events: `sources` first, then OpenRouter `choices[].delta.content` chunks, then `{done:true, usage}`; `{error}` on failure). Body: `{conversationId?, model, messages[], enableSearch?, forceSearch?, idempotency_key?}` + `Idempotency-Key` header.
- `POST /chat/summarize`
- `POST /upload/analyze`
- `POST /embed`
- `POST /memory/extract`
- `POST /search`
- `POST /crawl`
- `POST /payments/create-order` | `/payments/verify` | `/payments/webhook`

Supabase tables: `user_profiles, conversations, messages, usage_events, credit_transactions, model_catalog` (client R/W); `search_results, memory_facts, conversation_summaries, top_up_orders, uploads` (worker-written).
RPC: `match_memory_facts` (client), plus worker-side `record_usage_and_charge`, `complete_top_up_order`, `match_messages`.
Storage buckets: `chat-images`, `chat-files` (public URLs).
Auth: email+password, Google OAuth (web redirect -> `/auth/callback`, PKCE).

---

## Phased build plan

**P0 — Scaffold (0.5d)**
Vite + React + TS, Tailwind (theme from colors/spacing/typography), React Router, TanStack Query provider, Supabase client, env (`VITE_*`). Path alias to shared core.

**P1 — Shared core wiring (0.5d)**
Import types/constants/lib. Create `web/src/api/` re-exporting supabase queries + a `streamChat()` that uses native fetch. Verify a raw `/chat` SSE call streams in the browser console.

**P2 — Auth + guards (1d)**
AuthProvider (reuse shape), sign-in / sign-up / callback routes, route guard (redirect unauthed -> /auth/sign-in). Google OAuth web path.

**P3 — Data hooks via TanStack Query (1d)**
`useConversations` -> `useQuery(['conversations',uid])`; `useMessages` -> `useQuery(['messages',convId])`; profile/credits queries; mutations for create/edit/delete. Zustand store with localStorage.

**P4 — Chat streaming (1.5d, hardest)**
Custom hook: `streaming`/`streamingContent` via useState, drive from SSE callbacks, append final message via `queryClient.setQueryData`. Abort controller for stop. Drop the fake-typing polyfill (web streams fine).

**P5 — Chat UI (2-3d)**
Layout shell, header (model badge + balance), MessageList (virtualize long lists), MessageBubble (user/assistant variants, citations, suggestions, regenerate), InputBar (textarea autosize, attach, search toggle, send/stop), Drawer (conversation list + search), ModelSelector. MarkdownRenderer + CodeBlock (copy, highlight).

**P6 — Artifacts (1-2d)**
HtmlArtifact iframe (ready), Flowchart via mermaid DOM, Chart, Roadmap, FunctionPlot, Molecule3D, PdfCard.

**P7 — Secondary screens (1-2d)**
Settings, Credits + Razorpay **web checkout** (`razorpay` web SDK, not the RN one), Memory.

**P8 — Uploads + polish (1d)**
`<input type=file>` for camera/gallery/docs, attachment previews, responsive layout, keyboard/focus, empty/error/loading states.

Rough total: ~10-14 dev-days for parity. Chat (P4-P5) is the spine; do it first after data is wired.

---

## The hard parts (flagged early)
1. **SSE streaming hook** — TanStack Query doesn't own streams; manage stream state manually, commit final to the query cache. (P4)
2. **Markdown engine swap** — re-implement custom fence dispatch, inline citation pills, and math placeholder extraction on `react-markdown`. (P5)
3. **Razorpay** — must use the web checkout SDK, different from the RN flow. (P7)
4. **Design fidelity** — port color/spacing/type tokens into Tailwind config first so every component is consistent by default.
