import { APP_CONFIG } from "@/constants/config";
import type { ModelConfig, TopUpPack } from "@/types";

export const MODELS: ModelConfig[] = [
  {
    id: "openrouter/owl-alpha",
    displayName: "Owl Alpha",
    provider: "OpenRouter",
    modality: "text",
    supportsReasoning: true,
    isFree: true,
    inputCostPerMToken: 0,
    outputCostPerMToken: 0,
    contextWindow: 1000000,
    maxOutput: 32768,
    description:
      "Free default. Strong at code, agents, and complex instructions. Note: your messages may be used by the provider to improve the model.",
    reasoningConfig: {
      kind: "effort",
      levels: ["none", "low", "medium", "high"],
      default: "medium",
    },
  },
  {
    id: "deepseek/deepseek-v4-flash",
    displayName: "DeepSeek V4 Flash",
    provider: "DeepSeek",
    modality: "text",
    supportsReasoning: true,
    isFree: false,
    inputCostPerMToken: 0.0983,
    outputCostPerMToken: 0.1966,
    contextWindow: 1000000,
    maxOutput: 16384,
    description:
      "Paid default. Verified reasoning levels (high, xhigh) for harder problems. No training data collection.",
    reasoningConfig: {
      kind: "effort",
      levels: ["none", "low", "medium", "high", "xhigh"],
      default: "medium",
    },
  },
  {
    id: "qwen/qwen3.6-plus",
    displayName: "Qwen3.6 Plus",
    provider: "Alibaba",
    modality: "text+image+video",
    supportsReasoning: true,
    isFree: false,
    inputCostPerMToken: 0.325,
    outputCostPerMToken: 1.95,
    contextWindow: 1000000,
    maxOutput: 65536,
    description:
      "Multimodal — handles images, diagrams, and exam papers. Best when you need vision.",
    reasoningConfig: {
      kind: "effort",
      levels: ["none", "low", "medium", "high"],
      default: "medium",
    },
  },
  {
    id: "moonshotai/kimi-k2-thinking",
    displayName: "Kimi K2 Thinking",
    provider: "Moonshot AI",
    modality: "text",
    supportsReasoning: true,
    isFree: false,
    inputCostPerMToken: 0.6,
    outputCostPerMToken: 2.5,
    contextWindow: 262144,
    maxOutput: 32768,
    description:
      "Deep reasoning. Best for hard CS problems: compiler design, algorithms, proofs. Always thinks before answering.",
    reasoningConfig: { kind: "always-on" },
  },
  {
    id: "z-ai/glm-5.1",
    displayName: "GLM-5.1",
    provider: "Zhipu AI",
    modality: "text",
    supportsReasoning: true,
    isFree: false,
    inputCostPerMToken: 0.98,
    outputCostPerMToken: 3.08,
    contextWindow: 202752,
    maxOutput: 65536,
    description:
      "Backup reasoning model. Broader knowledge, useful when Kimi is rate-limited.",
    reasoningConfig: {
      kind: "effort",
      levels: ["none", "low", "medium", "high"],
      default: "medium",
    },
  },
];

export const FREE_MODEL_ID = "openrouter/owl-alpha";
export const DEFAULT_MODEL_ID = FREE_MODEL_ID;

export const TOP_UP_PACKS: TopUpPack[] = [
  { id: "pkg_100", label: "Starter", amountInr: 100, creditsInr: 100, bonusLabel: "—" },
  { id: "pkg_250", label: "Popular", amountInr: 250, creditsInr: 262, bonusLabel: "+5%" },
  { id: "pkg_500", label: "Value", amountInr: 500, creditsInr: 535, bonusLabel: "+7%" },
  { id: "pkg_1000", label: "Pro", amountInr: 1000, creditsInr: 1100, bonusLabel: "+10%" },
];

export const FRONTIER_BASELINE = {
  id: APP_CONFIG.frontierBaselineModel,
  displayName: "Claude 3.5 Sonnet",
  inputCostPerMToken: 3,
  outputCostPerMToken: 15,
};
