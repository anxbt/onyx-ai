import { APP_CONFIG } from "@/constants/config";
import type { ModelConfig, TopUpPack } from "@/types";

export const MODELS: ModelConfig[] = [
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
      "Default multimodal model for high-quality chat, reasoning, images, diagrams, and exam papers.",
    reasoningConfig: {
      kind: "effort",
      levels: ["none", "low", "medium", "high"],
      default: "medium",
    },
  },
  {
    id: "deepseek/deepseek-v4-pro",
    displayName: "DeepSeek V4 Pro",
    provider: "DeepSeek",
    modality: "text",
    supportsReasoning: true,
    isFree: false,
    inputCostPerMToken: 0.435,
    outputCostPerMToken: 0.87,
    contextWindow: 1000000,
    maxOutput: 32768,
    description:
      "Strong long-context reasoning and coding model for harder agentic work. No training data collection.",
    reasoningConfig: {
      kind: "effort",
      levels: ["none", "low", "medium", "high", "xhigh"],
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
    id: "z-ai/glm-5.2",
    displayName: "GLM-5.2",
    provider: "Z.ai",
    modality: "text",
    supportsReasoning: true,
    isFree: false,
    inputCostPerMToken: 0.95,
    outputCostPerMToken: 3,
    contextWindow: 1000000,
    maxOutput: 131072,
    description:
      "Agentic reasoning model with a 1M context window. Strong for long-horizon coding, tool use, and project-scale automation.",
    reasoningConfig: {
      kind: "effort",
      levels: ["high", "xhigh"],
      default: "high",
    },
  },
];

export const DEFAULT_MODEL_ID = "qwen/qwen3.6-plus";

export const TOP_UP_PACKS: TopUpPack[] = [
  { id: "pkg_100", label: "Starter", amountInr: 100, creditsInr: 100, bonusLabel: "—" },
  { id: "pkg_250", label: "Popular", amountInr: 250, creditsInr: 262, bonusLabel: "+5%" },
];

export const FRONTIER_BASELINE = {
  id: APP_CONFIG.frontierBaselineModel,
  displayName: "Claude 3.5 Sonnet",
  inputCostPerMToken: 3,
  outputCostPerMToken: 15,
};
