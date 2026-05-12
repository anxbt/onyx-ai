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

