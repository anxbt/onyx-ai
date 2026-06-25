import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { DEFAULT_MODEL_ID, MODELS } from "@/constants/models";
import type { ReasoningEffortLevel } from "@/types";

type AppState = {
  activeModelId: string;
  reasoningEffortByModel: Record<string, ReasoningEffortLevel>;
  creditBalance: number;
  activeConversationId: string | null;
  memoryIndicatorVisible: boolean;
  activeArtifactTab: string | null;
  setActiveModelId: (modelId: string) => void;
  setReasoningEffort: (modelId: string, level: ReasoningEffortLevel) => void;
  setCreditBalance: (balance: number) => void;
  setActiveConversationId: (conversationId: string | null) => void;
  setMemoryIndicatorVisible: (visible: boolean) => void;
  setActiveArtifactTab: (tab: string | null) => void;
};

function normalizeModelId(modelId: string | undefined) {
  return MODELS.some((model) => model.id === modelId) ? (modelId as string) : DEFAULT_MODEL_ID;
}

function normalizeReasoningEfforts(value: Record<string, ReasoningEffortLevel> | undefined) {
  if (!value) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([modelId, level]) => {
      const config = MODELS.find((model) => model.id === modelId)?.reasoningConfig;
      return config?.kind === "effort" && config.levels.includes(level);
    }),
  );
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeModelId: DEFAULT_MODEL_ID,
      reasoningEffortByModel: {},
      creditBalance: 0,
      activeConversationId: null,
      memoryIndicatorVisible: false,
      activeArtifactTab: null,
      setActiveModelId: (modelId) => set({ activeModelId: normalizeModelId(modelId) }),
      setReasoningEffort: (modelId, level) =>
        set((state) => ({
          reasoningEffortByModel: {
            ...state.reasoningEffortByModel,
            [modelId]: level,
          },
        })),
      setCreditBalance: (creditBalance) => set({ creditBalance }),
      setActiveConversationId: (activeConversationId) => set({ activeConversationId }),
      setMemoryIndicatorVisible: (memoryIndicatorVisible) => set({ memoryIndicatorVisible }),
      setActiveArtifactTab: (activeArtifactTab) => set({ activeArtifactTab }),
    }),
    {
      name: "closedai-store",
      storage: createJSONStorage(() => window.localStorage),
      partialize: (state) => ({
        activeModelId: state.activeModelId,
        reasoningEffortByModel: state.reasoningEffortByModel,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.activeModelId = normalizeModelId(state.activeModelId);
          state.reasoningEffortByModel = normalizeReasoningEfforts(state.reasoningEffortByModel);
        }
      },
    },
  ),
);
