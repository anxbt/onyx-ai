# OnyxAI Web Migration Spec (copilot-executable)

## Context
The Expo/React Native app iterates slowly (Metro rebuilds). We are building a **standalone web client** in `web/` (Vite + React) that talks to the **same backend** (Cloudflare Worker + Supabase) with **strict feature parity**. This doc is the build spec: exact settings, every endpoint, every RN-native feature's web replacement, and edge cases. Hand each section to copilot as a task. No monorepo — `web/` has its own `package.json`/`node_modules` and imports nothing from the parent; pure files are **copied**.

Decisions made (override if desired): Vite SPA + React Router v6; TanStack Query; Tailwind; react-markdown stack; Razorpay web checkout. Scope = parity only (search-upgrade ideas in repo `tasks.md` are a separate track).

---

## 1. Scaffold

```bash
cd /Users/rishav/Documents/onyxai
npm create vite@latest web -- --template react-ts
cd web
npm i @supabase/supabase-js @tanstack/react-query react-router-dom zustand \
  react-markdown remark-gfm remark-math rehype-katex katex \
  react-syntax-highlighter mermaid lucide-react
npm i -D tailwindcss @tailwindcss/postcss postcss autoprefixer @types/react-syntax-highlighter vite-tsconfig-paths
# fonts (self-hosted, no FOUT)
npm i @fontsource-variable/inter-tight @fontsource/ibm-plex-sans @fontsource/jetbrains-mono
```

Razorpay checkout is loaded via `<script src="https://checkout.razorpay.com/v1/checkout.js">` in `index.html`. Tailwind v4 uses `@tailwindcss/postcss` + `@import "tailwindcss"` in CSS; if copilot prefers v3, use classic `tailwind.config`.

### File tree
```
web/
  index.html                     # <script checkout.js>, <meta theme-color="#141218">
  vite.config.ts                 # base "/", vite-tsconfig-paths
  postcss.config.js
  src/
    main.tsx                     # QueryClientProvider + RouterProvider + AuthProvider
    app.css                      # @import tailwindcss + @fontsource + katex.css + tokens
    routes/
      router.tsx                 # createBrowserRouter, guards
      ChatScreen.tsx             # "/"
      SignIn.tsx  SignUp.tsx  AuthCallback.tsx   # "/auth/*"
      Settings.tsx  Credits.tsx  Memory.tsx
    api/
      supabase.ts                # client + all DB fns (port of lib/supabase.ts, RN imports removed)
      stream.ts                  # streamChatFromWorker (native fetch)
      worker.ts                  # summarize/embed/memory/search/crawl/upload-analyze/payments
      uploads.ts                 # input-file pick + canvas resize + storage upload
    features/
      auth/AuthProvider.tsx  auth/useAuth.ts
      chat/useChat.ts            # streaming state machine (port of hooks/useChat.ts)
      chat/useConversations.ts   # useQuery
      queries.ts                 # query keys + profile/credits/usage/messages queries+mutations
    store/app.ts                 # zustand + localStorage
    components/                  # see §13
    lib/
      markdown.ts tokens.ts models.ts   # COPY from repo
    constants/ models.ts colors.ts config.ts   # COPY (colors drive tailwind theme)
    types/index.ts               # COPY
```

---

## 2. Env vars (`web/.env`)
Rename `EXPO_PUBLIC_*` → `VITE_*`; read via `import.meta.env`.

| Mobile | Web |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `VITE_SUPABASE_URL` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `VITE_SUPABASE_ANON_KEY` |
| `EXPO_PUBLIC_WORKER_URL` | `VITE_WORKER_URL` |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | not needed (OAuth uses Supabase redirect) |
| — | `VITE_RAZORPAY_KEY_ID` optional (key also returned by create-order) |

Helper: `const WORKER_URL = (import.meta.env.VITE_WORKER_URL ?? "http://localhost:8787").replace(/\/+$/,"")`.

---

## 3. Tailwind theme (exact tokens)

Colors verbatim from `constants/colors.ts`:
```
bg:#141218  surface:#15171a  surface-elev:#1d2024  surface-container:#211f24
primary:#D4A574  primary-container:#8B6B4A  on-primary:#1A1510  on-primary-container:#F5E6D3
accent:#D4A574  accent-muted:#8B6B4A  accent-subtle:#2A2118
text-primary:#e6e0e9  text-secondary:#cbc4d2  text-tertiary:#948e9c
border:#272a2f  border-strong:#3f3a47
danger:#ffb4ab  danger-muted:#93000a  success:#a8e6cf  warning:#e7c365
user-bubble:#21252b  assistant-surface:#15171a
code-bg:#1d2024  link:#D4A574  blockquote-border:#D4A574  blockquote-bg:#2A2118
table-border:#272a2f  table-header-bg:#1d2024  table-row-even:#15171a
syntax-keyword:#D4A574 syntax-string:#a8e6cf syntax-comment:#948e9c
syntax-number:#e7c365 syntax-function:#D4A574 syntax-operator:#cbc4d2 syntax-type:#a8e6cf
```
Spacing(px): xs:4 sm:8 md:12 lg:16 xl:24 xxl:40 ; mobile-margin:12 ; section-gap:24
Radius: icon:6 button:10 primary-action:12 container:14
fontFamily: display:"Inter Tight Variable"  body:"IBM Plex Sans"  mono:"JetBrains Mono"

Typography utilities (from `constants/typography.ts`):
| class | font | size/line | weight | extra |
|---|---|---|---|---|
| `.text-display-lg` | display | 24/32 | 600 | letter-spacing -0.48px |
| `.text-ui-md` | display | 14/20 | 500 | |
| `.text-ui-label` | display | 12/16 | 500 | letter-spacing 0.12px |
| `.text-body` | body | 15/26 | 400 | |
| `.text-body-bold` | body | 15/26 | 500 | |
| `.text-code` | mono | 13/20 | 400 | |
| `.text-data-mono` | mono | 12/16 | 600 | tabular-nums |

Global: `body { background:#141218; color:#e6e0e9 }`; use `100dvh` for full-height. Import `@fontsource-variable/inter-tight`, `@fontsource/ibm-plex-sans` (400,500), `@fontsource/jetbrains-mono` (400,500,600), `katex/dist/katex.min.css`.

---

## 4. Files to COPY verbatim
- `types/index.ts` → `src/types/index.ts`
- `constants/colors.ts`, `constants/models.ts` (`MODELS, DEFAULT_MODEL_ID, TOP_UP_PACKS, FRONTIER_BASELINE`), `constants/config.ts` → `src/constants/`
- `lib/markdown.ts` (math extraction, `safeTruncateForStreaming`, `extractResponseType`), `lib/tokens.ts` (`estimateTokens`), `lib/models.ts` (`getModelConfig`) → `src/lib/`

Replace `@/` with `vite-tsconfig-paths` alias or relative imports.

---

## 5. Supabase client — `src/api/supabase.ts`
Port `lib/supabase.ts`. Remove RN lines: `react-native-url-polyfill/auto`, `AsyncStorage`, `Platform`. Config:
```ts
createClient(url, anon, { auth: {
  storage: window.localStorage,
  persistSession: true, autoRefreshToken: true,
  flowType: "pkce", detectSessionInUrl: true,   // CHANGED from false: consume ?code= on callback
}})
```
Port verbatim (pure once RN import removed): `fetchProfile, ensureUserProfile, fetchConversationsForUser, fetchMessagesForConversation, fetchUsageForCurrentMonth, fetchCreditTransactions, fetchModelCatalog, createConversation, insertUserMessage, deleteMessagesAfter, updateMessageContent, updateConversationSummary`. Keep exact column lists + snake_case→camel mapping. Keep `supabaseUrl` export (uploads need it).

Rules to preserve: conversations page 20, `is_archived=false`, order `updated_at desc`, search `.or(title.ilike,preview.ilike)`; messages order `created_at asc`; usage from first-of-month; transactions limit 50; `updateConversationSummary` sets `title=preview.slice(0,48)`.

---

## 6. Worker endpoints (API contract)
Base `VITE_WORKER_URL`. All authed: `Authorization: Bearer <access_token>` from `supabase.auth.getSession()`.

| Method | Path | Request | Response | Stream |
|---|---|---|---|---|
| GET | `/health` | — | `{ok,service}` | no |
| POST | `/chat` | see §7 | SSE | **yes** |
| POST | `/chat/summarize` | `{conversationId}` | `{ok,summary,key_facts}` | no |
| POST | `/upload/analyze` | `{uploadId,storagePath,mimeType}` | `{ok,contentType,description,transcribedText}` | no |
| POST | `/embed` | `{text}` | `{ok,embedding:number[]}` | no |
| POST | `/memory/extract` | `{conversationId}` | `{ok,extracted}` | no |
| POST | `/search` | `{query,conversationId?}` | `{ok,results,answer,topics,relatedFacts,searchId}` | no |
| POST | `/crawl` | `{url}` | `{ok,title,url,content,contentLength}` | no |
| POST | `/payments/create-order` | `{packId}` or `{amount}` | `{keyId,orderId,amount,currency}` | no |
| POST | `/payments/verify` | `{razorpay_order_id,razorpay_payment_id,razorpay_signature}` | `{ok}` | no |

> `POST /payments/webhook` also exists on the Worker but is **server-to-server (called by Razorpay, no auth)** — the web client must NOT call it. There are 11 Worker routes total; the 10 above are the only client-callable ones. Beyond the Worker, the client also calls Supabase directly: tables `user_profiles, conversations, messages, usage_events, credit_transactions, model_catalog` (§5), RPC `match_memory_facts` (§5), storage buckets `chat-images`/`chat-files` (§16), and auth methods (§9).

`src/api/worker.ts`: one `postWorker(path,body,token)` wrapper + named exports `summarizeConversation, getEmbedding, extractMemoryFacts, searchWeb, crawlUrl, analyzeUpload, createOrder, verifyPayment`.

---

## 7. SSE streaming — `src/api/stream.ts` (critical port)
Port `lib/openrouter.ts` `streamChatFromWorker`; swap `expoFetch` → native `fetch` (browser supports `res.body.getReader()`). Keep all else identical.

Request body to `/chat`:
```json
{ "conversationId", "model": getModelConfig(modelId).id,
  "messages":[{role,content}], "enableSearch", "forceSearch" }
```
Header `Idempotency-Key: ${conversationId}:${Date.now()}` (required for credit dedup).

Vision content (`buildMessageContent`): only `role==="user"` with image attachments having `remoteUrl`. Model modality includes "image" → `content=[{type:"text",text},...{type:"image_url",image_url:{url:remoteUrl}}]`; else append a "model lacks vision" text note; otherwise plain string.

Parse loop (verbatim): read → `TextDecoder.decode(value,{stream:true})` → split `"\n"` → lines starting `"data: "` → `JSON.parse(line.slice(6).trim())`:
- `type==="sources"` → `onSources(sources)`; continue
- `done` → `onDone({messageId,usage})`; return
- `error` → `onError(new Error(error))`; return
- else `delta=choices?.[0]?.delta?.content` → `accumulated+=delta` → `onContent(accumulated)` (full accumulated string)
- malformed line → skip
- stream ends with content but no `done` → `onDone({messageId:null, usage:zeros})`

Abort: `AbortController`, pass `signal`, return cancel fn, swallow `AbortError`. `StreamCallbacks={onContent,onSources?,onDone,onError}`; `StreamDoneResult={messageId,usage:{promptTokens,completionTokens,totalTokens,chargedTotalCostInr}}`.

---

## 8. Chat state machine — `src/features/chat/useChat.ts`
Port `hooks/useChat.ts` 1:1. State: `messages, streaming, streamingContent, error, activeConversationId`; refs `abortRef, sawContentRef, polyfillTimerRef`. `global.setInterval`→`window.setInterval`. Preserve ALL rules:
- Mount of conversationId → `fetchMessagesForConversation`; null id → clear.
- `sendMessage(content,attachments,search)`: trim + accessToken guards → create conversation if none → `insertUserMessage` → optimistic append → `setStreaming(true)`.
- Background: `getEmbedding(trimmed,token)` then `messages.update({embedding}).eq(id)`; memory extract when `(allMessages.length+1)%15===0`.
- Request = `allMessages.slice(-8)`.
- `onDone`: if `!sawContentRef && finalContent` → **polyfill** reveal (`chunkSize=max(1,floor(len/30))`, `setInterval 50ms`, progressive slice, then push). Else push immediately.
- After done: `updateConversationSummary(convId, trimmed.slice(0,120), modelId, estimateTokens(...))`; summarize when `%10===0`.
- `regenerateLastAssistant`: truncate at last assistant, `deleteMessagesAfter(createdAt, includeBoundary=true)`, re-stream.
- `editUserMessage`: `updateMessageContent`, `deleteMessagesAfter(createdAt,false)`, re-stream truncated.
- `stopStreaming`: cancel + clear polyfill timer + reset flags.
- Expose `estimatedTokens` (streaming?streamingContent:last content).

Streaming state lives in this hook (NOT useMutation). Optionally `queryClient.invalidateQueries(['messages',convId])` on done.

---

## 9. Auth — `src/features/auth/`
`AuthProvider` holds `{session,profile,isLoading,authError}`. Mount: `getSession()` + `onAuthStateChange`; on login `ensureUserProfile(user.id,{email,displayName})`. Build `SessionLike={user:{id,email,displayName,avatarUrl}, accessToken:session.access_token}`.
- Email sign-in: `signInWithPassword({email:email.toLowerCase(),password})`.
- Email sign-up: `signUp({email,password})`; no session → "check email to confirm".
- Google: `signInWithOAuth({provider:"google", options:{redirectTo:`${window.location.origin}/auth/callback`}})`. Drop native google-signin.
- `/auth/callback`: `detectSessionInUrl:true` auto-exchanges `?code=`; `await getSession()` then `navigate("/",{replace:true})`. Fallback `exchangeCodeForSession(window.location.href)`.
- Sign out: `signOut()` → `/auth/sign-in`.
Guard (`router.tsx`): no session & not `/auth/*` → `<Navigate to="/auth/sign-in" replace>`; session & on `/auth/*` → `<Navigate to="/" replace>`. Splash while `isLoading`.

---

## 10. Store — `src/store/app.ts`
Port zustand. AsyncStorage → `localStorage` (or `persist` + `createJSONStorage(()=>localStorage)`), key `"closedai-store"`, persist only `activeModelId`. On init validate stored id against `MODELS`. Fields: `activeModelId, creditBalance, activeConversationId, memoryIndicatorVisible, activeArtifactTab` + setters.

---

## 11. TanStack Query — `src/features/queries.ts`
`main.tsx`: `new QueryClient({defaultOptions:{queries:{staleTime:30_000,retry:1}}})`.
| Key | Fn | Type |
|---|---|---|
| `['profile',uid]` | `fetchProfile` | query |
| `['conversations',uid,search]` | `fetchConversationsForUser` | query (keepPreviousData) |
| `['messages',convId]` | `fetchMessagesForConversation` | query (or owned by useChat) |
| `['usage',uid]` | `fetchUsageForCurrentMonth` | query |
| `['transactions',uid]` | `fetchCreditTransactions` | query |
| `['modelCatalog']` | `fetchModelCatalog` | query (staleTime ∞) |
| conversation/message create·edit·delete | supabase fns | mutation → invalidate |

---

## 12. Routing — React Router v6
`createBrowserRouter`: `/`, `/auth/sign-in`, `/auth/sign-up`, `/auth/callback`, `/settings`, `/credits`, `/memory`. `router.push`→`navigate`, `router.replace`→`navigate(...,{replace:true})`, `router.back`→`navigate(-1)`, `<Redirect>`→`<Navigate>`, `useSegments`→`useLocation`.

---

## 13. Component spec (RN → HTML + Tailwind)
Primitive mapping: `View`→`div`, `Text`→`span/p`, `Pressable`→`button`, multiline `TextInput`→`textarea`, `TextInput`→`input`, `ScrollView`→`div overflow-y-auto`, `FlatList`→`.map()` (virtualize long lists with `@tanstack/react-virtual`), `Image`→`img`, `ActivityIndicator`→CSS spinner, `Modal`→fixed overlay, `KeyboardAvoidingView`/`SafeArea`→drop (`100dvh`+`env(safe-area-inset-*)`), inline styles→Tailwind.

| Component | Renders / behavior |
|---|---|
| `ChatScreen` | header (hamburger→Drawer, ModelBadge center, wallet ₹balance amber if<50) + error banner + MessageList + InputBar; overlays ModelSelector, Drawer; `flex flex-col h-[100dvh]` |
| `MessageList` | maps MessageBubble + ephemeral streaming bubble when `streamingContent` non-empty; auto-scroll to bottom |
| `MessageBubble` | user: right amber bubble, edit+timestamp; assistant: full-width, response-type badge, uncertainty banner if no sources, MarkdownRenderer, CitationCards, SuggestionChips, model+time+Regenerate; memoize; inline edit=textarea |
| `InputBar` | auto-grow textarea, token estimate, camera/attach/globe-search toggles, Send/Stop; "Top up credits" when depleted on paid model; Enter=send, Shift+Enter=newline |
| `Drawer` | left 300px + backdrop; avatar+username+credits, "NEW CHAT", filtered conversation list (search), settings icon; `translate-x` transition |
| `ModelSelector` | bottom sheet listing `MODELS`; name/desc/provider/context/output-cost; amber border+"ACTIVE" on current; sets `activeModelId` |
| `ModelBadge` | current model name → opens ModelSelector |
| `CodeBlock` | dark block, language badge, Copy (2s "Copied!"), horizontal scroll, line numbers; `react-syntax-highlighter` Prism w/ custom theme from syntax-* colors |
| `MarkdownRenderer` | §14 |
| `CitationCard`/`SourceCard` | web source card (title,url,snippet) |
| `SuggestionChips` | chips parsed from trailing `[Suggestions]` block |
| `StreamingIndicator` | typing dots (CSS) |
| `CreditBalance` | "BALANCE" + `₹{balance.toFixed(2)}` 28px bold |
| `TopUpSheet` | tabs Custom (₹10/20/50/100 pills + input, validate 10–10000) & Packs (`TOP_UP_PACKS`) → Razorpay |
| `MemoryFactCard` | category, confidence, content |
| `EmptyState` | title+desc |
| `SignIn` | marketing hero (logo, headline, model cost table, email+pw, Google btn, footer stats); mobile uses moss-green `#99FFAA` accent — keep or normalize to amber (decide) |

---

## 14. Markdown renderer — `src/components/MarkdownRenderer.tsx`
`react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex`. Preserve pipeline:
1. **Pre-parse** `extractResponseType(content)` → strip leading `<!--type:answer|analysis|tutorial|creative-->`, get badge; hide partial marker mid-stream until `-->`.
2. **Streaming safety** `safeTruncateForStreaming` (no unclosed fences/backticks/links).
3. **Math** via remark-math+rehype-katex (drop the placeholder swap on web; fall back to `extractMath` if KaTeX mis-parses).
4. **Custom fences** via `components.code` by language: `mermaid`/`flowchart`→`<Flowchart>`, `chart`→`<Chart>`, `roadmap`→`<Roadmap>`, `html`→`<HtmlArtifact>`, `data-type="pdf"`→`<PdfCard>`, else `<CodeBlock>`.
5. **Citation pills**: turn `[1]`,`[2]` text into clickable pills linking to the matching `Source`.
6. **Links** `<a target="_blank" rel="noopener">`.

---

## 15. Artifacts — `src/components/artifacts/`
| Artifact | Web |
|---|---|
| HtmlArtifact | `<iframe srcDoc={html} sandbox="allow-scripts">` (web path exists in `ArtifactViewer.web.tsx`) |
| Flowchart | `mermaid.render(id,code)` → inject SVG; `mermaid.initialize({theme:'dark',themeVariables})` |
| Chart | recharts (parse same block schema) |
| Roadmap | port layout to divs |
| FunctionPlot | `function-plot` or mafs |
| Molecule3D | `3dmol.js` |
| PdfCard | link/embed or pdf.js |

Read repo `components/artifacts/*` + `MarkdownRenderer.tsx` for each block's input schema before reimplementing.

---

## 16. Uploads — `src/api/uploads.ts`
Replace expo pickers with `<input type="file">`: camera `accept="image/*" capture="environment"`; gallery `accept="image/*"`; docs `accept=".pdf,.txt,.md,.json,.csv,.doc,.docx"`. Build Attachment from File: `{id:'img-'+ts+rand, name, type, uri:URL.createObjectURL(file), mimeType:file.type, sizeBytes:file.size}`.

`uploadToStorage` (web branch, port): bucket `chat-images`/`chat-files`; path `${userId}/${ts}-${name.replace(/[^a-zA-Z0-9._-]/g,"_")}`; image → `resizeImageWeb` (canvas, max 512px, JPEG q0.7 — code exists `lib/uploads.ts:26-53`); body=`await (await fetch(objectUrl)).blob()`; `storage.from(bucket).upload(path,blob,{contentType,upsert:false})`; public URL `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`; set `remoteUrl`+`uri`; then fire-and-forget `analyzeUpload(uploadId,storagePath,mimeType,token)`.

---

## 17. Payments — Razorpay web checkout
1. Load `checkout.js` (index.html).
2. `createOrder({packId}|{amount})` → `{keyId,orderId,amount,currency}`.
3. `new window.Razorpay({key:keyId, order_id:orderId, amount, currency, name:"OnyxAI", handler: async resp => { await verifyPayment({razorpay_order_id:resp.razorpay_order_id, razorpay_payment_id:resp.razorpay_payment_id, razorpay_signature:resp.razorpay_signature}); queryClient.invalidateQueries(['profile']); }}).open()`.
4. On `payment.failed` show error; validate amount 10–10000 before create-order.

---

## 18. Mobile-native → web (master table)
| Mobile | Web |
|---|---|
| expo-router | react-router-dom |
| expo/fetch (SSE) | native `fetch` + `body.getReader()` |
| async-storage | `localStorage` |
| expo-image-picker / document-picker | `<input type=file>` |
| expo-image-manipulator | canvas resize (code exists) |
| expo-file-system | `fetch(objectURL).blob()` |
| expo-clipboard | `navigator.clipboard.writeText` (fallback execCommand) |
| expo-web-browser | `window.open(url,"_blank")` |
| expo-linking | `window.location` / router |
| @react-native-google-signin | `supabase.auth.signInWithOAuth` |
| react-native-webview | `<iframe>` / mermaid DOM |
| react-native-markdown-display | react-markdown + remark/rehype |
| reanimated / gesture-handler | CSS transitions / Framer Motion |
| KeyboardAvoidingView / SafeAreaContext | `100dvh` + `env(safe-area-inset-*)` |
| @expo-google-fonts/* | @fontsource/* |
| expo-status-bar / system-ui | `<meta theme-color>` / body bg |
| @expo/vector-icons | lucide-react |

---

## 19. Edge cases (handle explicitly)
- **SSE abort**: AbortController; swallow `AbortError`; clear polyfill timer in `stopStreaming`.
- **Stream ends without `done`**: synthesize onDone with zero usage.
- **Polyfill double-stream**: only when `!sawContentRef && finalContent`.
- **Idempotency**: always send `Idempotency-Key` or credits double-charge.
- **Token refresh mid-stream**: fetch fresh `accessToken` from `getSession()` at send time (don't cache stale).
- **Vision mismatch**: text-note fallback when attachments exist but model lacks "image" modality.
- **Email-confirm pending**: `signUp` no session → confirm screen, not logged in.
- **OAuth callback race**: wait for `onAuthStateChange` before redirect; guard double-exchange.
- **localStorage disabled / SSR**: guard `typeof window`.
- **Stale persisted model id**: validate vs `MODELS`.
- **Conversation pagination**: page 20; infinite scroll / load-more.
- **Long messages**: virtualize MessageList; memoize MessageBubble per id so only the streaming bubble re-renders.
- **Markdown during stream**: pass through `safeTruncateForStreaming`; hide partial `<!--type-->`.
- **Code copy on http**: `navigator.clipboard` may be blocked → hidden-textarea `execCommand` fallback.
- **objectURL leaks**: revoke after upload and on attachment removal.
- **Balance gating**: disable Send + show "Top up" when `creditBalance<=0` on a paid model.
- **Empty/error/loading**: every query renders skeleton/empty/error.
- **Worker 401**: refresh session once + retry; else redirect to sign-in.

---

## 20. Build order
1. Scaffold + Tailwind tokens + fonts + env + copy pure files (§1–4).
2. Supabase client + API layer + `stream.ts`; smoke-test raw `/chat` SSE in console (§5–7).
3. AuthProvider + routes + guards (§9,§12).
4. TanStack queries + zustand store (§10–11).
5. `useChat` streaming hook (§8).
6. Chat UI: ChatScreen, MessageList, MessageBubble, InputBar, MarkdownRenderer, CodeBlock (§13–14).
7. Drawer, ModelSelector, ModelBadge.
8. Artifacts (§15).
9. Settings, Credits + Razorpay, Memory, uploads (§16–17).
10. Edge-case pass + polish (§19).

---

## 21. Verification
- `npm run dev` → sign in (email + Google) → chat.
- Send on **free** model: tokens stream; message persists; reload → history loads.
- Web-search toggle → `sources` event renders CitationCards.
- Attach image on vision model → uploads to `chat-images`, model sees it; non-vision → text-note fallback.
- Stop mid-stream → no crash, no double message, no orphan timer.
- Regenerate + edit-user-message → truncates and re-streams.
- Markdown-heavy reply (code, table, math, mermaid) renders correctly.
- Razorpay test top-up → balance updates after verify.
- Switch model → persists across reload.
- Network tab: `Idempotency-Key` present on `/chat`; one charge per send.
- A conversation renders identically to the mobile app.
