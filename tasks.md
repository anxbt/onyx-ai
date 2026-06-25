# Search & Deep-Research — Implementation Tasks

Goal: turn "dumb search" into the go-to research tool. Two tracks run in parallel:
**Engine** (make it correct & deep) and **Experience** (make it wow).

Legend: `[ ]` todo · effort in dev-days · KEY = highest leverage

---
## PHASE 0 — Auto-Intent (kill the manual toggle) · ~0.5d  [KEY]

The single biggest perceived-quality jump. Search must fire on its own.

- [ ] **0.1 Regex pre-pass trigger** — `worker/src/chat.ts`
  - Add a `shouldAutoSearch(text)` helper. Triggers: `/latest|current|today|now|recent|2025|2026/i`, `/price|cost|stock|weather|news|score|trending/i`, `/best|top \d+|vs|versus|compare/i`, `/reddit|twitter|x\.com|forum|reviews/i`.
  - If it hits, set `enableSearch = true` regardless of toggle.
  - Acceptance: "latest iPhone price" auto-searches with no toggle tapped.

- [ ] **0.2 Model-decides fallback (tool-calling)** — `worker/src/chat.ts`
  - When regex misses, expose a `web_search` tool in the OpenRouter request and let the model call it. Tool description lists the trigger taxonomy.
  - Acceptance: "who won the match yesterday" searches; "what is a binary tree" does not.

- [ ] **0.3 Repurpose toggles as override** — `app/index.tsx:43-44`, `components/chat/InputBar.tsx:119-135`
  - Globe/flash become "force on / auto / force off". Default = auto.

- [ ] **0.4 Surface that it searched** — `lib/openrouter.ts:259-261`, `components/chat/MessageBubble.tsx`
  - Emit + render a "Searched the web" chip so auto-search is never silent. Fixes silent-skip at `chat.ts:58-85`.

---

## PHASE 1 — Engine: make deep search actually deep · ~2d  [KEY]

All in `worker/src/deepsearch.ts` + `worker/src/chat.ts`.

- [ ] **1.1 Wire in Firecrawl (connect dead code)** — `worker/src/crawl.ts`, `deepsearch.ts`
  - After Tavily ranks, take top 3-5 URLs, Firecrawl `/scrape` (markdown), full page content. Firecrawl already coded at `crawl.ts` but only on the unused `/crawl` route.
  - Acceptance: model receives full articles, not 600-char snippets.

- [ ] **1.2 Goal-based extraction (replace truncation)** — new `worker/src/extract.ts`
  - Per scraped page, 1 cheap LLM pass -> `{ evidence[], summary }` relative to the question. Removes 500/600-char truncation at `deepsearch.ts:131` and `chat.ts:344`.

- [ ] **1.3 Real ranking** — `deepsearch.ts:99-111`
  - Use Tavily's own `score` (currently ignored) in RRF merge. Add domain-authority + recency weighting.

- [ ] **1.4 Gap-fill loop (the deferred Tier 2)** — `deepsearch.ts:18`
  - After first synthesis: 1 LLM call "what's still unanswered?" -> if gaps, one more search round. Cap = 2 iterations. Budget: <=20 searches, <=10 fetches.

- [ ] **1.5 Fix prompt ordering** — `chat.ts:359-361`
  - Move search context LAST in the system stack (closest to the question). Currently buried under response-type/verification/diagram instructions.

- [ ] **1.6 Validate query decomposition** — `deepsearch.ts:40-73`
  - Dedupe overlapping sub-queries; retry once on malformed JSON instead of silently falling back to `[query]`.

---

## PHASE 2 — Experience: Research Theater · ~1.5d  [KEY]

Make the process visible and alive. Reuses existing SSE.

- [ ] **2.1 Emit step events over SSE** — `worker/src/deepsearch.ts`, `worker/src/chat.ts`
  - New event types: `plan`, `searching`, `reading` (per source w/ favicon), `crosscheck`, `writing`.

- [ ] **2.2 Theater UI component** — new `components/chat/ResearchTrace.tsx`
  - Animated trace: planning -> searching -> source favicons popping in -> cross-checking -> writing. Collapses to a summary line when done.

- [ ] **2.3 Client event plumbing** — `lib/openrouter.ts:218-261`, `hooks/useChat.ts`

---

## PHASE 3 — Experience: Adaptive Answer Artifacts (the moat) · ~3d

Output morphs to the question. Reuses `components/artifacts/`.

- [ ] **3.1 Output-type classifier** — `worker/src/deepsearch.ts` (comparison | timeline | ranked-list | dashboard | prose)
- [ ] **3.2 Comparison-table artifact** — `components/artifacts/ComparisonTable.tsx` (new)
- [ ] **3.3 Timeline artifact** — `components/artifacts/Timeline.tsx` (new)
- [ ] **3.4 Ranked-cards artifact** — `components/artifacts/RankedCards.tsx` (new)
- [ ] **3.5 Wire into artifact renderer** — `components/artifacts/ArtifactViewer.tsx` (+ `.web.tsx`)

---

## PHASE 4 — Experience: Camera-to-Research (mobile magic) · ~3d

Most differentiated feature. Reuses `worker/src/vision-extract.ts`.

- [ ] **4.1 Camera/photo entry point** — `components/chat/InputBar.tsx`, `lib/uploads.ts`
- [ ] **4.2 Identify -> research pipeline** — `vision-extract.ts` -> `deepsearch.ts` (web + Reddit reviews)
- [ ] **4.3 Verdict card output** — reuse Phase 3 ranked-cards / dashboard artifact

---

## PHASE 5 — Trust Layer (impressive -> relied-upon) · ~2d

Builds on `lib/verify.ts`.

- [ ] **5.1 Confidence grading** — tag each claim green/amber/red (multi-source / single / conflict)
- [ ] **5.2 Show conflicts, don't hide them** — synthesis prompt + UI
- [ ] **5.3 Tappable inline citations** — `components/chat/MarkdownRenderer.tsx`, `MessageBubble.tsx`

---

## PHASE 6 — Moonshot: research that keeps living · ~3d

- [ ] **6.1 Follow-the-thread suggestions** — 3 tappable deeper follow-ups after each answer
- [ ] **6.2 "Watch this" monitoring** — worker cron + `supabase/migrations/`, re-run + diff
- [ ] **6.3 Change notifications** — push only when results materially change

---

## PHASE 7 — Multi-source / social (the Grok feel) · ~2d

- [ ] **7.1 Entity resolution** — topic -> handles/subreddits before searching
- [ ] **7.2 Two-phase discovery** — broad search surfaces entities -> re-query for depth
- [ ] **7.3 Reddit/X via Tavily/Exa** — accept 24-48h lag
- [ ] **7.4 Engagement-weighted ranking** — upvotes/views signal; cross-platform clustering

---

## Suggested order

1. Phase 0 (auto-intent) — search starts firing. 1/2 day.
2. Phase 1 (engine depth) — answers stop being shallow. 2 days.
3. Phase 2 (Theater) — it feels alive. 1.5 days.
4. Phase 4 (Camera) — the grab-your-phone demo.
5. Phase 3 / 5 / 6 / 7 — moat, trust, habit, social.

Phases 0-2 alone move it from "dumb" to "better than ChatGPT mobile search". Phases 3-4 make it *yours*.

---

## Key file map (from audit)

| Area | File |
|---|---|
| Chat handler / search dispatch | worker/src/chat.ts (quick 305-353, deep 292-303, stacking 359-361, classifier 58-85) |
| Deep search loop | worker/src/deepsearch.ts (decompose 40-73, tavily 75-94, RRF 99-111, run 113-140) |
| Firecrawl (dead code) | worker/src/crawl.ts |
| Standalone search route | worker/src/search.ts |
| Vision pipeline | worker/src/vision-extract.ts |
| Keys/env | worker/src/config.ts |
| Search flags state | app/index.tsx:43-44, 202-206 |
| Toggles UI | components/chat/InputBar.tsx:119-135 |
| Stream + sources client | lib/openrouter.ts:218-261 |
| Chat hook | hooks/useChat.ts:158, 230-232 |
| Artifact renderer | components/artifacts/ArtifactViewer.tsx (+ .web.tsx) |
| Message render | components/chat/MessageBubble.tsx, MarkdownRenderer.tsx |
