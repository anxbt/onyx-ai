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
- Use Hono framework for Cloudflare Workers applications. Confidence: 0.65
- Use Express.js instead of Cloudflare Workers for backend when possible. Confidence: 0.80
- Use Supabase Auth with Google OAuth as the only production login path in v1. Confidence: 0.75

# payments
- Use Razorpay for payment processing in India-focused applications. Confidence: 0.70

# ai-models
- Use Google Gemini 2.5 Flash Lite as the primary model for cost-effective inference. Confidence: 0.70
- Use google/gemini-2.5-flash-lite for conversation summarization (not the cheapest free model). Confidence: 0.70

# environment
- For demo/prototyping, keep all environment variables in .env file rather than splitting across platform secrets. Confidence: 0.65
