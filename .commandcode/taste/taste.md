# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# workflow
See [workflow/taste.md](workflow/taste.md)
# communication
- Challenge the user's judgment and avoid sycophancy — provide critical, honest feedback rather than default agreement. Confidence: 0.95

# api-integration
- Use official SDKs instead of raw API calls when available. Confidence: 0.75
- Use Tavily and Firecrawl together as the search API combination (over Brave Search API). Confidence: 0.85

# architecture
- Store production secrets in Cloudflare Workers environment variables instead of .env files. Confidence: 0.75
- For Cloudflare Workers local dev, use `.dev.vars` (with leading dot) — not `dev.vars` — as the environment variable file name. Confidence: 0.70
- Use Hono framework for Cloudflare Workers applications. Confidence: 0.65
- Use Express.js instead of Cloudflare Workers for backend when possible. Confidence: 0.80
- Use Supabase Auth with Google OAuth as the only production login path in v1. Confidence: 0.75

# payments
- Use Razorpay for payment processing in India-focused applications. Confidence: 0.70

# ai-models
- Use Google Gemini 2.5 Flash Lite as the primary model for cost-effective inference. Confidence: 0.70
- Use google/gemini-2.5-flash-lite for conversation summarization (not the cheapest free model). Confidence: 0.70
- Implement specific models for specific roles via OpenRouter: GLM for structured presentation, Qwen for conversational tutoring, DeepSeek for deep analytical reasoning, a creativity-focused model for creative ideation, Kimi, an OCR model for document parsing, and InternLM. Confidence: 0.75

# design
See [design/taste.md](design/taste.md)
# environment
- For demo/prototyping, keep all environment variables in .env file rather than splitting across platform secrets. Confidence: 0.65

# workflow
- Do not manually redeploy — let the user handle deployments themselves. Confidence: 0.75
- Create handoff.md in the project root folder (not .commandcode/) so it's visible in the user's file explorer. Confidence: 0.80
- Clear Zustand persisted storage with `useStore.persist.clearStorage()` when stale cached store values (like model IDs) cause mismatches after config changes. Confidence: 0.65
- Clear Expo Metro bundler cache with `npx expo start --clear` when runtime behavior doesn't match source code after file changes. Confidence: 0.65
