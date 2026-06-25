export const GLOBAL_MARKUP = 1.4;
export const USD_TO_INR = 83.5;
export const FRONTIER_BASELINE = {
  id: "anthropic/claude-3.5-sonnet",
  inputCostPerMToken: 3,
  outputCostPerMToken: 15,
};

export const CURATED_MODELS = [
  {
    id: "openrouter/owl-alpha",
    displayName: "Owl Alpha",
    provider: "OpenRouter",
    role: "free",
    modality: "text",
    supportsReasoning: true,
    isFree: true,
    inputCostPerMToken: 0,
    outputCostPerMToken: 0,
    contextWindow: 1000000,
    maxOutput: 32768,
    description:
      "Free default. Strong at code, agents, and complex instructions. Provider may log messages for training.",
  },
  {
    id: "deepseek/deepseek-v4-pro",
    displayName: "DeepSeek V4 Pro",
    provider: "DeepSeek",
    role: "paid-default",
    modality: "text",
    supportsReasoning: true,
    isFree: false,
    inputCostPerMToken: 0.435,
    outputCostPerMToken: 0.87,
    contextWindow: 1000000,
    maxOutput: 32768,
    description: "Paid default. Stronger long-context reasoning and coding model. No training data collection.",
  },
  {
    id: "qwen/qwen3.6-plus",
    displayName: "Qwen3.6 Plus",
    provider: "Alibaba",
    role: "tutoring",
    modality: "text+image+video",
    supportsReasoning: true,
    isFree: false,
    inputCostPerMToken: 0.325,
    outputCostPerMToken: 1.95,
    contextWindow: 1000000,
    maxOutput: 65536,
    description: "Multimodal — handles images, diagrams, and exam papers. Best when you need vision.",
  },
  {
    id: "moonshotai/kimi-k2-thinking",
    displayName: "Kimi K2 Thinking",
    provider: "Moonshot AI",
    role: "reasoning",
    modality: "text",
    supportsReasoning: true,
    isFree: false,
    inputCostPerMToken: 0.6,
    outputCostPerMToken: 2.5,
    contextWindow: 262144,
    maxOutput: 32768,
    description: "Deep reasoning. Best for hard CS problems: compiler design, algorithms, proofs.",
  },
  {
    id: "z-ai/glm-5.2",
    displayName: "GLM-5.2",
    provider: "Z.ai",
    role: "agentic",
    modality: "text",
    supportsReasoning: true,
    isFree: false,
    inputCostPerMToken: 0.95,
    outputCostPerMToken: 3,
    contextWindow: 1000000,
    maxOutput: 131072,
    description: "Agentic reasoning model with a 1M context window for long-horizon coding and automation.",
  },
  // Internal-only — not in the user-facing client MODELS, but referenced by
  // hardcoded ID in chat.ts (search classification, summarization), memory.ts
  // (memory extraction), search.ts (topic extraction), upload.ts (vision OCR).
  // Hidden from picker by Section 4 catalog cleanup; replacement with
  // open-source equivalents (V4 Pro for text, Qwen3.6 Plus for vision)
  // deferred to the next round per the plan's Section 4b.
  {
    id: "google/gemini-2.5-flash-lite",
    displayName: "Gemini Flash Lite",
    provider: "Google",
    role: "ocr",
    modality: "text+image+file+audio+video",
    supportsReasoning: false,
    isFree: false,
    inputCostPerMToken: 0.1,
    outputCostPerMToken: 0.4,
    contextWindow: 1048576,
    maxOutput: 65535,
    description: "Internal: OCR, classification, summarization. Not user-selectable.",
  },
];

export const TOP_UP_PACKS = {
  pkg_100: { amountInr: 100, creditsInr: 100, label: "Starter" },
  pkg_250: { amountInr: 250, creditsInr: 262, label: "Popular" },
  pkg_500: { amountInr: 500, creditsInr: 535, label: "Value" },
  pkg_1000: { amountInr: 1000, creditsInr: 1100, label: "Pro" },
} as const;
