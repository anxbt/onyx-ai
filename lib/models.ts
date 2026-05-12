import { DEFAULT_MODEL_ID, MODELS } from "@/constants/models";
import type { ModelCatalogEntry } from "@/types";

export function getModelConfig(id: string) {
  return MODELS.find((model) => model.id === id) ?? MODELS.find((model) => model.id === DEFAULT_MODEL_ID)!;
}

export function toCatalogEntry(modelId: string): ModelCatalogEntry {
  const model = getModelConfig(modelId);
  return {
    ...model,
    appInputCostPerMToken: model.inputCostPerMToken,
    appOutputCostPerMToken: model.outputCostPerMToken,
    isActive: true,
  };
}
