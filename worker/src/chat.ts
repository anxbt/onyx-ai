import type { Context } from "hono";
import { OpenRouter } from "@openrouter/sdk";
import type { HonoEnv } from "./index";
import { CURATED_MODELS, FRONTIER_BASELINE, GLOBAL_MARKUP, USD_TO_INR } from "./config";
import {
  callRpc,
  getUserProfile,
  insertAssistantMessage,
  updateConversationAfterAssistant,
  fetchConversationSummaries,
  fetchMessagesRange,
  fetchMessageCount,
  insertConversationSummary,
  matchMemoryFacts,
  matchMessages,
} from "./supabase";

const SUMMARIZE_CHUNK_SIZE = 10;
const CHARS_PER_TOKEN = 4;

const EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2";

async function getEmbedding(text: string, apiKey: string): Promise<number[]> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://onyxai.app",
        "X-Title": "OnyxAI",
      },
      body: JSON.stringify({ model: EMBED_MODEL, input: text }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: Array<{ embedding: number[] }> };
    return data.data?.[0]?.embedding ?? [];
  } catch {
    return [];
  }
}

function getLastUserContent(messages: Array<Record<string, unknown>>): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if ((msg as { role?: string }).role !== "user") continue;
    const content = (msg as { content?: unknown }).content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      const textPart = content.find((p: { type?: string; text?: string }) => p.type === "text");
      if (textPart?.text) return textPart.text;
    }
  }
  return "";
}

type ResearchTraceEvent = {
  id: string;
  stage: "plan" | "search" | "read" | "synthesize";
  label: string;
  detail?: string;
  provider?: string;
  query?: string;
  url?: string;
  title?: string;
};

type ResearchMode = "auto" | "web" | "deep" | "social" | "recent";

type SkillId = "explain" | "learn" | "research" | "brainstorm";

const VALID_SKILLS = new Set<SkillId>(["explain", "learn", "research", "brainstorm"]);

function normalizeSkillId(value: unknown): SkillId | null {
  return typeof value === "string" && VALID_SKILLS.has(value as SkillId) ? (value as SkillId) : null;
}

function getSkillInstructions(skillId: SkillId | null): string | null {
  if (skillId === "explain") {
    return [
      "[Active skill: Explain]",
      "Explain only the material the user provided or referenced in the current conversation.",
      "Do not browse, invent extra facts, or introduce outside claims unless the user explicitly asks for them.",
      "Prefer a clear restatement, the core idea, important terms, why each part matters, and any ambiguity or missing context.",
      "If the source material is insufficient, say what is missing instead of filling gaps.",
    ].join("\n");
  }
  if (skillId === "learn") {
    return [
      "[Active skill: Learn]",
      "Teach the concept step by step. Start with the user's current goal, then build a small scaffold before details.",
      "Use examples, analogies, and short checks for understanding when helpful.",
      "If the user asks for homework, interview, or exam help, coach the reasoning rather than simply giving a final answer.",
      "Keep the lesson focused; do not turn it into a broad article unless requested.",
    ].join("\n");
  }
  if (skillId === "research") {
    return [
      "[Active skill: Research]",
      "Treat the answer as source-grounded research. Use the supplied search context and cite source-backed claims inline as [1], [2], etc.",
      "Prefer primary sources, first-hand experience, and recent sources when the question depends on current information.",
      "Call out weak evidence, conflicting sources, and missing coverage plainly.",
      "Do not fabricate sources, citations, prices, dates, social consensus, or current events.",
    ].join("\n");
  }
  if (skillId === "brainstorm") {
    return [
      "[Active skill: Brainstorm]",
      "Help generate and refine ideas. Use structured ideation: reframe the problem, explore contrasting directions, combine adjacent ideas, then converge on promising options.",
      "Separate raw possibilities from ranked recommendations.",
      "When the user asks for research ideas, include novelty, feasibility, risks, and the smallest next experiment.",
      "Avoid pretending brainstormed ideas are proven facts.",
    ].join("\n");
  }
  return null;
}

type ResearchPhase = "discover" | "experience" | "depth";

type ResearchPlan = {
  id: string;
  phase: ResearchPhase;
  provider: string;
  axis: string;
  query: string;
  includeDomains?: string[];
  maxResults: number;
};

type TavilyResult = {
  title: string;
  url: string;
  content: string;
  score?: number;
  favicon?: string;
};

type ResearchResult = TavilyResult & {
  phase: ResearchPhase;
  provider: string;
  axis: string;
  query: string;
};

const SOCIAL_INTENT_RE =
  /\b(last\s*30\s*days?|past\s*30\s*days?|recent|current|reddit|x\.com|twitter|hacker\s*news|\bhn\b|github|social|community|what\s+(people|developers|users)\s+(say|think)|sentiment|trending|trend)\b/i;

const AUTO_SEARCH_INTENT_RE =
  /\b(web\s+search|search\s+(the\s+)?web|look\s+up|browse|internet|online|latest|current|recent|today|this\s+week|last\s*30\s*days?|reddit|x\.com|twitter|hacker\s*news|\bhn\b|github|youtube|cite|citations?|sources?|pricing|changelog|release\s+notes|reviews?|hands[-\s]?on|complaints?|what\s+(people|developers|users)\s+(say|think)|sentiment|trending|trend)\b/i;

const DEEP_RESEARCH_RE =
  /\b(deep\s+research|research\s+mode|investigate|comprehensive|landscape|due\s+diligence|market|alternatives?|reviews?|experience|hands[-\s]?on|complaints?|trade[-\s]?offs?)\b/i;

function hasSocialResearchIntent(query: string): boolean {
  return SOCIAL_INTENT_RE.test(query);
}

function hasAutoSearchIntent(query: string): boolean {
  return AUTO_SEARCH_INTENT_RE.test(query);
}

function isForcedResearchMode(mode: ResearchMode) {
  return mode !== "auto";
}

function hasDeepResearchIntent(query: string, mode: ResearchMode = "auto"): boolean {
  if (mode === "web") return false;
  if (mode === "deep" || mode === "social" || mode === "recent") return true;
  return hasAutoSearchIntent(query) && (hasSocialResearchIntent(query) || DEEP_RESEARCH_RE.test(query));
}

function normalizeResearchTopic(query: string): string {
  return query
    .replace(/^\s*(deep\s+research|research\s+mode|last\s*30\s*days?\s+social\s+research)\s*:?\s*/i, "")
    .replace(/\bwith\s+citations?\b/gi, "")
    .replace(/\bcite\s+(every\s+)?(claim|source)s?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 320) || query.slice(0, 320);
}

function compactSearchQuery(query: string): string {
  return query.replace(/\s+/g, " ").trim().slice(0, 390);
}

function providerFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.endsWith("reddit.com")) return "Reddit";
    if (host.endsWith("x.com") || host.endsWith("twitter.com")) return "X";
    if (host.endsWith("news.ycombinator.com")) return "Hacker News";
    if (host.endsWith("github.com")) return "GitHub";
    return host;
  } catch {
    return "Web";
  }
}

function faviconFromUrl(url: string, provided?: string): string | undefined {
  if (provided) return provided;
  try {
    const parsed = new URL(url);
    return `${parsed.origin}/favicon.ico`;
  } catch {
    return undefined;
  }
}

function hostFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function buildDiscoveryPlans(query: string, mode: ResearchMode): ResearchPlan[] {
  const topic = normalizeResearchTopic(query);
  if (!hasDeepResearchIntent(query, mode)) {
    return [
      {
        id: "discover-web",
        phase: "discover",
        provider: "Web",
        axis: "Fresh overview",
        query: compactSearchQuery(topic),
        maxResults: 4,
      },
    ];
  }

  return [
    {
      id: "discover-overview",
      phase: "discover",
      provider: "Web",
      axis: "Landscape and core claims",
      query: compactSearchQuery(`${topic} overview comparison pricing limitations`),
      maxResults: 3,
    },
    {
      id: "discover-official",
      phase: "discover",
      provider: "Web",
      axis: "Official docs and primary facts",
      query: compactSearchQuery(`${topic} official docs pricing changelog release notes`),
      maxResults: 3,
    },
  ];
}

function buildExperiencePlans(query: string, mode: ResearchMode): ResearchPlan[] {
  if (!hasDeepResearchIntent(query, mode)) return [];
  const topic = normalizeResearchTopic(query);
  return [
    {
      id: "experience-reddit",
      phase: "experience",
      provider: "Reddit",
      axis: "User experience and complaints",
      query: compactSearchQuery(`${topic} hands on experience complaints workflow honest review`),
      includeDomains: ["reddit.com"],
      maxResults: 3,
    },
    {
      id: "experience-x",
      phase: "experience",
      provider: "X",
      axis: "Short-form current reactions",
      query: compactSearchQuery(`${topic} experience workflow complaints launch reactions`),
      includeDomains: ["x.com", "twitter.com"],
      maxResults: 2,
    },
    {
      id: "experience-hn",
      phase: "experience",
      provider: "Hacker News",
      axis: "Technical community discussion",
      query: compactSearchQuery(`${topic} developer discussion comparison limitations`),
      includeDomains: ["news.ycombinator.com"],
      maxResults: 2,
    },
    {
      id: "experience-github",
      phase: "experience",
      provider: "GitHub",
      axis: "Issues, repos, and implementation signal",
      query: compactSearchQuery(`${topic} github issues repo examples implementation`),
      includeDomains: ["github.com"],
      maxResults: 2,
    },
    {
      id: "experience-youtube",
      phase: "experience",
      provider: "YouTube",
      axis: "Long-form hands-on reviews",
      query: compactSearchQuery(`${topic} hands on review comparison demo`),
      includeDomains: ["youtube.com"],
      maxResults: 2,
    },
  ];
}

function buildDiscoveredDomainPlans(query: string, results: ResearchResult[], mode: ResearchMode): ResearchPlan[] {
  if (!hasDeepResearchIntent(query, mode)) return [];
  const topic = normalizeResearchTopic(query);
  const ignoredHosts = new Set(["reddit.com", "x.com", "twitter.com", "news.ycombinator.com", "github.com", "youtube.com"]);
  const counts = new Map<string, number>();

  for (const result of results) {
    const host = hostFromUrl(result.url);
    if (!host || ignoredHosts.has(host)) continue;
    counts.set(host, (counts.get(host) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([host], index) => ({
      id: `depth-${index}-${host.replace(/\W+/g, "-")}`,
      phase: "depth" as const,
      provider: host,
      axis: "Follow-up on discovered primary source",
      query: compactSearchQuery(`${topic} pricing limitations experience source`),
      includeDomains: [host],
      maxResults: 2,
    }));
}

async function runTavilySearch(
  env: HonoEnv["Bindings"],
  plan: ResearchPlan,
  useMonthFilter: boolean,
): Promise<ResearchResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: env.TAVILY_API_KEY,
      query: plan.query,
      search_depth: "advanced",
      include_answer: false,
      include_favicon: true,
      max_results: plan.maxResults,
      time_range: useMonthFilter ? "month" : undefined,
      include_domains: plan.includeDomains,
    }),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: TavilyResult[] };
  return (data.results ?? []).map((result) => ({
    ...result,
    phase: plan.phase,
    provider: plan.provider,
    axis: plan.axis,
    query: plan.query,
  }));
}

async function runResearchSearch(
  query: string,
  env: HonoEnv["Bindings"],
  mode: ResearchMode = "auto",
  onTrace?: (event: ResearchTraceEvent) => void | Promise<void>,
) {
  const socialMode = mode === "social" || mode === "recent" || hasSocialResearchIntent(query);
  const deepMode = hasDeepResearchIntent(query, mode);
  const discoveryPlans = buildDiscoveryPlans(query, mode);
  const experiencePlans = buildExperiencePlans(query, mode);
  const trace: ResearchTraceEvent[] = [];
  const emitTrace = async (event: ResearchTraceEvent) => {
    trace.push(event);
    await onTrace?.(event);
  };

  await emitTrace({
    id: "research-plan",
    stage: "plan",
    label: deepMode ? "Breaking research into subqueries" : "Planning web research",
    detail: deepMode
      ? `${mode === "auto" ? "Auto" : mode} mode: discovery first, then experience data, then depth checks against discovered sources. Topic: ${normalizeResearchTopic(query)}`
      : "Checking fresh web results before answering.",
  });

  for (const plan of discoveryPlans) {
    await emitTrace({
      id: `search-${plan.id}`,
      stage: "search",
      label: `${plan.axis}`,
      detail: `Discovery via ${plan.provider}`,
      provider: plan.provider,
      query: plan.query,
    });
  }

  const discoverySettled = await Promise.allSettled(discoveryPlans.map((plan) => runTavilySearch(env, plan, socialMode)));
  const discoveryResults = collectResearchResults(discoverySettled);
  const depthPlans = [...experiencePlans, ...buildDiscoveredDomainPlans(query, discoveryResults, mode)].slice(0, 8);
  for (const plan of depthPlans) {
    await emitTrace({
      id: `search-${plan.id}`,
      stage: "search",
      label: `${plan.axis}`,
      detail: `${plan.phase === "experience" ? "Experience data" : "Depth check"} via ${plan.provider}`,
      provider: plan.provider,
      query: plan.query,
    });
  }

  const depthSettled = await Promise.allSettled(depthPlans.map((plan) => runTavilySearch(env, plan, socialMode || deepMode)));
  const allResults = [...discoveryResults, ...collectResearchResults(depthSettled)];
  const seenUrls = new Set<string>();
  const results: ResearchResult[] = [];

  for (const result of allResults) {
    if (!result.url || seenUrls.has(result.url)) continue;
    seenUrls.add(result.url);
    results.push(result);
  }

  results.sort((a, b) => researchRank(b) - researchRank(a));
  const selected = results.slice(0, deepMode ? 14 : 4);
  const sources = selected.map((result) => {
    const provider = result.provider || providerFromUrl(result.url);
    return {
      title: provider === "Web" ? result.title : `[${provider}] ${result.title}`,
      url: result.url,
      snippet: result.content.slice(0, 220),
      faviconUrl: faviconFromUrl(result.url, result.favicon),
    };
  });

  if (sources.length) {
    await emitTrace({
      id: "research-read",
      stage: "read",
      label: `Reading ${sources.length} candidate sources`,
      detail: summarizeProviderCoverage(selected),
    });
    await emitTrace({
      id: "research-synthesize",
      stage: "synthesize",
      label: deepMode ? "Clustering claims and conflicts" : "Cross-checking and preparing cited answer",
      detail: deepMode
        ? "Group claims by theme, separate first-hand experience from official facts, and call out weak/conflicting evidence."
        : "The answer should cite only the sources found in this run.",
    });
  }

  const context =
    sources.length === 0
      ? ""
      : (deepMode
          ? "[Deep research results: discovery, experience, depth]\n"
          : "[Web search results]\n") +
        selected
          .map(
            (result, index) =>
              `[${index + 1}] ${result.title}\nSource: ${result.url}\nPlatform: ${providerFromUrl(result.url)}\nPhase: ${result.phase}\nAxis: ${result.axis}\nSubquery: ${result.query}\nContent: ${result.content.slice(0, 700)}`,
          )
          .join("\n\n") +
        "\n\nUse these sources to answer. Cite them inline as [1], [2], etc. For deep research, structure the answer around: key takeaways, first-hand experience signals, official/primary facts, conflicts or uncertainty, and source-backed next steps. If a table has a Source column, put citation markers like [1], [2] in that cell. If the sources are weak, stale, or missing a platform the user asked for, say that plainly. Do not fabricate social consensus, numbers, prices, dates, or current events.";

  return { context, sources, trace };
}

function collectResearchResults(items: PromiseSettledResult<ResearchResult[]>[]): ResearchResult[] {
  return items.flatMap((item) => (item.status === "fulfilled" ? item.value : []));
}

function researchRank(result: ResearchResult): number {
  const phaseBoost = result.phase === "experience" ? 0.12 : result.phase === "depth" ? 0.08 : 0;
  const providerBoost = ["Reddit", "Hacker News", "GitHub", "YouTube"].includes(result.provider) ? 0.08 : 0;
  return (result.score ?? 0) + phaseBoost + providerBoost;
}

function summarizeProviderCoverage(results: ResearchResult[]): string {
  const counts = new Map<string, number>();
  for (const result of results) {
    counts.set(result.provider, (counts.get(result.provider) ?? 0) + 1);
  }
  const summary = [...counts.entries()].map(([provider, count]) => `${provider}: ${count}`).join(", ");
  return summary ? `Deduplicated and ranked by relevance plus experience-source signal. Coverage: ${summary}.` : "Deduplicated and ranked candidate sources.";
}

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN));
}

function modelConfig(modelId: string) {
  return CURATED_MODELS.find((model) => model.id === modelId) ?? CURATED_MODELS[0];
}

/* ------------------------------------------------------------------ */
/*  Context assembly                                                  */
/* ------------------------------------------------------------------ */

function buildSystemContext(
  summaries: Array<{
    message_start_idx: number;
    message_end_idx: number;
    summary_text: string;
    key_facts: string[];
  }>,
) {
  const parts: string[] = [];
  if (summaries.length) {
    parts.push("[Conversation history summaries]");
    for (const s of summaries) {
      parts.push(`Messages ${s.message_start_idx}-${s.message_end_idx}: ${s.summary_text}`);
      const facts = Array.isArray(s.key_facts) ? s.key_facts : [];
      if (facts.length) parts.push(`Key facts: ${facts.join("; ")}`);
    }
  }
  return parts.join("\n\n");
}

function userWantsPdf(text: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  return /\b(make|create|generate|write|export|give\s+me|build|produce|draft|prepare)\s+(a|an|the)?\s*(pdf|document|report|memo|letter|whitepaper|essay|proposal|one[- ]pager)\b/.test(t)
      || /\b(as\s+a|in\s+a|formatted\s+as\s+a)\s+(pdf|document|report|memo|letter|proposal)\b/.test(t)
      || /\b(download(?:able)?|printable|export\s+to)\s+(pdf|document|report)\b/.test(t);
}

function getResponseTypeInstructions(): string {
  return `Begin EVERY response with a single hidden HTML comment tagging the response type. Use exactly one of:
<!--type:answer--> for direct Q&A and factual lookups
<!--type:analysis--> for evaluations, comparisons, breakdowns
<!--type:tutorial--> for step-by-step instructions
<!--type:creative--> for writing, brainstorming, ideation

After the comment, write the response normally. Do not mention the comment to the user.`;
}

function getArtifactInstructions(): string {
  return `The user explicitly asked for a PDF/document. Generate the content as semantic HTML inside a \`\`\`html code fence with a root <div data-type="pdf" data-title="Title">. Do NOT generate Markdown outside the HTML fence for the document body.

DESIGN SYSTEM — STRICT RULES:
1. ONLY use the CSS classes listed below. NEVER write inline style attributes. NEVER use <style> tags inside the HTML.
2. Colors: ONLY #111 (near-black for headings) and #2563EB (deep blue accent). NO purple, violet, magenta, or neon. NO gradients.
3. Background: White (#FFF) for the document body. NO dark backgrounds on print documents.
4. Typography: Use serif for body text (class="body") and sans-serif for headings (classes h1-h6). NO monospace fonts outside code blocks.
5. NO rounded cards, bordered boxes, or shadow containers. Use plain headings and paragraphs. For separating sections, use a horizontal rule (<hr>) or extra whitespace, NOT visual boxes.
6. NO emojis in headings or document content.
7. Layout: Left-aligned body text. NO center-aligned body text.
8. Code blocks: Only when genuinely needed. Use <pre><code> with class="code-block".

PERMITTED CLASSES — USE THEM PURPOSEFULLY:
- <div class="doc-header"> — document title block (contains h1 + subtitle + meta). Always present at top.
- <span class="meta"> — date, author, version inside doc-header. Example: <span class="meta">May 2026 · Closed AI</span>
- <h1> through <h6> — headings (NEVER center-aligned). Use H1 once for title, H2 for sections, H3 for subsections.
- <p class="lead"> — ALWAYS the first paragraph after the title. Opens the doc with the thesis in 2-3 sentences. Renders larger with a slightly heavier weight. Use EXACTLY ONCE per document.
- <p class="body"> — all standard body paragraphs.
- <p class="caption"> — placed under tables or figure headings; small gray text.
- <blockquote class="pull"> — for ONE striking takeaway per major section. Max 1-2 per document total. Renders as an indented callout with accent border.
- <span class="highlight"> — for inline emphasis of a proper noun or key term on first introduction. Max 1-2 per page equivalent. Renders in accent color, bold.
- <ul class="list"> / <ol class="list"> with <li class="item"> — for parallel lists.
- <table class="data-table"> — for tabular data. First row uses <th> for headers.
- <pre class="code-block"><code> — only for actual code or commands.
- <hr> — section dividers between major sections. NOT after every heading.
- <div class="two-col"> — wraps a section that contains naturally parallel content (definitions, glossary, FAQ pairs, comparison points). NEVER force-wrap narrative prose. Only use when there is genuinely two-column-friendly content.

STRUCTURAL GUIDANCE:
- 1-2 page document: skip TOC, skip subsections, lead with .lead paragraph, 2-4 main sections.
- 3-5 page document: include H2 sections with H3 subsections where needed. Optional TOC.
- 5+ pages: lead with an executive summary section before the body.
- Use <hr> between major sections (after H2 closes), NOT after every heading.

ANTI-AI WRITING RULES:
- NEVER start sections with "In today's world..." or "In conclusion..."
- NEVER use words: delve, leverage, robust, comprehensive, cutting-edge, paradigm, synergy, holistic, actionable, transformative.
- NEVER use filler phrases: "It is important to note that...", "As mentioned previously...", "It goes without saying..."
- Write directly. One idea per sentence. Vary sentence length.
- Some sections can be one paragraph; others can be several. Do NOT force uniform length.
- Use concrete examples and specific numbers instead of vague qualifiers.

For non-PDF artifacts (diagrams, charts, etc.): add data-type="artifact" to root <div>.`;
}

/* ------------------------------------------------------------------ */
/*  /chat                                                             */
/* ------------------------------------------------------------------ */

export async function handleChat(c: Context<HonoEnv>) {
  try {
    const env = c.env;
    const userId = c.get("userId");

    const body = await c.req.json().catch(() => null);
    if (!body) {
      return c.json({ error: "invalid_json" }, 400);
    }

    let messages = Array.isArray(body.messages) ? (body.messages as Array<Record<string, unknown>>) : null;
    if (!messages || messages.length === 0) {
      return c.json({ error: "missing_messages" }, 400);
    }

    if (!env.OPENROUTER_API_KEY) {
      return c.json(
        {
          error: "missing_openrouter_api_key",
          note: "Fill worker/.dev.vars from the generated template before testing real streaming.",
          userId,
        },
        501,
      );
    }
    const openRouterApiKey = env.OPENROUTER_API_KEY;

    const model = modelConfig(body.model);
    const profile = await getUserProfile(env, userId);
    if (!profile) {
      return c.json({ error: "missing_user_profile" }, 404);
    }

    if (!model.isFree && !profile.is_superuser && Number(profile.credit_balance ?? 0) <= 0) {
      return c.json(
        { error: "insufficient_credits", detail: "Top up credits to continue with this model." },
        402,
      );
    }

    // Wave 5 / Phase 7: search augmentation (Tavily). Normal web search stays
    // concise; deep/social/current intent expands into targeted subqueries.
    const enableSearch = body.enableSearch as boolean | undefined;
    const forceSearch = body.forceSearch as boolean | undefined;
    const researchMode = (["auto", "web", "deep", "social", "recent"].includes(String(body.researchMode))
      ? body.researchMode
      : "auto") as ResearchMode;
    const skillId = normalizeSkillId(body.skillId);
    const effectiveResearchMode =
      skillId === "research" && researchMode === "auto" ? "deep" : researchMode;
    const effectiveEnableSearch = skillId === "explain" ? false : enableSearch;
    const effectiveForceSearch = skillId === "research" ? true : forceSearch;
    // Per-request reasoning depth. Forwarded to OpenRouter as
    // `reasoning: { effort }`. OpenRouter normalizes across providers
    // (DeepSeek V4 Pro supports up to "xhigh"; others vary). Omitted for
    // models with always-on reasoning (Kimi K2 Thinking) — those models
    // reason regardless of this param, so the client passes undefined.
    const reasoningEffort = body.reasoningEffort as
      | "none"
      | "minimal"
      | "low"
      | "medium"
      | "high"
      | "xhigh"
      | undefined;
    const convId = body.conversationId ?? null;
    const idempotencyKey = c.req.header("Idempotency-Key") ?? body.idempotency_key ?? null;
    let finalMessages = messages;
    let tavilySources: Array<{ title: string; url: string; snippet: string; faviconUrl?: string }> = [];
    let researchTrace: ResearchTraceEvent[] = [];

    // Build the reasoning param for OpenRouter.
    //   - a real effort level → request that depth
    //   - "none" → explicitly DISABLE reasoning. Omitting the param doesn't
    //     turn reasoning off (the model reasons by default), which is why
    //     "Off" still showed a thinking trace. `enabled: false` disables it.
    //   - undefined (no preference sent) → omit, model default.
    const reasoningParam =
      !model.supportsReasoning
        ? {}
        : reasoningEffort === "none"
          ? { reasoning: { enabled: false } }
          : reasoningEffort
            ? { reasoning: { effort: reasoningEffort } }
            : {};

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    let fullContent = "";
    let fullReasoning = "";
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;

    const writeStream = (async () => {
      try {
        const emitResearchStep = async (event: ResearchTraceEvent) => {
          await writer.write(
            encoder.encode(`data: ${JSON.stringify({ type: "research_step", event })}\n\n`),
          );
        };

        if (effectiveEnableSearch === true && env.TAVILY_API_KEY) {
          const lastUserContent = getLastUserContent(messages);
          const shouldSearch =
            effectiveForceSearch === true ||
            isForcedResearchMode(effectiveResearchMode) ||
            hasAutoSearchIntent(lastUserContent);
          if (shouldSearch && lastUserContent) {
            try {
              const research = await runResearchSearch(lastUserContent, env, effectiveResearchMode, emitResearchStep);
              researchTrace = research.trace;
              tavilySources = research.sources;
              if (research.context) {
                finalMessages = [{ role: "system", content: research.context }, ...finalMessages];
              }
            } catch {
              // search is best-effort
            }
          }
        }

        // Response-type marker: always prepend so client can render a "ANSWER / ANALYSIS / TUTORIAL / CREATIVE" badge
        finalMessages = [{ role: "system", content: getResponseTypeInstructions() }, ...finalMessages];

        const skillInstructions = getSkillInstructions(skillId);
        if (skillInstructions) {
          finalMessages = [{ role: "system", content: skillInstructions }, ...finalMessages];
        }

        // PDF artifact instructions: only inject when user explicitly asks for a document
        const lastUserContent = getLastUserContent(messages);
        if (userWantsPdf(lastUserContent)) {
          finalMessages = [{ role: "system", content: getArtifactInstructions() }, ...finalMessages];
        }
        if (convId) {
          const summaries = await fetchConversationSummaries(env, convId);
          const systemCtx = buildSystemContext(summaries);
          if (systemCtx) {
            finalMessages = [{ role: "system", content: systemCtx }, ...finalMessages];
          }

          // Wave 4 / Layer 3: semantic retrieval of relevant old messages
          const queryText = getLastUserContent(messages);
          if (queryText) {
            const queryEmbedding = await getEmbedding(queryText, openRouterApiKey);
            if (queryEmbedding.length) {
              const relevant = await matchMessages(env, {
                queryEmbedding,
                matchThreshold: 0.55,
                matchCount: 3,
                conversationId: convId,
              }).catch(() => []);

              if (relevant?.length) {
                const retrievalCtx =
                  "[Relevant context from earlier in this conversation]\n" +
                  relevant.map((m) => `${m.role}: ${m.content}`).join("\n");
                finalMessages = [{ role: "system", content: retrievalCtx }, ...finalMessages];
              }

              // Layer 4.5: memory facts retrieval (Wave 4 wiring fix — Section 3e)
              // Reuse queryEmbedding from Layer 3. Higher threshold (0.72) than
              // message retrieval (0.55) so only strongly-relevant facts join the
              // context. Strictly additive — no-op when memory_facts is empty.
              const facts = await matchMemoryFacts(env, {
                queryEmbedding,
                matchThreshold: 0.72,
                matchCount: 6,
                userId,
              }).catch(() => []);

              if (facts?.length) {
                const memoryCtx =
                  "[What you remember about this user]\n" +
                  facts.map((f) => `• ${f.content} (${f.category})`).join("\n");
                finalMessages = [{ role: "system", content: memoryCtx }, ...finalMessages];
              }
            }
          }
        }

        const estimatedPrompt = estimateTokens(JSON.stringify(finalMessages));
        const maxOutput = Math.max(4096, Math.min(model.maxOutput, model.contextWindow - estimatedPrompt - 1024));

        const orResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openRouterApiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://onyxai.app",
            "X-Title": "OnyxAI",
          },
          body: JSON.stringify({
            model: model.id,
            messages: finalMessages,
            stream: true,
            max_tokens: maxOutput,
            ...reasoningParam,
          }),
        });

        if (!orResponse.ok) {
          const errText = await orResponse.text().catch(() => "");
          const errorChunk = JSON.stringify({
            error: `openrouter_error:${orResponse.status}${errText ? ` ${errText}` : ""}`,
          });
          await writer.write(encoder.encode(`data: ${errorChunk}\n\n`));
          return;
        }

        // Emit citation sources BEFORE streaming model tokens so client can render Perplexity-style cards
        if (tavilySources.length) {
          await writer.write(
            encoder.encode(`data: ${JSON.stringify({ type: "sources", sources: tavilySources })}\n\n`),
          );
        }

        const reader = orResponse.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;
            const data = trimmed.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content ?? "";
              if (delta) fullContent += delta;

              // Accumulate reasoning trace from OpenRouter's normalized
              // delta.reasoning_details (array of typed entries). We persist
              // this separately from `content` so the saved assistant
              // message's visible answer doesn't include the trace.
              const reasoningDetails =
                parsed.choices?.[0]?.delta?.reasoning_details;
              if (Array.isArray(reasoningDetails)) {
                for (const entry of reasoningDetails) {
                  if (
                    entry &&
                    typeof entry === "object" &&
                    (entry.type === "reasoning.text" ||
                      entry.type === "reasoning.summary") &&
                    typeof entry.text === "string"
                  ) {
                    fullReasoning += entry.text;
                  }
                }
              }
              // Some providers also emit a simple `delta.reasoning` string.
              const reasoningStr = parsed.choices?.[0]?.delta?.reasoning;
              if (typeof reasoningStr === "string" && reasoningStr.length > 0) {
                fullReasoning += reasoningStr;
              }

              if (parsed.usage) {
                promptTokens = parsed.usage.prompt_tokens ?? promptTokens;
                completionTokens = parsed.usage.completion_tokens ?? completionTokens;
                totalTokens = parsed.usage.total_tokens ?? totalTokens;
              }

              await writer.write(encoder.encode(`data: ${data}\n\n`));
            } catch {
              // skip malformed lines
            }
          }
        }

        if (!promptTokens) promptTokens = estimateTokens(JSON.stringify(finalMessages ?? []));
        if (!completionTokens) completionTokens = estimateTokens(fullContent);
        if (!totalTokens) totalTokens = promptTokens + completionTokens;

        const providerInputCostUsd = (promptTokens / 1_000_000) * model.inputCostPerMToken;
        const providerOutputCostUsd = (completionTokens / 1_000_000) * model.outputCostPerMToken;
        const providerTotalCostUsd = providerInputCostUsd + providerOutputCostUsd;
        const chargedTotalCostInr = model.isFree
          ? 0
          : Math.ceil(providerTotalCostUsd * GLOBAL_MARKUP * USD_TO_INR * 100) / 100;
        const frontierCostUsd =
          (promptTokens / 1_000_000) * FRONTIER_BASELINE.inputCostPerMToken +
          (completionTokens / 1_000_000) * FRONTIER_BASELINE.outputCostPerMToken;
        const savingsVsFrontierUsd = Math.max(0, frontierCostUsd - providerTotalCostUsd);

        let insertedMessageId: string | null = null;
        try {
          if (convId) {
            const inserted = await insertAssistantMessage(env, {
              conversationId: convId,
              userId,
              content: fullContent,
              model: model.id,
              sources: tavilySources,
              researchTrace,
              skillId,
              reasoning: fullReasoning || null,
            });
            insertedMessageId = inserted.id;
          }
        } catch {
          // ignore persistence errors
        }

        try {
          if (convId && insertedMessageId && idempotencyKey) {
            await callRpc(env, "record_usage_and_charge", {
              p_user_id: userId,
              p_conversation_id: convId,
              p_message_id: insertedMessageId,
              p_model: model.id,
              p_prompt_tokens: promptTokens,
              p_completion_tokens: completionTokens,
              p_total_tokens: totalTokens,
              p_provider_input_cost_usd: providerInputCostUsd,
              p_provider_output_cost_usd: providerOutputCostUsd,
              p_provider_total_cost_usd: providerTotalCostUsd,
              p_charged_total_cost_inr: chargedTotalCostInr,
              p_frontier_model: FRONTIER_BASELINE.id,
              p_frontier_cost_usd: frontierCostUsd,
              p_savings_vs_frontier_usd: savingsVsFrontierUsd,
              p_idempotency_key: idempotencyKey,
            });
            const previewClean = fullContent
              .replace(/^\s*<!--\s*type\s*:\s*[a-z]+\s*-->\s*/i, "")
              .trim();
            await updateConversationAfterAssistant(env, {
              conversationId: convId,
              preview: previewClean.slice(0, 160),
              tokenCount: totalTokens,
              model: model.id,
            });
          }
        } catch {
          // ignore credit-record errors
        }

        const doneChunk = JSON.stringify({
          ok: true,
          messageId: insertedMessageId,
          skillId,
          usage: { promptTokens, completionTokens, totalTokens, chargedTotalCostInr },
          done: true,
        });
        await writer.write(encoder.encode(`data: ${doneChunk}\n\n`));
      } catch (streamErr: unknown) {
        const errMsg = streamErr instanceof Error ? streamErr.message : String(streamErr);
        await writer.write(encoder.encode(`data: {"error":${JSON.stringify(errMsg)}}\n\n`));
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err: unknown) {
    return c.json({ error: "proxy_error", detail: String(err) }, 500);
  }
}

/* ------------------------------------------------------------------ */
/*  /chat/summarize                                                   */
/* ------------------------------------------------------------------ */

export async function handleSummarize(c: Context<HonoEnv>) {
  try {
    const env = c.env;
    const userId = c.get("userId");

    const body = await c.req.json().catch(() => null);
    if (!body?.conversationId) {
      return c.json({ error: "missing_conversation_id" }, 400);
    }

    const convId = body.conversationId;
    const messageCount = await fetchMessageCount(env, convId);
    if (messageCount < SUMMARIZE_CHUNK_SIZE * 2) {
      return c.json({ ok: true, note: "too_few_messages" });
    }

    const startIdx = Math.max(0, messageCount - SUMMARIZE_CHUNK_SIZE * 2);
    const endIdx = messageCount - SUMMARIZE_CHUNK_SIZE;
    const chunk = await fetchMessagesRange(env, convId, startIdx, endIdx);
    if (chunk.length === 0) {
      return c.json({ ok: true, note: "no_messages_in_range" });
    }

    const summarizationPrompt =
      "Summarize the following conversation segment concisely. " +
      "Preserve facts, decisions, and context the assistant will need later. " +
      "Also list up to 5 key facts as a JSON array.\n\n" +
      "Respond in this exact JSON format (no markdown code fences):\n" +
      '{"summary":"...","key_facts":["fact1","fact2"]}\n\n' +
      chunk.map((m) => `${m.role}: ${m.content}`).join("\n\n");

    if (!env.OPENROUTER_API_KEY) {
      return c.json({ error: "missing_openrouter_api_key" }, 501);
    }

    // Use Gemini Flash Lite for reliable structured summarization
    const summaryModel = CURATED_MODELS.find((m) => m.id === "google/gemini-2.5-flash-lite") ?? CURATED_MODELS[0];
    const client = new OpenRouter({ apiKey: env.OPENROUTER_API_KEY });

    const completion = await client.chat.send({
      chatRequest: {
        model: summaryModel.id,
        messages: [{ role: "user", content: summarizationPrompt }],
        stream: false,
      },
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    let summaryText = "";
    let keyFacts: string[] = [];

    try {
      const cleaned = raw.replace(/```json\s*|\s*```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      summaryText = String(parsed.summary ?? "");
      keyFacts = Array.isArray(parsed.key_facts) ? parsed.key_facts : [];
    } catch {
      summaryText = raw.slice(0, 2000);
    }

    await insertConversationSummary(env, {
      conversationId: convId,
      messageStartIdx: startIdx,
      messageEndIdx: endIdx,
      summaryText,
      keyFacts,
    });

    return c.json({ ok: true, summary: summaryText, key_facts: keyFacts });
  } catch (err: unknown) {
    return c.json({ error: "summarize_error", detail: String(err) }, 500);
  }
}
