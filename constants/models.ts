import { APP_CONFIG } from "@/constants/config";
import type { ModelConfig, TopUpPack } from "@/types";

export const MODELS: ModelConfig[] = [
  {
    id: "qwen/qwen3-coder-480b:free",
    displayName: "Qwen3 Coder",
    provider: "Alibaba",
    supportsVision: false,
    supportsReasoning: false,
    isFree: true,
    inputCostPerMToken: 0,
    outputCostPerMToken: 0,
    contextWindow: 262000,
    maxOutput: 8192,
    description: "Free model. Great for onboarding and lightweight tasks.",
  },
  {
    id: "minimax/minimax-m2.7",
    displayName: "MiniMax Fast",
    provider: "MiniMax",
    supportsVision: true,
    supportsReasoning: false,
    isFree: false,
    inputCostPerMToken: 0.3,
    outputCostPerMToken: 1.1,
    contextWindow: 1000000,
    maxOutput: 8192,
    description: "Fast and cheap. Best for everyday conversation.",
  },
  {
    id: "deepseek/deepseek-v3.2",
    displayName: "DeepSeek Smart",
    provider: "DeepSeek",
    supportsVision: false,
    supportsReasoning: true,
    isFree: false,
    inputCostPerMToken: 0.35,
    outputCostPerMToken: 1.4,
    contextWindow: 131072,
    maxOutput: 16384,
    description: "Default paid model. Strong reasoning, great value.",
  },
  {
    id: "qwen/qwen3-6-plus",
    displayName: "Qwen Plus",
    provider: "Alibaba",
    supportsVision: true,
    supportsReasoning: true,
    isFree: false,
    inputCostPerMToken: 0.5,
    outputCostPerMToken: 2,
    contextWindow: 131072,
    maxOutput: 16384,
    description: "Balanced. Handles images and complex tasks well.",
  },
  {
    id: "zai-org/glm-5.1",
    displayName: "GLM-5.1 Frontier",
    provider: "Zhipu AI",
    supportsVision: true,
    supportsReasoning: true,
    isFree: false,
    inputCostPerMToken: 1.05,
    outputCostPerMToken: 4.2,
    contextWindow: 200000,
    maxOutput: 128000,
    description: "Frontier quality. Competes with Claude Opus on coding.",
  },
];

export const FREE_MODEL_ID = "qwen/qwen3-coder-480b:free";
export const DEFAULT_MODEL_ID = FREE_MODEL_ID;

export const TOP_UP_PACKS: TopUpPack[] = [
  {
    id: "pkg_100",
    label: "Starter",
    amountInr: 100,
    creditsInr: 100,
    bonusLabel: "—",
  },
  {
    id: "pkg_250",
    label: "Popular",
    amountInr: 250,
    creditsInr: 262,
    bonusLabel: "+5%",
  },
  {
    id: "pkg_500",
    label: "Value",
    amountInr: 500,
    creditsInr: 535,
    bonusLabel: "+7%",
  },
  {
    id: "pkg_1000",
    label: "Pro",
    amountInr: 1000,
    creditsInr: 1100,
    bonusLabel: "+10%",
  },
];

export const FRONTIER_BASELINE = {
  id: APP_CONFIG.frontierBaselineModel,
  displayName: "Claude 3.5 Sonnet",
  inputCostPerMToken: 3,
  outputCostPerMToken: 15,
};
