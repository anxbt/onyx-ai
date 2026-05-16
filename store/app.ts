import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import { DEFAULT_MODEL_ID, MODELS } from "@/constants/models";

const STORE_KEY = "onyxai-store";

interface AppStore {
  activeModelId: string;
  setActiveModelId: (id: string) => void;
  creditBalance: number;
  setCreditBalance: (balance: number) => void;
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  memoryIndicatorVisible: boolean;
  setMemoryIndicatorVisible: (visible: boolean) => void;
  activeArtifactTab: string;
  setActiveArtifactTab: (tab: string) => void;
}

export const useAppStore = create<AppStore>()(
  (set) => ({
    activeModelId: DEFAULT_MODEL_ID,
    setActiveModelId: (id) => {
      set({ activeModelId: id });
      AsyncStorage.setItem(STORE_KEY, JSON.stringify({ activeModelId: id })).catch(() => {});
    },
    creditBalance: 0,
    setCreditBalance: (balance) => set({ creditBalance: balance }),
    activeConversationId: null,
    setActiveConversationId: (id) => set({ activeConversationId: id }),
    memoryIndicatorVisible: false,
    setMemoryIndicatorVisible: (visible) => set({ memoryIndicatorVisible: visible }),
    activeArtifactTab: "text",
    setActiveArtifactTab: (tab) => set({ activeArtifactTab: tab }),
  }),
);

AsyncStorage.getItem(STORE_KEY)
  .then((value) => {
    if (!value) {
      return;
    }

    const persisted = JSON.parse(value) as Partial<Pick<AppStore, "activeModelId">>;
    const storedId = persisted.activeModelId;
    if (typeof storedId === "string" && storedId.length > 0) {
      // Validate against current model list — ignore stale IDs from old configs
      const valid = MODELS.some((m) => m.id === storedId);
      if (valid) {
        useAppStore.setState({ activeModelId: storedId });
      }
    }
  })
  .catch(() => {});
