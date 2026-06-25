import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { DEFAULT_MODEL_ID, MODELS } from "@/constants/models";

type AppState = {
  activeModelId: string;
  creditBalance: number;
  activeConversationId: string | null;
  memoryIndicatorVisible: boolean;
  activeArtifactTab: string | null;
  setActiveModelId: (modelId: string) => void;
  setCreditBalance: (balance: number) => void;
  setActiveConversationId: (conversationId: string | null) => void;
  setMemoryIndicatorVisible: (visible: boolean) => void;
  setActiveArtifactTab: (tab: string | null) => void;
};

function normalizeModelId(modelId: string | undefined) {
  return MODELS.some((model) => model.id === modelId) ? (modelId as string) : DEFAULT_MODEL_ID;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeModelId: DEFAULT_MODEL_ID,
      creditBalance: 0,
      activeConversationId: null,
      memoryIndicatorVisible: false,
      activeArtifactTab: null,
      setActiveModelId: (modelId) => set({ activeModelId: normalizeModelId(modelId) }),
      setCreditBalance: (creditBalance) => set({ creditBalance }),
      setActiveConversationId: (activeConversationId) => set({ activeConversationId }),
      setMemoryIndicatorVisible: (memoryIndicatorVisible) => set({ memoryIndicatorVisible }),
      setActiveArtifactTab: (activeArtifactTab) => set({ activeArtifactTab }),
    }),
    {
      name: "closedai-store",
      storage: createJSONStorage(() => window.localStorage),
      partialize: (state) => ({ activeModelId: state.activeModelId }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.activeModelId = normalizeModelId(state.activeModelId);
        }
      },
    },
  ),
);
