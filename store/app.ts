import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import { DEFAULT_MODEL_ID } from "@/constants/models";

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
  }),
);

AsyncStorage.getItem(STORE_KEY)
  .then((value) => {
    if (!value) {
      return;
    }

    const persisted = JSON.parse(value) as Partial<Pick<AppStore, "activeModelId">>;
    if (typeof persisted.activeModelId === "string" && persisted.activeModelId.length > 0) {
      useAppStore.setState({ activeModelId: persisted.activeModelId });
    }
  })
  .catch(() => {});
