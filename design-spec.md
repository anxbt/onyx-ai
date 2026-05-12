# Direction A — "Minimal Editor"
## Written Specification

**Project:** Kestrel · multi-model AI chat
**Direction:** A — Minimal Editor (Linear/Arc-grade restraint, type-led, dark)
**Files:** `app-a.jsx` · `screens.jsx` · `data.jsx` · `icons.jsx` · `style.css` · `shell.jsx`

---

## 1. Design tokens

### Colors (CSS custom properties on `.ma-root.ma-A`)

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#0d0e10` | Page background. Near-black with a 2° warm undertone — not pure `#000`. |
| `--surface` | `#15171a` | Cards, composer, picker rows, settings groups. |
| `--elevated` | `#1d2024` | Inline `<code>` background, avatar block. |
| `--hair` | `#272a2f` | Primary 0.5px dividers, button borders, selected-row outlines. |
| `--hair-soft` | `#1f2226` | Inter-row dividers inside lists. |
| `--txt` | `#ececed` | Primary text, headings. |
| `--txt-2` | `#9a9ea4` | Secondary text, metadata, secondary buttons. |
| `--txt-3` | `#5d6168` | Tertiary text, mono captions, idle icons. |
| `--accent` | `oklch(0.74 0.13 155)` | **Single accent.** Live dots, money figures, primary CTA, active-model marker, streaming caret. |
| `--accent-bg` | `oklch(0.34 0.06 155 / 0.32)` | Active-pill background, "Best value" tag chip background. |
| `--user-bubble` | `#21252b` | Right-aligned user message bubble. |
| `--danger` | `oklch(0.66 0.18 25)` | Sign-out row, destructive actions only. |
| `--warn` | `oklch(0.78 0.13 75)` | Reserved for budget warnings (not used in A yet). |

### Colorways (variants of `--accent`, swapped via class)

`cw-moss` (default) · `cw-amber` · `cw-coral` · `cw-sky` · `cw-iris` · `cw-rose` · `cw-bone` · `cw-graphite` · `cw-paper` (light-mode bonus). Same UI, accent only.

### Typography

| Family | Role | Weights | CSS class |
|---|---|---|---|
| Inter Tight | Display & UI labels | 400 / 500 / 600 / 700 | (default on `.ma-root`) |
| IBM Plex Sans | Body copy & message text | 400 / 500 | `.body` |
| JetBrains Mono | Numbers, prices, model IDs, tokens, timestamps | 400 / 500 / 600 / 700 | `.mono` |

`font-feature-settings: 'tnum'` on `.num` for tabular alignment of money columns. Tracking is `-0.01em` on UI labels, `0` on mono.

### Spacing & radii

- Radii: **6px** (small chip / glyph), **10px** (button), **12px** (CTA, model card), **14px** (composer & list group). Hairline dividers are flat (0px).
- Touch target floor: **40×40px**.
- Body text: 14.5px / line-height 1.55.
- Section labels: 11px UPPERCASE, 0.08em tracking, mono.

### Model glyphs

A 2-letter monogram in a flat colored square — never logos, never circles. Color tokens:

| Class | Background | Text |
|---|---|---|
| `.g-deepseek` | `#2c4a6e` | `#d8e8ff` |
| `.g-qwen` | `#4a3f6b` | `#e2dbf2` |
| `.g-glm` | `#6e3f4a` | `#f2dbe0` |
| `.g-kimi` | `#2a5a4e` | `#d6f0e6` |
| `.g-llama` | `#6b4a2c` | `#f2e2c8` |
| `.g-mistral` | `#3a3a40` | `#d6d8dc` |
| `.g-yi` | `#5a3a5a` | `#e8d6e8` |

---

## 2. Component inventory

All components live in `app-a.jsx` unless noted. Screen containers in `screens.jsx`.

### `<ModelGlyph model={Model} size={px} radius={px}>`
The 2-letter monogram tile. Default radius is `size / 4`. Pulls color via `model.glyph` class.

### `<TopChrome model onModel onMenu title>`
Sticky header inside every screen.
- **Layout:** 14/14/12 padding · 0.5px bottom hairline · 32×32 menu button (left) · model pill (flex 1) · 32×32 ⋯ button (right).
- **Model pill** is a button: `<glyph 20px>` + model name (13px / 500) + 11px chevron-down. Tap → opens model picker.
- **Menu button** (hamburger, 18px, `--txt-2`) → opens History.
- **More button** (3 dots, 18px) → currently a no-op placeholder for chat options.
- If `title` is passed, the pill is replaced by a static title — used for non-chat screens.

### `<Composer model draft setDraft onSend streaming runningCost>`
Bottom dock. **Two stacked rows above the keyboard:**

**Row 1 — Cost ribbon** (the differentiator). 6×14 padding. 11px mono, `--txt-3`.
- Idle state: `● est $0.0001 · 0.27/0.55 per 1M ··· session $0.0247`
- Streaming state: `<live-dot> streaming · this turn $0.0008 ··· session $0.0247` — dot pulses every 1.6s; "this turn" figure increments live as `streamTok` grows.

**Row 2 — Input box**
- Surface card, 14px radius, 0.5px hairline.
- Top: 22px-tall draft area. Placeholder: `Message {Model.name}…` in `--txt-3`.
- Bottom utility row: 📎 attach (16) · 🌐 web (14) · spacer · `{n} tok` mono counter (10.5px). Live token estimate = `Math.max(1, draft.length / 4)`.
- **Send button** (right, 40×40, 12px radius):
  - Empty draft → surface bg, hairline border, idle icon `--txt-3`.
  - Has content → `--accent` bg, `#0d0e10` icon (high contrast on green), `arrowUp`.
  - Streaming → small black square (stop affordance) on accent.
  - Transition: `background 0.15s`.

### `<UserMsg text>`
Right-aligned bubble. Max 82% width. `--user-bubble` bg. Asymmetric radius `14 14 4 14` (squared lower-right tail). 9×13 padding. 14.5px IBM Plex Sans, line-height 1.45.

### `<AsstMsg text model inTok outTok dur streaming>`
Full-bleed, no bubble — just typography in the page flow.
- **Header row:** `<glyph 18px>` + model name (12px / 500, `--txt-2`). When streaming, append `<live-dot>`.
- **Body:** rendered Markdown via `renderMd()` — supports `**bold**`, `` `code` ``, numbered lists, paragraphs. Streaming appends `<span class="caret">` (7px × 1.05em accent block, 1s blink).
- **Meta footer (idle only):** mono 10.5px row. Format: `$0.0008 · 86 tok · 3.1s ··· [copy] [refresh] [swap]`. Cost is `--accent` colored. Right-side icon buttons trigger reactions/actions.

### `<HomeScreen model onModel onSend onNav>` *(`screens.jsx`)*
The empty state shown when launching a new chat.
- TopChrome pinned.
- Hero block: `morning, alex` (mono 11px caption) + `What are we / thinking through today?` (28px / 500, second line `--txt-2`).
- **Suggestion stack:** 4 rows in a single 14px-radius group, separated by 1px hairlines. Each row: label (14.5/500) + sub-label (12/`--txt-3`) + chevron-right. Tap → pre-fills the composer (currently a no-op stub).
- **Quick-switch model strip:** horizontal scroll, 5 model cards. Each card 130px wide: glyph + active-dot · name (12/500) · `$0.55/M out` (mono 10). Active card is `--accent-bg` with accent border. "browse all →" link top-right opens full picker.
- Composer at bottom.

### `<ChatScreen model onModel onNav autoStream>` *(`screens.jsx`)*
Active conversation.
- Seeded from `CHAT_THREAD` (3 turns: user → assistant → user, asking to switch to DeepSeek and refactor `pricing.ts`).
- `autoStream` boolean: when true (set when arriving from a HomeScreen send), kicks `startStream()` after 400ms.
- **Stream behavior:** `startStream()` walks `ASSISTANT_REPLY` (~520 chars), advancing `i` by 2-5 chars every 28-58ms (jittered). Each tick updates `streamText`, recomputes `streamTok = floor(len/4.2)`, and bumps `scroller.scrollTop`. On completion, the streaming bubble is committed to `thread` with final `outTok`, `dur=3.1s`, `inTok=24`.
- **Running cost:** `costFor(model, 24, streamTok)` recalculated every tick, displayed in the Composer's cost ribbon.

### `<ModelPickerScreen current onPick onClose>` *(`screens.jsx`)*
Full-screen take-over.
- **Header:** ✕ close (32×32) · "Choose a model" (16/500) · "Compare" link.
- **Hero copy:** "7 models, all configured." (22/500) + descriptive line (13/`--txt-2`).
- **Filter chips** (horizontal scroll): All · Open source · China-hosted · Fast (80+ tok/s). Active chip uses `--surface` bg + `--txt-2` border. Filters are exclusive (radio).
- **Sort row:** mono 11px — `↓ cheapest` (default) · `↓ fastest`. Active sort is `--accent`.
- **Model rows:** 14×0 padding, 0.5px bottom hairline.
  - 36px square glyph (radius 8).
  - Title (14.5/500) · optional tag chip (`Best value`/`Cheapest`/`Multilingual`/`200K context` — 9.5px UPPERCASE, accent-bg fill, `--accent` text).
  - Active row shows ✓ check (16px, `--accent`) at right.
  - Subtitle: country flag SVG · provider · `OSS · MIT` license string.
  - Body blurb (12.5px IBM Plex, `--txt-2`).
  - Mono meta: `$0.55/M out` (out price in accent) · `89 tok/s` · `128K ctx`.
- **Frontier reference block** at bottom: dashed-border surface card titled "FOR REFERENCE". Lists GPT-4o ($10/M) and Claude 3.5 ($15/M) with computed `Nx DS` ratios in accent. Reinforces the value-prop without hostility.

### `<HistoryScreen onClose onOpen>` *(`screens.jsx`)*
- Header: ✕ · "Chats" · 🔍 search · `+` new (in accent).
- **Session ledger card** (the second cost-transparency surface): two columns separated by a 0.5px hairline. Left: "THIS MONTH" → `$0.4128`. Right: "SAVED VS FRONTIER" → `$5.84` in `--accent`. Both numbers mono 17px, `-0.01em` tracking.
- "PINNED" section (mono 11 caption) → pinned chats.
- "RECENT" section → all others.
- Each `<ChatRow>`: 28px glyph + title (13.5/500, ellipsis) + 1-line preview (`--txt-2`) + footer line `Just now · 14 msgs · $0.0023`.

### `<SettingsScreen onClose>` *(`screens.jsx`)*
Grouped iOS-style.
- **Account card:** 38px square avatar · name + `email · Pay-as-you-go` · chevron.
- Sections: **Spend** (Balance $8.42 mono, Auto-reload, Monthly cap, Receipts) · **Models** (Default, Routing, Region, Streaming toggle) · **Privacy** (3 rows incl. toggles) · **About** (Version, Help, Sign out — `--danger`).
- `<SetRow>` supports: `detail` text · `toggle` (36×20 pill, 16px knob, `--accent` on / `--elevated` off, 0.15s slide) · `sub` (11px caption beneath title) · `mono` (tabular numerals for prices) · `danger` (red title).

### `<CompareScreen onClose>` *(`screens.jsx`)*
Two side-by-side columns under one prompt.
- Top header: ✕ · "Compare" · `+ add 3rd` (mono accent link).
- Prompt bubble (user-bubble color, 13px, full-width).
- **Two-column grid** with a 0.5px central divider:
  - Each column has a sticky `--surface` header: glyph + model name.
  - Body: rendered markdown reply, 12.5/IBM Plex.
  - Footer: mono — `$0.0042 (accent) · 4.0s ··· use →`. "use →" picks that model and returns to chat.

### `<OnboardingScreen onStart>` *(`screens.jsx`)*
Single landing.
- Logotype: 22×22 accent square with mono "K" + `kestrel` wordmark (14/600).
- Hero: `Seven AI models. / One chat. / 10× cheaper.` — 32px / 500 / `-0.025em`. Line 2 in `--txt-2`, line 3 in `--accent`.
- **Comparison ledger** (the strongest cost-transparency moment): boxed mono table, 5 rows: Yi Lightning ($0.00014, "cheapest", accent) → DeepSeek → Llama → GPT-4o → Claude 3.5 (top frontier in `--txt-3`).
- Primary CTA (50px, 12px radius, accent bg, black text): `Start free · $0.50 included`.
- Secondary link below: "I already have an account".

---

## 3. Data shapes

```js
Model = {
  id: string,            // 'deepseek-v3'
  name: string,          // 'DeepSeek V3'
  mono: string,          // 'DS' — used by glyph
  glyph: string,         // 'g-deepseek' — CSS class
  provider, country,     // 'DeepSeek', 'CN' (flag SVG: CN/US/EU)
  license: string,       // 'OSS · MIT' | 'OSS · Apache' | 'Hosted'
  inP, outP: number,     // $ per 1M tokens, input & output
  ctx: number,           // K tokens (128, 131, 200…)
  speed: number,         // tok/s
  tag?: string,          // 'Best value', 'Cheapest', etc — drives the chip
  blurb: string,         // 1-line description in picker
}
```

`costFor(model, inTok, outTok) = (model.inP * inTok + model.outP * outTok) / 1_000_000`

`fmtCost(c)` adapts precision: `$0.000004` < `$0.00012` < `$0.0123` < `$1.23`.

---

## 4. Interactions

### Navigation graph

```
onboarding ──Start──> home
home ──menu(☰)──> history
home ──model pill──> models
home ──suggestion / send──> chat (autoStream=true)
chat ──menu──> history
chat ──model pill──> models
models ──pick──> chat (with new model selected)
models ──close──> previous
history ──open row──> chat (with that conversation's model)
settings ──back──> home
compare ──close──> home
compare ──"use →"──> chat with picked model
```

### Streaming sequence (the core demo)

1. User taps Send (or arrives on `chat` with `autoStream`).
2. Send button morphs to Stop (small black square on accent).
3. After 280ms, stream starts. Cost ribbon switches to "streaming" mode with pulsing live-dot.
4. Caret blinks at end of partial text.
5. Stream advances 2–5 chars / 28–58ms, jittered. Auto-scroll keeps caret in view.
6. On completion: ribbon returns to idle, message gets its meta footer with final `$cost · tok · dur`, send button returns to idle.

### Cost-transparency surfaces (recap — appears in 4 places)

1. **Composer ribbon** — always-on, live during stream.
2. **Per-message footer** — locked-in cost after each turn.
3. **History ledger** — month total + "saved vs frontier".
4. **Onboarding comparison** — pre-signup proof point.

### Live counters

- **Live-dot** (`.live-dot`): 6px accent circle, `livepulse` keyframe (1.6s ease-in-out): box-shadow expands from 0 → 4px at 50% opacity, then fades.
- **Caret** (`.caret`): accent block, 1s steps(2) blink between full and 0 opacity.

### Toggle (settings)

- 36×20 pill. Knob: 16×16 white circle, `top: 2`, `left: 2 (off) / 18 (on)`. Bg switches `--elevated` ↔ `--accent` with `transition: background 0.15s`. Knob slides via `transition: left 0.15s`.

### Filter chips (model picker)

- Stateful; one selected at a time. Inactive: transparent bg, `--hair` border, `--txt-2` text. Active: `--surface` bg, `--txt-2` border, `--txt` text. No hover state — tap-driven.

### Model swap mid-conversation

- Tapping the model pill in chat opens picker. Selecting a different model returns to chat with the new model's tokens applied. `inP`/`outP` flip immediately in the cost ribbon. (Future: a faint "switched to X" inline marker between turns — not yet implemented.)

---

## 5. Accessibility & quality notes

- All icon-only buttons are 32×32 minimum (≥40 for primary). Color contrast ≥4.5:1 for body text on `--bg`.
- Tabular numerals on every price/token figure prevent jitter during streaming.
- No animations >300ms outside the live-dot pulse and caret blink.
- Single accent across UI; meaning is consistent ("live", "money", "primary action") so users learn it once.
- No emoji used as functional icons. No purple/pink gradients. No sparkles, no robot avatars, no glowing orbs.

---

## 6. What is NOT yet built (honest gaps)

- Suggestion-tap doesn't pre-fill the composer (placeholder rows).
- The 📎 attach and 🌐 web buttons in the composer are visual only.
- The mid-conversation model-switch indicator (an inline divider noting the swap) — design TBD.
- Search in History opens nothing — needs a search overlay.
- "+ add 3rd" in Compare needs a third-column layout & responsive collapse.
- Voice input (mic), file uploads, and shareable links are not in scope of this pass.
