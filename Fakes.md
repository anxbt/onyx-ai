# Fake/Data Wiring Inventory

## Replaced

- Chat seed messages were removed from `hooks/useChat.ts`; messages now load from Supabase.
- Chat send now inserts a real user message, calls the authenticated worker `/chat` route, and stores the assistant message through the worker.
- History seed conversations were removed from `hooks/useConversations.ts`; history now reads `conversations` for the signed-in user.
- Credits seed transactions and hardcoded balance were removed from `hooks/useCredits.ts`; recent activity now reads `credit_transactions` and profile balance.
- Settings no longer shows hardcoded balance/model values.
- Zero-balance users now default to the free Qwen model.

## Still Requires Secrets/Deployment

- Real inference requires `EXPO_PUBLIC_WORKER_URL` in the app and `OPENROUTER_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SECRET_KEY` in the worker.
- Razorpay checkout requires worker `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
- Native mobile Razorpay checkout is not added yet; this pass wires web checkout through Razorpay Checkout.js.
- `legacy/express-prototype` is an archived static prototype and still contains static sample data; it is not used by the Expo app runtime.

## Intentional Non-Fakes

- Top-up package amounts are product configuration, not demo data.
- Model pricing/catalog entries are local product configuration until replaced by a catalog sync/admin flow.
