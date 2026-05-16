# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# workflow
- Implement features with checkpoint validation to prevent uncontrolled AI execution. Confidence: 0.80
- When sessions are interrupted, resume work immediately without asking questions or recapping. Confidence: 0.90
- Create .env files with required API keys and endpoint placeholders, telling the user what they need to provide. Confidence: 0.70
- Proactively monitor terminal output for runtime errors during implementation. Confidence: 0.65
- Plan and analyze architecture/design decisions before writing implementation code. Confidence: 0.70

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
- For generated artifacts (PDFs, slides, exports): use solid colors only (no gradients), limit to 3 colors max (bg, text, accent), use asymmetric spacing between sections, no decorative shapes or geometric ornaments, left-aligned only (no centered heroes or 3-column grids), and mix type weights across headings. Confidence: 0.85
- Prefer manual trigger buttons for Firecrawl/document ingestion over automatic crawling — let users explicitly choose when to deep-extract. Confidence: 0.65
- When adapting external UI designs: first audit feature gaps (what they have that we don't, what we have that they don't), remove UI elements for features the backend doesn't support, then implement — never blind copy-paste. Confidence: 0.70
- Use drawer-based navigation (side panel) instead of bottom tab bars for main app navigation — place history, settings, and search within the drawer. Confidence: 0.70

# environment
- For demo/prototyping, keep all environment variables in .env file rather than splitting across platform secrets. Confidence: 0.65

# workflow
- Do not manually redeploy — let the user handle deployments themselves. Confidence: 0.75
- Create handoff.md in the project root folder (not .commandcode/) so it's visible in the user's file explorer. Confidence: 0.80
- Clear Zustand persisted storage with `useStore.persist.clearStorage()` when stale cached store values (like model IDs) cause mismatches after config changes. Confidence: 0.65
- Clear Expo Metro bundler cache with `npx expo start --clear` when runtime behavior doesn't match source code after file changes. Confidence: 0.65
