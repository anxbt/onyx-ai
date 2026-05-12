import { APP_CONFIG } from "@/constants/config";
import { FRONTIER_BASELINE } from "@/constants/models";
import type { ModelConfig } from "@/types";

export function calculateCreditCost(model: ModelConfig, inputTokens: number, outputTokens: number) {
  const inputCostUSD = (inputTokens / 1_000_000) * model.inputCostPerMToken * APP_CONFIG.globalMarkup;
  const outputCostUSD =
    (outputTokens / 1_000_000) * model.outputCostPerMToken * APP_CONFIG.globalMarkup;
  const totalINR = (inputCostUSD + outputCostUSD) * APP_CONFIG.usdToInr;
  return Math.ceil(totalINR * 100) / 100;
}

export function calculateProviderCostUsd(model: ModelConfig, inputTokens: number, outputTokens: number) {
  const inputCost = (inputTokens / 1_000_000) * model.inputCostPerMToken;
  const outputCost = (outputTokens / 1_000_000) * model.outputCostPerMToken;

  return {
    inputCostUsd: inputCost,
    outputCostUsd: outputCost,
    totalCostUsd: inputCost + outputCost,
  };
}

export function calculateFrontierBaselineCostUsd(inputTokens: number, outputTokens: number) {
  const inputCost = (inputTokens / 1_000_000) * FRONTIER_BASELINE.inputCostPerMToken;
  const outputCost = (outputTokens / 1_000_000) * FRONTIER_BASELINE.outputCostPerMToken;
  return inputCost + outputCost;
}
