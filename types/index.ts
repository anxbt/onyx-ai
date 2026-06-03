export type ReasoningEffortLevel =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

// How a model exposes reasoning controls. OpenRouter normalizes input across
// providers; the variability is in (a) which effort levels each model accepts
// vs `none` only, and (b) whether the model reasons unconditionally.
export type ReasoningConfig =
  | {
      kind: "effort";
      levels: ReasoningEffortLevel[]; // levels the user can pick in the UI
      default: ReasoningEffortLevel;
    }
  | {
      kind: "always-on"; // model reasons on every call; no knob to expose
    };

export interface ModelConfig {
  id: string;
  displayName: string;
  provider: string;
  modality: string;
  supportsReasoning: boolean;
  isFree: boolean;
  inputCostPerMToken: number;
  outputCostPerMToken: number;
  contextWindow: number;
  maxOutput: number;
  description: string;
  reasoningConfig?: ReasoningConfig;
}

export interface Attachment {
  id: string;
  name: string;
  type: "image" | "file";
  uri?: string;
  remoteUrl?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface Source {
  title: string;
  url: string;
  snippet: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  hasAttachment?: boolean;
  attachments?: Attachment[];
  sources?: Source[];
  // Optional chain-of-thought trace produced by reasoning models (DeepSeek
  // V4 Flash with effort, Kimi K2 Thinking always-on, Qwen3 thinking, etc.).
  // OpenRouter normalizes this from `delta.reasoning_details[*].text` during
  // streaming. Persisted separately from `content` so it can be shown in a
  // collapsible panel without polluting message previews / summaries.
  reasoning?: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  model: string;
  preview: string;
  tokenCount: number;
  updatedAt: string;
  isArchived?: boolean;
}

export interface MemoryFact {
  id: string;
  content: string;
  category: "learning" | "preference" | "project" | "personal";
  confidence: number;
  updatedAt: string;
}

export interface CreditTransaction {
  id: string;
  amount: number;
  type: "top_up" | "usage" | "refund";
  model?: string;
  tokensUsed?: number;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  displayName: string | null;
  creditBalance: number;
  totalTokensUsed: number;
  preferredModel: string;
  isSuperuser: boolean;
}

export interface UsageEvent {
  id: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  providerTotalCostUsd: number;
  chargedTotalCostInr: number;
  frontierModel: string;
  savingsVsFrontierUsd: number;
  deductionBypassed: boolean;
  createdAt: string;
}

export interface TopUpPack {
  id: string;
  label: string;
  amountInr: number;
  creditsInr: number;
  bonusLabel: string;
}

export interface CustomTopUp {
  amountInr: number;
  creditsInr: number;
}

export interface ModelCatalogEntry extends ModelConfig {
  appInputCostPerMToken: number;
  appOutputCostPerMToken: number;
  isActive: boolean;
}

export interface SessionUser {
  id: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface SessionLike {
  user: SessionUser;
  accessToken?: string;
}
