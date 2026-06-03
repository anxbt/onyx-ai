import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import { DEFAULT_MODEL_ID, MODELS } from "@/constants/models";
import type { ReasoningEffortLevel } from "@/types";

const STORE_KEY = "closedai-store";

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
  // Per-model reasoning effort preference. Keyed by model id. Missing key →
  // use the model's reasoningConfig.default (or omit reasoning entirely for
  // models with kind:"always-on").
  reasoningEffortByModel: Record<string, ReasoningEffortLevel>;
  setReasoningEffort: (modelId: string, level: ReasoningEffortLevel) => void;
}

// Persisted shape: only the keys we want to survive cold starts. Stored as
// JSON in a single AsyncStorage key.
interface PersistedState {
  activeModelId?: string;
  reasoningEffortByModel?: Record<string, ReasoningEffortLevel>;
}

function persist(state: Partial<PersistedState>) {
  // Read-modify-write so each setter persists only its slice without clobbering
  // other persisted fields.
  AsyncStorage.getItem(STORE_KEY)
    .then((value) => {
      const prev: PersistedState = value ? JSON.parse(value) : {};
      const next: PersistedState = { ...prev, ...state };
      return AsyncStorage.setItem(STORE_KEY, JSON.stringify(next));
    })
    .catch(() => {});
}

export const useAppStore = create<AppStore>()(
  (set, get) => ({
    activeModelId: DEFAULT_MODEL_ID,
    setActiveModelId: (id) => {
      set({ activeModelId: id });
      persist({ activeModelId: id });
    },
    creditBalance: 0,
    setCreditBalance: (balance) => set({ creditBalance: balance }),
    activeConversationId: null,
    setActiveConversationId: (id) => set({ activeConversationId: id }),
    memoryIndicatorVisible: false,
    setMemoryIndicatorVisible: (visible) => set({ memoryIndicatorVisible: visible }),
    activeArtifactTab: "text",
    setActiveArtifactTab: (tab) => set({ activeArtifactTab: tab }),
    reasoningEffortByModel: {},
    setReasoningEffort: (modelId, level) => {
      const next = { ...get().reasoningEffortByModel, [modelId]: level };
      set({ reasoningEffortByModel: next });
      persist({ reasoningEffortByModel: next });
    },
  }),
);

AsyncStorage.getItem(STORE_KEY)
  .then((value) => {
    if (!value) {
      return;
    }

    const persisted = JSON.parse(value) as PersistedState;
    const storedId = persisted.activeModelId;
    if (typeof storedId === "string" && storedId.length > 0) {
      // Validate against current model list — ignore stale IDs from old configs
      const valid = MODELS.some((m) => m.id === storedId);
      if (valid) {
        useAppStore.setState({ activeModelId: storedId });
      }
    }
    if (
      persisted.reasoningEffortByModel &&
      typeof persisted.reasoningEffortByModel === "object"
    ) {
      // Filter to known model ids so stale entries from removed models don't
      // accumulate in storage.
      const knownIds = new Set(MODELS.map((m) => m.id));
      const filtered: Record<string, ReasoningEffortLevel> = {};
      for (const [id, level] of Object.entries(persisted.reasoningEffortByModel)) {
        if (knownIds.has(id)) filtered[id] = level;
      }
      useAppStore.setState({ reasoningEffortByModel: filtered });
    }
  })
  .catch(() => {});
