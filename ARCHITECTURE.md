# Architecture Decisions

A running log of the architectural choices made in this codebase and **why** —
so future-you (or another contributor) can tell whether a decision still
applies or has been outgrown.

Each entry follows the same pattern: **Decision → Why → How to apply / break**.

---

## 1. Environment variables: `EXPO_PUBLIC_*` in `eas.json` build profiles

**Decision**: All client-facing config (Supabase URL/anon key, Worker URL) is
exposed to the JS bundle via `EXPO_PUBLIC_*` variables, declared once in `.env`
for local dev and duplicated into the `env` block of **every** `eas.json` build
profile (`preview`, `production`).

**Why**: `EXPO_PUBLIC_*` vars are **inlined into the JS bundle at build time**.
Expo Go reads them from `.env` at dev time, but EAS Build only reads them from
the profile's `env` block (or EAS-managed env vars). Forgetting them in the
`production` profile is what caused the original "Supabase not configured"
modal — the v1.0.1 Play Store APK shipped without the keys baked in.

**How to apply**: When adding a new public-safe variable (anything the client
must know but isn't a secret), add it to `.env`, `.env.example`, **and** every
profile in `eas.json`. Secrets (server-side) belong in the Cloudflare Worker,
not in `EXPO_PUBLIC_*`.

**How to break it**: Putting a sensitive value (private key, service-role
token) into `EXPO_PUBLIC_*`. It will be readable by anyone who decompiles the
APK.

---

## 2. Streaming HTTP: `expo/fetch`, not global `fetch`

**Decision**: Server-Sent Events from the Worker are consumed with `fetch`
imported from `expo/fetch`, not the global `fetch`.

**Why**: React Native's Hermes runtime in **production builds** does not expose
`response.body` as a `ReadableStream` — it buffers the whole response. So
`res.body.getReader()` throws `Cannot read property 'getReader' of undefined`.
Expo Go masks this with extra polyfills; the prod APK doesn't. `expo/fetch`
is a WHATWG-spec fetch shipped with Expo SDK 52+ that supports
`res.body.getReader()` in production RN.

**How to apply**: Any time you read a streaming/SSE response in client code,
use `import { fetch as expoFetch } from "expo/fetch"`. Non-streaming requests
can stay on the global `fetch`.

**Where it lives**: `lib/openrouter.ts:streamChatFromWorker`.

---

## 3. Supabase Storage uploads: `expo-file-system` + `Uint8Array`, not `Blob`

**Decision**: On native (iOS/Android), upload binaries by reading them as
base64 via `expo-file-system/legacy`, decoding to `Uint8Array`, and passing
that directly to `supabase.storage.from(...).upload(path, bytes, {...})`.
Web still uses `fetch(uri).then(r => r.blob())`.

**Why**: Hermes' `Blob` constructor is broken for binary data —
`new Blob([arrayBuffer], ...)` produces a payload that uploads "successfully"
(you get a 200 and a URL) but stores a **0-byte file**. Symptom: the model
fetches the image URL and sees nothing. The base64 → `Uint8Array` path is
the documented, known-working route for RN + Supabase Storage.

**How to apply**: Any client-side binary upload (avatars, files, audio)
should follow the same shape: `readAsStringAsync({ encoding: Base64 })` →
manual `base64ToUint8Array` → `supabase.storage.upload(path, bytes, {contentType})`.

**Where it lives**: `lib/uploads.ts:uploadToStorage` and helper
`base64ToUint8Array`.

---

## 4. Attachments are persisted **per-message**, not per-session

**Decision**: `messages.attachments jsonb` column stores each message's
attachment array. Client code (`useChat` + `openrouter.buildMessageContent`)
reads `message.attachments`, never a session-scoped `attachments` prop.

**Why**: The original code attached the current send's `attachments` to
**every** user message at API-build time, which had two failure modes:
(a) old turns lost their images the moment the user sent a follow-up without
a new attachment ("upload paper → ask about it" broke by turn 2), and
(b) new attachments leaked back into old turns. Persisting per-message means
"Turn 1's image belongs to Turn 1 forever," including across app restarts.

**How to apply**: When you add a new message-bound resource (file, audio,
tool-call payload), put it on the `Message` type and store it on the row.
Never reach into session-scoped React state at API-payload-build time.

**Where it lives**: migration `0008_message_attachments.sql`,
`lib/supabase.ts:{insertUserMessage, fetchMessagesForConversation}`,
`hooks/useChat.ts` (request builder), `lib/openrouter.ts:buildMessageContent`.

**Caveat**: `requestMessages` still uses `slice(-8)` — only the most recent 8
turns reach the model. If users frequently reference a turn-1 attachment 10
turns later, this window is too narrow.

---

## 5. Model capability guard for multimodal content

**Decision**: `buildMessageContent` checks `model.modality.includes("image")`.
If a user turn carries images but the active model can't see, the images
collapse into a textual `[Note: ...]` marker; the model is told to ask the
user to switch.

**Why**: Sending an `image_url` block to a text-only model either errors out
at the provider or gets silently dropped. Either way the user gets a worse
answer than if the model knew images existed but couldn't open them.

**How to apply**: When adding new content modalities (audio, video, tool
results), gate them the same way against `model.modality`.

**Where it lives**: `lib/openrouter.ts:modelSupportsImages` and
`buildMessageContent`.

---

## 6. Conversation preview is cleaned **server-side**

**Decision**: The Cloudflare Worker strips the leading `<!--type:foo-->`
marker from `fullContent` before passing it as `preview` to
`updateConversationAfterAssistant`.

**Why**: The system prompt asks the model to prefix its responses with one of
`<!--type:answer-->`, `<!--type:analysis-->`, etc. so the client can render a
badge. The client strips it for display, but the **preview / title** saved to
Supabase used the raw output, so the drawer showed
`<!--type:answer-->Hey th...`. Cleaning at write-time keeps the DB free of UI
artifacts.

**How to apply**: Any output transformation that the model is instructed to
emit should be normalized at the point of persistence, not just at the point
of display.

**Where it lives**: `worker/src/chat.ts` near the `updateConversationAfterAssistant`
call.

---

## 7. Edit & regenerate: truncate-then-restream, not patch-in-place

**Decision**: `editUserMessage(id, content)` and `regenerateLastAssistant()`
both **delete trailing rows in Supabase**, mutate local React state to match,
then re-run the streaming pipeline via a shared `runStreamForHistory` helper.

**Why**: The model has no notion of "edit the 3rd turn." The honest semantics
of "edit a past message" is "rewind the conversation to that point and resume."
Persisting that rewind to Supabase means the user's next app open won't show
ghost turns the model never produced.

**How to apply**: Any chat mutation that changes history (delete a turn, fork,
branch) should go through the same `delete-then-restream` shape rather than
trying to splice the assistant's reply in place.

**Where it lives**: `hooks/useChat.ts:{editUserMessage, regenerateLastAssistant, runStreamForHistory}`,
plus DB helpers `lib/supabase.ts:{deleteMessagesAfter, updateMessageContent}`.

---

## 8. Safe-area insets are owned by individual screens / overlays

**Decision**: Top-level overlays (e.g. the drawer) call `useSafeAreaInsets()`
and apply `insets.top` / `insets.bottom` as padding directly. We don't wrap
in `<SafeAreaView>` at the app root.

**Why**: Wrapping at the root forces every full-screen overlay to manually
opt out, and `SafeAreaView` is finicky on Android (status bar vs nav bar vs
edge-to-edge). Applying insets at the component that actually owns the
chrome is more predictable, and matches `app/index.tsx`'s existing pattern.

**How to apply**: For any new full-screen view that draws under the status bar
(modals, overlays, bottom sheets), import `useSafeAreaInsets` and add
`paddingTop: insets.top` to whatever wrapper holds your header.

**Where it lives**: `components/ui/Drawer.tsx`, `app/index.tsx`.

---

## 9. `MarkdownRenderer` is content-sized, not flex-stretched

**Decision**: The outer `<View>` in `MarkdownRenderer` has no `flex: 1`. It
sizes to its children.

**Why**: When the renderer is dropped inside a vertically-laid-out parent
(like a user message bubble), `flex: 1` causes it to grow to fill the entire
available height — producing the "1-character user message takes the whole
screen" bug. Markdown content should always size to its content; only the
**scroll container** above it owns vertical space.

**How to apply**: Components that render variable-length text content should
never `flex: 1` their outermost wrapper. Reserve `flex: 1` for layout
containers, not content containers.

**Where it lives**: `components/chat/MarkdownRenderer.tsx`.

---

## 10. EAS-managed keystore is the single source of truth for Android signing

**Decision**: All release Android builds use the EAS-managed keystore. Local
`./gradlew bundleRelease` runs are not used to produce Play Store uploads.

**Why**: Play Store rejects any upload signed with a different key than the
original v1.0.1. Local Gradle defaults to a debug keystore. EAS Build
automatically injects the registered production keystore into `build.gradle`.
Running `eas build --profile production` (whether `--local` or cloud)
guarantees signature consistency.

**How to apply**: Always build via EAS. If a local `--local` build is needed,
let EAS inject credentials (don't manually edit `signing.gradle` or
`local.properties`). Back up the keystore (`eas credentials`) somewhere
offline — losing it without Play App Signing enrolled means you can never
update the app again.

**Where it lives**: `eas.json` (`production` profile), Expo's credential
storage (not in this repo).

---

## 11. OTA updates via `expo-updates`, branch = production

**Decision**: `expo-updates` is installed and configured with a single
top-level `expo.runtimeVersion` (literal string, currently `"1.0.1"`),
`updates.url` pointing to the EAS update CDN, and the `production` build
profile maps to the `production` update channel. The runtimeVersion is kept
in lock-step with `expo.version`.

**Why literal, not `policy: "appVersion"`**: This is a **bare workflow** project
(the `android/` and `ios/` folders are committed). EAS rejects runtime-version
policies in bare workflow — they only work in managed workflow. So every
binary bump must also bump `expo.runtimeVersion` manually.

**Why**: Most bugs we ship are JS-only (logic, UI, copy, prompt tweaks).
Re-uploading an AAB to Play Store and waiting for review (24–48h) for a
1-line fix is wasted time. OTA lets us ship a corrected JS bundle in seconds
to all installed apps that share the same `runtimeVersion`.

**How to apply**: See the next section ("Shipping an OTA update").

**How to break it**: Changing native code or `app.json` native config without
bumping `runtimeVersion`. The OTA will technically apply but the JS will
reference native modules that don't exist in the binary → crash on launch.

**Where it lives**: `app.json` (`expo.updates`, `expo.runtimeVersion`),
`eas.json` (`channel` field on each profile), `AndroidManifest.xml`
(`EXUpdatesURL`, runtime version meta-data).

---

# Shipping an OTA update

## When OTA is safe

OTA can ship **any JS-only change**:

- React component changes (UI, layout, styling)
- Hooks, state logic, business rules
- Calls to your Worker / Supabase / OpenRouter
- System prompts, regex transforms, helper functions
- Asset additions that are bundled into JS (small SVGs as components)

## When OTA is **NOT** safe — you must rebuild & ship a new AAB

| Trigger | Why |
|---|---|
| `npx expo install <native-module>` | Adds Java/Kotlin/Obj-C code |
| Bumping a library that includes a native module (e.g. `expo-image-picker` major) | Native binary changes |
| Editing `app.json` plugins, `android.*`, `ios.*`, `permissions` | Native config changes |
| Editing `android/` or `ios/` directly | Same |
| Bumping `expo` SDK major | Native runtime change |

When in doubt: if `npx expo prebuild --clean` would produce different native
files, you need a new binary. Bump `runtimeVersion` at the same time.

## The OTA workflow (assuming JS-only changes)

```bash
# 1. Make sure local code is what you want to ship.
git status
git diff

# 2. (Optional but smart) test the bundle locally first.
npx expo start --no-dev --minify
# Run the app from your installed build. If it works, the OTA will too.

# 3. Push the update.
eas update --branch production --message "fix: regenerate + edit user msg"

# Output shows:
#   Branch:        production
#   Runtime version: 1.0.0
#   Android update ID: ...
#   Update group ID: ...
```

Installed apps fetch the update on **next cold start** (default
`expo.updates.checkAutomatically: ON_LOAD`).

### Watching it roll out

```bash
eas update:list --branch production
```

Or in the Expo dashboard → Updates → production.

### Rollback

If the OTA shipped a bug, **republish the previous good update**:

```bash
# find the previous update ID
eas update:list --branch production

# point production at it
eas update:republish --group <previous-group-id> --branch production
```

This is faster than fixing forward when something is broken in the wild.

## Pre-flight checklist

Before `eas update --branch production`:

1. Did I bump `expo.runtimeVersion`? → If yes, **stop**. OTA won't apply to
   the current binary. Build a new AAB instead. (And remember: bare workflow
   means you bump it manually — there's no `policy: "appVersion"`.)
2. Did I add or upgrade a package with native code? → Same — new AAB.
3. Does the app run locally with `npx expo start --no-dev --minify`? →
   If no, debug locally first; the OTA will inherit the bug.
4. Are env vars I depend on present in `eas.json`'s `production.env` block?
   → `EXPO_PUBLIC_*` get inlined at update bundle time, same as build time.
5. Worker changes? → Deploy those separately
   (`cd worker && npx wrangler deploy`). The OTA doesn't ship server code.

## Channel cheat sheet

| Channel | Used by | Publish here when |
|---|---|---|
| `development` | dev-client builds | Iterating on local dev clients |
| `preview` | internal-distribution builds | TestFlight / internal Play track sanity check |
| `production` | Play Store / public builds | Real users |

`eas update --branch <name>` writes to that branch. The build profile in
`eas.json` ties the **channel** to the **branch** (currently 1:1 by name).

---

# Summary: how to make any change reach a user

| Type of change | Action |
|---|---|
| Pure JS — feature, fix, copy, regex, prompt | `eas update --branch production` (seconds) |
| New package without native code | `npx expo install`, test, then OTA |
| New package with native code | Bump `runtimeVersion`, rebuild AAB, submit to Play Store |
| Worker / Supabase function | `cd worker && npx wrangler deploy` (independent of app) |
| Supabase schema | Apply migration via `supabase db push` or paste SQL into the SQL editor |
| `app.json` plugin / native config | Rebuild AAB |
| Native folder (`android/`, `ios/`) | Rebuild AAB |
