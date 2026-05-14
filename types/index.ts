export interface ModelConfig {
  id: string;
  displayName: string;
  provider: string;
  supportsVision: boolean;
  supportsReasoning: boolean;
  isFree: boolean;
  inputCostPerMToken: number;
  outputCostPerMToken: number;
  contextWindow: number;
  maxOutput: number;
  description: string;
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

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  hasAttachment?: boolean;
  attachments?: Attachment[];
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

export interface ModelCatalogEntry extends ModelConfig {
  appInputCostPerMToken: number;
  appOutputCostPerMToken: number;
  isActive: boolean;
}

export interface SessionUser {
  id: string;
  email?: string;
}

export interface SessionLike {
  user: SessionUser;
  accessToken?: string;
}
