import {
  AlertTriangle,
  ArrowRight,
  Bolt,
  Check,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  CirclePlus,
  Copy,
  CreditCard,
  Database,
  ExternalLink,
  FilePenLine,
  FileText,
  FolderOpen,
  Globe2,
  History,
  ImagePlus,
  Library,
  Lightbulb,
  LockKeyhole,
  Mail,
  Menu,
  MoreVertical,
  Paperclip,
  Pin,
  PinOff,
  RefreshCcw,
  Search,
  SendHorizontal,
  Settings,
  Sparkles,
  StopCircle,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { type FocusEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { FREE_MODEL_ID, MODELS as BASE_MODELS, TOP_UP_PACKS } from "@/constants/models";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { attachmentFromFile, documentAccept, generateUploadAnalysisId, uploadToStorage } from "@/api/uploads";
import { analyzeUpload, checkWorkerHealth, crawlUrl, createOrder, getEmbedding, searchWeb, verifyPayment } from "@/api/worker";
import {
  createConversation,
  deleteConversation,
  fetchMessagesForConversation,
  insertUserMessage,
  pinConversation,
  renameConversation,
} from "@/api/supabase";
import { streamChatFromWorker } from "@/api/stream";
import { useAuth } from "@/features/auth/useAuth";
import { useChat } from "@/features/chat/useChat";
import { useConversationsQuery, useModelCatalogQuery, useTransactionsQuery, useUsageQuery } from "@/features/queries";
import { useAppStore } from "@/store/app";
import type {
  Attachment,
  Conversation,
  CreditTransaction,
  Message,
  ModelCatalogEntry,
  ModelConfig,
  ReasoningConfig,
  ReasoningEffortLevel,
  ResearchMode,
  ResearchTraceEvent,
  SessionLike,
  UsageEvent,
  UserProfile,
} from "@/types";

type View = "chat" | "library" | "projects" | "credits" | "memory" | "settings";
type RazorpayInstance = {
  open: () => void;
  on: (event: "payment.failed", handler: (response: unknown) => void) => void;
};

const RAZORPAY_CHECKOUT_URL = "https://checkout.razorpay.com/v1/checkout.js";

const researchModeOptions: Array<{ value: ResearchMode; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "web", label: "Search" },
  { value: "deep", label: "Deep" },
];

function researchModeLabel(mode: ResearchMode) {
  return researchModeOptions.find((option) => option.value === mode)?.label ?? "Auto";
}

const reasoningLevelLabels: Record<ReasoningEffortLevel, string> = {
  none: "Off",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "XHigh",
};

function resolveReasoningLevel(model: Model, effortByModel: Record<string, ReasoningEffortLevel>) {
  const config = model.reasoningConfig;
  if (!config || config.kind === "always-on") return null;
  const stored = effortByModel[model.id];
  return stored && config.levels.includes(stored) ? stored : config.default;
}

function closeMenuOnBlur(event: FocusEvent<HTMLElement>, close: () => void) {
  const nextTarget = event.relatedTarget;
  if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
    close();
  }
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

function loadRazorpayCheckout() {
  if (window.Razorpay) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${RAZORPAY_CHECKOUT_URL}"]`);
    const script = existingScript ?? document.createElement("script");
    const timeout = window.setTimeout(() => {
      reject(new Error("Razorpay checkout did not load. Check your connection and try again."));
    }, 8000);

    const handleLoad = () => {
      window.clearTimeout(timeout);
      if (window.Razorpay) {
        resolve();
      } else {
        reject(new Error("Razorpay checkout loaded without exposing the checkout API."));
      }
    };
    const handleError = () => {
      window.clearTimeout(timeout);
      reject(new Error("Could not load Razorpay checkout."));
    };

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });

    if (!existingScript) {
      script.src = RAZORPAY_CHECKOUT_URL;
      script.async = true;
      document.body.appendChild(script);
    }
  });
}

function viewToPath(view: View) {
  if (view === "chat") return "/";
  return `/${view}`;
}

function pathToView(pathname: string): View {
  if (pathname === "/settings") return "settings";
  if (pathname === "/credits") return "credits";
  if (pathname === "/memory") return "memory";
  if (pathname === "/projects") return "projects";
  if (pathname === "/library") return "library";
  return "chat";
}

function isAuthPath(pathname: string) {
  return pathname.startsWith("/auth/");
}

type Model = {
  id: string;
  name: string;
  provider: string;
  detail: string;
  badge: string;
  context: string;
  cost: string;
  modality: "Text" | "Vision";
  isFree: boolean;
  reasoningConfig?: ReasoningConfig;
};

function toUiModel(model: ModelConfig | ModelCatalogEntry): Model {
  const outputCost = "appOutputCostPerMToken" in model ? model.appOutputCostPerMToken : model.outputCostPerMToken;
  return {
    id: model.id,
    name: model.displayName,
    provider: model.provider,
    detail: model.description,
    badge: model.isFree ? "Free" : model.supportsReasoning ? "Reasoning" : "Fast",
    context: `${Math.round(model.contextWindow / 1000)}k`,
    cost: model.isFree ? "Free" : `₹${outputCost.toFixed(2)} / 1M out`,
    modality: model.modality.includes("image") ? "Vision" : "Text",
    isFree: model.isFree,
    reasoningConfig: model.reasoningConfig,
  };
}

const staticModels: Model[] = BASE_MODELS.map(toUiModel);

function mergeAvailableModels(catalogModels: ModelCatalogEntry[] | undefined): Model[] {
  const catalog = catalogModels?.map(toUiModel) ?? [];
  const catalogById = new Map(catalog.map((model) => [model.id, model]));
  return staticModels.map((model) => {
    const catalogModel = catalogById.get(model.id);
    return catalogModel
      ? {
          ...catalogModel,
          reasoningConfig: model.reasoningConfig,
        }
      : model;
  });
}

const fallbackConversations: Conversation[] = [
  {
    id: "deep-research-engine",
    title: "Deep Research Engine",
    preview: "Remote worker contract liability analysis",
    updatedAt: "Today",
    model: "Qwen3.6 Plus",
    tokenCount: 0,
    isArchived: false,
    isPinned: true,
    pinnedAt: "Today",
  },
  {
    id: "credit-usage-audit",
    title: "Credit Usage Audit",
    preview: "Projected spend by model and endpoint",
    updatedAt: "Yesterday",
    model: "DeepSeek V4 Pro",
    tokenCount: 0,
    isArchived: false,
    isPinned: false,
  },
  {
    id: "market-analysis-q3",
    title: "Market Analysis Q3",
    preview: "Competitive summary with citation cards",
    updatedAt: "Jun 18",
    model: "Kimi K2.5",
    tokenCount: 0,
    isArchived: false,
    isPinned: false,
  },
  {
    id: "architecture-review",
    title: "Architecture Review",
    preview: "Worker, Supabase, and streaming migration notes",
    updatedAt: "Jun 16",
    model: "Qwen3.6 Plus",
    tokenCount: 0,
    isArchived: false,
    isPinned: false,
  },
];

const initialMessages: Message[] = [
  {
    id: "m1",
    conversationId: "preview",
    role: "user",
    content: "Show me what a research answer looks like for the new compliance guidelines regarding remote worker contracts.",
    createdAt: new Date().toISOString(),
  },
  {
    id: "m2",
    conversationId: "preview",
    role: "assistant",
    model: BASE_MODELS[0].id,
    content:
      "Based on the latest compliance updates, remote worker contracts require specific structural changes to liability and migration clauses. Section 4.2 mandates jurisdiction-specific liability definitions, while Section 5.1 needs a cross-indemnification clause for third-party claims.",
    createdAt: new Date().toISOString(),
  },
];

const renderSmokeContent = `<!--type:analysis-->
# Rendering Smoke

Inline math $e^{i\\pi}+1=0$ and display LaTeX:

$$
\\int_0^1 x^2\\,dx = \\frac{1}{3}
$$

| Artifact | Status |
| --- | --- |
| Math | Ready |
| Code | Ready |

Citation pills should link to source metadata [1].

<!--verify:{"type":"equation","equation":"alpha = n/(n*(m-1)+2)","var":"m","solutions":["(n+alpha*n-2*alpha)/(alpha*n)"]}-->

\`\`\`ts
type Smoke = { ok: boolean };
const result: Smoke = { ok: true };
console.log(result.ok);
\`\`\`

\`\`\`mermaid
flowchart LR
  A["Prompt"] --> B["Retrieve context"]
  B --> C["Generate answer"]
  C --> D["Verify citations"]
\`\`\`

\`\`\`chart
{"title":"Context Retrieval Scores","labels":["legal","billing","memory","search"],"values":[91,74,86,79]}
\`\`\`

\`\`\`plot
{"functions":["(1-x^2)^(1/2)","(1-x^2)^(1/3)","(1-x^2)^(1/5)","exp(-x^2)"],"xRange":[-1.5,1.5],"yRange":[-0.1,1.2]}
\`\`\`

\`\`\`molecule
{"smiles":"C1CCCC1","name":"cyclopentane"}
\`\`\`

\`\`\`geometry
30,120; 140,28; 250,120; 30,120
\`\`\`

\`\`\`html
<div style="min-height:220px;display:grid;place-items:center;background:#101012;color:#e5d5b0;font-family:system-ui;perspective:700px">
  <div style="width:96px;height:96px;transform:rotateX(58deg) rotateZ(42deg);transform-style:preserve-3d;background:linear-gradient(135deg,#e5d5b0,#7c715a);box-shadow:28px 28px 0 #27272a;border:1px solid #f5efe0"></div>
  <p style="margin:16px 0 0;color:#cfc8ba">3D CSS cube artifact</p>
</div>
\`\`\`
`;

function revokeAttachmentObjectUrl(attachment: Attachment) {
  if (attachment.uri?.startsWith("blob:")) {
    URL.revokeObjectURL(attachment.uri);
  }
}

function App() {
  const {
    session,
    profile,
    isLoading,
    authError,
    isPreviewMode,
    signInWithEmail,
    signInWithMagicLink,
    signInWithGoogle,
    signUpWithEmail,
    signOut,
    refreshProfile,
    completeAuthCallback,
  } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const activeModelId = useAppStore((state) => state.activeModelId);
  const setActiveModelId = useAppStore((state) => state.setActiveModelId);
  const reasoningEffortByModel = useAppStore((state) => state.reasoningEffortByModel);
  const setReasoningEffort = useAppStore((state) => state.setReasoningEffort);
  const activeConversationId = useAppStore((state) => state.activeConversationId);
  const setActiveConversationId = useAppStore((state) => state.setActiveConversationId);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [attachmentsEnabled, setAttachmentsEnabled] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [researchMode, setResearchMode] = useState<ResearchMode>("auto");
  const [conversationSearch, setConversationSearch] = useState("");
  const authMode = location.pathname === "/auth/sign-up" ? "sign-up" : "sign-in";
  const view = pathToView(location.pathname);
  const setView = (nextView: View) => {
    navigate(viewToPath(nextView));
  };
  const selectedModelId = activeModelId;
  const modelCatalogQuery = useModelCatalogQuery();
  const availableModels = mergeAvailableModels(modelCatalogQuery.data);
  const selectedModel = availableModels.find((model) => model.id === selectedModelId) ?? availableModels[0];
  const balanceDepleted = !selectedModel.isFree && (profile?.creditBalance ?? 0) <= 0;
  const conversationsQuery = useConversationsQuery(session?.user.id, conversationSearch);
  const usageQuery = useUsageQuery(session?.user.id);
  const transactionsQuery = useTransactionsQuery(session?.user.id);
  const visibleConversations = session
    ? conversationsQuery.data ?? []
    : fallbackConversations.filter((conversation) => {
        const needle = conversationSearch.trim().toLowerCase();
        if (!needle) return true;
        return `${conversation.title} ${conversation.preview} ${conversation.model}`.toLowerCase().includes(needle);
      });
  const refreshConversationList = () => {
    if (session?.user.id) {
      void queryClient.invalidateQueries({ queryKey: ["conversations", session.user.id] });
    }
  };
  const chat = useChat({
    conversationId: activeConversationId,
    modelId: selectedModelId,
    session,
    onConversationCreated: (conversation) => {
      setActiveConversationId(conversation.id);
      refreshConversationList();
    },
    onConversationUpdated: refreshConversationList,
  });

  const submitMessage = () => {
    const trimmed = draft.trim();
    if (chat.streaming) {
      chat.stopStreaming();
      return;
    }
    if (!trimmed) {
      return;
    }
    if (balanceDepleted) {
      setView("credits");
      return;
    }
    chat.sendMessage(trimmed, attachments, {
      enableSearch: true,
      forceSearch: researchMode !== "auto",
      researchMode,
    }).catch(() => {});
    setDraft("");
    if (researchMode !== "auto") {
      setResearchMode("auto");
    }
    attachments.forEach(revokeAttachmentObjectUrl);
    setAttachments([]);
  };

  const startNewChat = () => {
    setActiveConversationId(null);
    setView("chat");
    setDrawerOpen(false);
  };

  const selectConversation = (conversationId: string) => {
    setActiveConversationId(conversationId);
    setView("chat");
    setDrawerOpen(false);
  };

  const handleRenameConversation = async (conversationId: string, title: string) => {
    if (!session) return;
    await renameConversation(conversationId, title);
    refreshConversationList();
  };

  const handlePinConversation = async (conversationId: string, pinned: boolean) => {
    if (!session) return;
    await pinConversation(conversationId, pinned);
    refreshConversationList();
  };

  const handleDeleteConversation = async (conversationId: string) => {
    if (!session) return;
    await deleteConversation(conversationId);
    if (activeConversationId === conversationId) {
      setActiveConversationId(null);
      setView("chat");
    }
    refreshConversationList();
  };

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files?.length) return;
    const nextAttachments = Array.from(files).map(attachmentFromFile);
    setAttachmentsEnabled(true);
    setUploadStatus("Preparing upload…");

    if (!session?.accessToken) {
      setAttachments((current) => [...current, ...nextAttachments]);
      setUploadStatus("Files staged locally. Sign in to upload before sending.");
      return;
    }

    const uploaded = await Promise.all(
      nextAttachments.map(async (attachment) => {
        const result = await uploadToStorage(attachment, session.user.id, session.accessToken);
        if (result?.remoteUrl) {
          revokeAttachmentObjectUrl(attachment);
        }
        return result ?? attachment;
      }),
    );
    setAttachments((current) => [...current, ...uploaded]);
    setUploadStatus(uploaded.some((attachment) => attachment.remoteUrl) ? "Upload ready." : "Upload failed; files are staged locally.");
  };

  const commonProps = {
    attachmentsEnabled,
    attachments,
    availableModels,
    balanceDepleted,
    conversations: visibleConversations,
    conversationSearch,
    draft,
    editUserMessage: chat.editUserMessage,
    error: chat.error,
    messages: session ? chat.messages : initialMessages,
    activeConversationId,
    profile,
    regenerateLastAssistant: chat.regenerateLastAssistant,
    researchMode,
    reasoningEffortByModel,
    selectedModel,
    selectedModelId,
    setAttachmentsEnabled,
    setAttachments,
    setConversationSearch,
    setDraft,
    setResearchMode,
    setReasoningEffort,
    setView,
    streaming: chat.streaming,
    streamingContent: chat.streamingContent,
    streamingResearchTrace: chat.streamingResearchTrace,
    stopStreaming: chat.stopStreaming,
    submitMessage,
    uploadStatus,
    onFilesSelected: handleFilesSelected,
    onNewChat: startNewChat,
    onDeleteConversation: handleDeleteConversation,
    onPinConversation: handlePinConversation,
    onRenameConversation: handleRenameConversation,
    onSelectConversation: selectConversation,
    transactions: transactionsQuery.data ?? [],
    usageEvents: usageQuery.data ?? [],
    session,
    refreshProfile,
    signOut,
    view,
  };

  const shell = (
    <div className="app-shell">
      <div className={`app-content ${session ? "" : "is-auth-blurred"}`} aria-hidden={!session}>
        <a className="skip-link" href="#message-input">
          Skip to Composer
        </a>

        <DesktopLayout
          {...commonProps}
          railCollapsed={railCollapsed}
          setRailCollapsed={setRailCollapsed}
          setSelectedModelId={setActiveModelId}
        />
        <MobileLayout
          {...commonProps}
          drawerOpen={drawerOpen}
          setDrawerOpen={setDrawerOpen}
          setSelectedModelId={setActiveModelId}
        />

        {drawerOpen ? (
          <button className="drawer-backdrop" type="button" aria-label="Close menu" onClick={() => setDrawerOpen(false)} />
        ) : null}
      </div>

      {session ? null : (
        <LoginModal
          authError={authError}
          mode={authMode}
          isLoading={isLoading}
          isPreviewMode={isPreviewMode}
          onEmailSignIn={signInWithEmail}
          onEmailSignUp={signUpWithEmail}
          onGoogleSignIn={signInWithGoogle}
          onMagicLink={signInWithMagicLink}
          onSwitchMode={(mode) => navigate(mode === "sign-up" ? "/auth/sign-up" : "/auth/sign-in")}
        />
      )}
    </div>
  );
  const loadingPage = <AuthLoadingPage />;
  const protectedShell =
    isLoading && !session && !isPreviewMode ? loadingPage : session || isPreviewMode ? shell : <Navigate to="/auth/sign-in" replace />;
  const protectedLiveSmoke =
    isLoading && !session ? loadingPage : session ? <LiveSmokePage session={session} /> : <Navigate to="/auth/sign-in" replace />;

  return (
    <Routes>
      <Route
        path="/auth/callback"
        element={<AuthCallback completeAuthCallback={completeAuthCallback} isPreviewMode={isPreviewMode} />}
      />
      <Route path="/auth/sign-in" element={isLoading && !session ? loadingPage : session ? <Navigate to="/" replace /> : shell} />
      <Route path="/auth/sign-up" element={isLoading && !session ? loadingPage : session ? <Navigate to="/" replace /> : shell} />
      <Route path="/" element={protectedShell} />
      <Route path="/library" element={protectedShell} />
      <Route path="/projects" element={protectedShell} />
      <Route path="/credits" element={protectedShell} />
      <Route path="/memory" element={protectedShell} />
      <Route path="/settings" element={protectedShell} />
      <Route path="/render-smoke" element={<RenderSmokePage />} />
      <Route path="/live-smoke" element={protectedLiveSmoke} />
      <Route path="*" element={<Navigate to={session ? "/" : "/auth/sign-in"} replace />} />
    </Routes>
  );
}

function AuthLoadingPage() {
  return (
    <div className="auth-callback">
      <section className="login-modal">
        <div className="login-mark" aria-hidden="true">
          C
        </div>
        <h2>Restoring Session</h2>
        <p className="login-notice">Checking your Closed AI session...</p>
      </section>
    </div>
  );
}

function LoginModal({
  authError,
  isLoading,
  isPreviewMode,
  mode,
  onEmailSignIn,
  onEmailSignUp,
  onGoogleSignIn,
  onMagicLink,
  onSwitchMode,
}: {
  authError: string | null;
  isLoading: boolean;
  isPreviewMode: boolean;
  mode: "sign-in" | "sign-up";
  onEmailSignIn: (email: string, password: string) => Promise<void>;
  onEmailSignUp: (email: string, password: string) => Promise<{ needsEmailConfirmation: boolean }>;
  onGoogleSignIn: () => Promise<void>;
  onMagicLink: (email: string) => Promise<void>;
  onSwitchMode: (mode: "sign-in" | "sign-up") => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleEmailAuth = async () => {
    setFormError(null);
    setNotice(null);
    try {
      if (mode === "sign-up") {
        const result = await onEmailSignUp(email, password);
        if (result.needsEmailConfirmation) {
          setNotice("Check your email to confirm the new account.");
        }
        return;
      }
      await onEmailSignIn(email, password);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not complete auth");
    }
  };

  return (
    <div className="auth-overlay" role="presentation">
      <section className="login-modal" role="dialog" aria-modal="true" aria-labelledby="login-title">
        <div className="login-mark" aria-hidden="true">
          C
        </div>
        <p className="login-kicker">Closed AI</p>
        <h2 id="login-title">{mode === "sign-up" ? "Create Your Account" : "Sign In to Continue"}</h2>
        <p className="login-copy">Access your research workspace, saved memory, generated artifacts, and credit balance.</p>

        {isPreviewMode ? <p className="login-warning">Add Supabase env vars in `web/.env` to enable real sign-in.</p> : null}
        {authError || formError ? <p className="login-warning">{formError ?? authError}</p> : null}
        {notice ? <p className="login-notice">{notice}</p> : null}

        <button className="google-signin" type="button" onClick={() => onGoogleSignIn().catch((error) => setFormError(error.message))} disabled={isLoading || isPreviewMode}>
          <span className="google-mark" aria-hidden="true">
            G
          </span>
          Continue with Google
        </button>

        <div className="login-divider">
          <span>or sign in with email</span>
        </div>

        <form className="login-form" onSubmit={(event) => {
          event.preventDefault();
          handleEmailAuth();
        }}>
          <label>
            <span>Email</span>
            <span className="login-field">
              <Mail size={16} />
              <input
                type="email"
                name="email"
                placeholder="alex@closed.ai…"
                autoComplete="email"
                spellCheck={false}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </span>
          </label>
          <label>
            <span>Password</span>
            <span className="login-field">
              <LockKeyhole size={16} />
              <input
                type="password"
                name="password"
                placeholder="Enter password…"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </span>
          </label>
          <button className="login-submit" type="submit" disabled={isLoading || isPreviewMode}>
            {isLoading ? "Checking Session…" : mode === "sign-up" ? "Create Account" : "Sign In with Email"}
          </button>
        </form>

        <div className="login-footer">
          <button
            type="button"
            disabled={isLoading || isPreviewMode}
            onClick={() => {
              setFormError(null);
              setNotice(null);
              onMagicLink(email)
                .then(() => setNotice("Check your email for a sign-in link."))
                .catch((error) => setFormError(error instanceof Error ? error.message : "Could not send magic link"));
            }}
          >
            Use Magic Link
          </button>
          <button type="button" onClick={() => onSwitchMode(mode === "sign-up" ? "sign-in" : "sign-up")}>
            {mode === "sign-up" ? "Back to Sign In" : "Create Account"}
          </button>
        </div>
      </section>
    </div>
  );
}

function AuthCallback({
  completeAuthCallback,
  isPreviewMode,
}: {
  completeAuthCallback: () => Promise<void>;
  isPreviewMode: boolean;
}) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Reading OAuth callback...");
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;
    if (isPreviewMode) {
      setError("Supabase is not configured.");
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("error_description") ?? params.get("error");
    if (oauthError) {
      setError(oauthError);
      return;
    }

    const timers = [
      window.setTimeout(() => setStatus("Exchanging the OAuth code with Supabase..."), 1500),
      window.setTimeout(() => setStatus("Loading your Closed AI profile..."), 6000),
    ];
    const timeout = new Promise<never>((_, reject) => {
      timers.push(
        window.setTimeout(
          () => reject(new Error("Sign-in callback timed out. Refresh this page or go back to Sign In and try again.")),
          25000,
        ),
      );
    });

    Promise.race([completeAuthCallback(), timeout])
      .then(() => navigate("/", { replace: true }))
      .catch((nextError) => {
        setError(nextError instanceof Error ? nextError.message : "Could not complete sign-in");
      })
      .finally(() => {
        timers.forEach((timer) => window.clearTimeout(timer));
      });
  }, [completeAuthCallback, isPreviewMode, navigate]);

  return (
    <div className="auth-callback">
      <section className="login-modal">
        <div className="login-mark" aria-hidden="true">C</div>
        <h2>{error ? "Sign-In Failed" : "Completing Sign-In"}</h2>
        <p className={error ? "login-warning" : "login-notice"}>{error ?? status}</p>
        {error ? <button className="login-submit" type="button" onClick={() => navigate("/auth/sign-in", { replace: true })}>Back to Sign In</button> : null}
      </section>
    </div>
  );
}

function DesktopLayout({
  railCollapsed,
  selectedModel,
  selectedModelId,
  setSelectedModelId,
  setRailCollapsed,
  setView,
  view,
  ...chatProps
}: ChatProps & {
  railCollapsed: boolean;
  selectedModelId: string;
  setSelectedModelId: (id: string) => void;
  setRailCollapsed: (collapsed: boolean) => void;
}) {
  return (
    <div className={`desktop-layout ${railCollapsed ? "is-rail-collapsed" : ""}`}>
      <DesktopRail
        collapsed={railCollapsed}
        conversations={chatProps.conversations}
        onToggle={() => setRailCollapsed(!railCollapsed)}
        activeConversationId={chatProps.activeConversationId}
        conversationSearch={chatProps.conversationSearch}
        onDeleteConversation={chatProps.onDeleteConversation}
        onNewChat={chatProps.onNewChat}
        onPinConversation={chatProps.onPinConversation}
        onRenameConversation={chatProps.onRenameConversation}
        onSelectConversation={chatProps.onSelectConversation}
        profile={chatProps.profile}
        session={chatProps.session}
        setConversationSearch={chatProps.setConversationSearch}
        setView={setView}
        view={view}
      />
      <main className="desktop-chat" aria-label={view === "chat" ? "Focused Research Chat" : "Workspace"}>
        <div className="desktop-model-slot">
          <ModelSelector models={chatProps.availableModels} selectedModelId={selectedModelId} onSelect={setSelectedModelId} />
        </div>

        {view === "chat" ? (
          <ChatStream {...chatProps} selectedModel={selectedModel} setView={setView} view={view} />
        ) : (
          <WorkspaceView {...chatProps} view={view} />
        )}
      </main>
    </div>
  );
}

type ChatProps = {
  activeConversationId: string | null;
  attachments: Attachment[];
  attachmentsEnabled: boolean;
  availableModels: Model[];
  balanceDepleted: boolean;
  conversations: Conversation[];
  conversationSearch: string;
  draft: string;
  editUserMessage: (messageId: string, newContent: string) => Promise<void>;
  error: string | null;
  messages: Message[];
  profile: UserProfile | null;
  regenerateLastAssistant: () => void;
  researchMode: ResearchMode;
  reasoningEffortByModel: Record<string, ReasoningEffortLevel>;
  selectedModel: Model;
  session: SessionLike | null;
  refreshProfile: () => Promise<UserProfile | null>;
  onNewChat: () => void;
  onDeleteConversation: (conversationId: string) => Promise<void>;
  onFilesSelected: (files: FileList | null) => void;
  onPinConversation: (conversationId: string, pinned: boolean) => Promise<void>;
  onRenameConversation: (conversationId: string, title: string) => Promise<void>;
  onSelectConversation: (conversationId: string) => void;
  setAttachmentsEnabled: (enabled: boolean) => void;
  setAttachments: (attachments: Attachment[]) => void;
  setConversationSearch: (value: string) => void;
  setDraft: (value: string) => void;
  setResearchMode: (mode: ResearchMode) => void;
  setReasoningEffort: (modelId: string, level: ReasoningEffortLevel) => void;
  setView: (view: View) => void;
  streaming: boolean;
  streamingContent: string;
  streamingResearchTrace: ResearchTraceEvent[];
  stopStreaming: () => void;
  submitMessage: () => void;
  uploadStatus: string | null;
  transactions: CreditTransaction[];
  usageEvents: UsageEvent[];
  signOut: () => Promise<void>;
  view: View;
};

function ChatStream(props: ChatProps) {
  const showEmptyState = !props.streaming && props.messages.length === 0;
  const { scrollRef, scrollToBottom, updateVisibility, visible } = useScrollToBottomControl<HTMLElement>();

  useEffect(() => {
    updateVisibility();
  }, [props.messages.length, props.streamingContent, props.streamingResearchTrace.length, showEmptyState, updateVisibility]);

  return (
    <>
      <section className="desktop-stream" aria-live="polite" ref={scrollRef}>
        {props.error ? <p className="chat-error">{props.error}</p> : null}
        {showEmptyState ? <EmptyChatState conversations={props.conversations} onSuggestion={props.setDraft} /> : null}
        {props.messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            onEditUserMessage={props.editUserMessage}
            selectedModel={props.selectedModel}
            onRegenerate={props.regenerateLastAssistant}
            onSuggestion={props.setDraft}
          />
        ))}
        {props.streamingResearchTrace.length ? <ResearchTrace events={props.streamingResearchTrace} /> : null}
        {props.streamingContent ? (
          <MessageBubble
            message={{
              id: "streaming",
              conversationId: "streaming",
              role: "assistant",
              content: props.streamingContent,
              model: props.selectedModel.id,
              createdAt: new Date().toISOString(),
            }}
            onEditUserMessage={props.editUserMessage}
            selectedModel={props.selectedModel}
            onRegenerate={props.regenerateLastAssistant}
            onSuggestion={props.setDraft}
          />
        ) : null}
      </section>

      {visible ? (
        <button className="scroll-bottom-button desktop-scroll-bottom" type="button" onClick={scrollToBottom} aria-label="Scroll to latest message">
          <ChevronDown size={20} />
        </button>
      ) : null}

      <DesktopComposer {...props} />
    </>
  );
}

function ResearchTrace({ events }: { events: ResearchTraceEvent[] }) {
  const visibleEvents = events.slice(0, 12);
  const iconForStage = (stage: ResearchTraceEvent["stage"]) => {
    if (stage === "plan") return Database;
    if (stage === "search") return Search;
    if (stage === "read") return Globe2;
    return Check;
  };

  return (
    <section className="research-trace" aria-label="Research progress">
      <header>
        <Globe2 size={16} />
        <span>Researching sources</span>
      </header>
      <div className="research-trace-list">
        {visibleEvents.map((event) => {
          const Icon = iconForStage(event.stage);
          const detail = [event.detail, event.query].filter(Boolean).join(" · ");
          return (
            <div className="research-trace-item" key={event.id}>
              <span className="research-trace-icon" aria-hidden="true">
                <Icon size={14} />
              </span>
              <div>
                <strong>{event.label}</strong>
                {detail ? <small>{detail}</small> : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const neutralStarterPrompts = [
  "Help me think through a decision",
  "Summarize a document or image",
  "Compare the best options with sources",
  "Turn my notes into a clean plan",
  "Draft a message I can send",
];

function getTimeGreeting() {
  const hour = new Date().getHours();
  if (hour < 5) return "Burning the midnight oil? Let’s make it worth it.";
  if (hour < 9) return "You’re up early. What are we working through?";
  if (hour < 12) return "Good morning. What should we untangle first?";
  if (hour < 17) return "Good afternoon. What should we figure out?";
  if (hour < 22) return "Good evening. What needs your attention?";
  return "Late session? Let’s keep it focused.";
}

function buildEmptyStateSuggestions(conversations: Conversation[]) {
  const recent = conversations
    .filter((conversation) => conversation.title && conversation.title.toLowerCase() !== "new chat")
    .slice(0, 5);
  const suggestions = recent.flatMap((conversation) => {
    const topic = conversation.title.replace(/[?.!]+$/g, "");
    return [
      `What are the next steps for ${topic}?`,
      conversation.preview ? `Continue from: ${conversation.preview.slice(0, 72)}` : `Summarize ${topic}`,
    ];
  });

  return Array.from(new Set(suggestions)).slice(0, 5).concat(neutralStarterPrompts).slice(0, 5);
}

function EmptyChatState({
  conversations,
  onSuggestion,
}: {
  conversations: Conversation[];
  onSuggestion: (suggestion: string) => void;
}) {
  const suggestions = useMemo(() => buildEmptyStateSuggestions(conversations), [conversations]);
  return (
    <section className="empty-chat-state" aria-label="New chat suggestions">
      <p>{getTimeGreeting()}</p>
      <h1>What should Closed AI help with?</h1>
      <div className="empty-prompt-grid">
        {suggestions.map((suggestion) => (
          <button type="button" key={suggestion} onClick={() => onSuggestion(suggestion)}>
            {suggestion}
          </button>
        ))}
      </div>
    </section>
  );
}

function splitSuggestionBlock(content: string) {
  const match = content.match(/\n\s*\[Suggestions\]\s*([\s\S]*)$/i);
  if (!match || match.index === undefined) {
    return { body: content, suggestions: [] as string[] };
  }

  const suggestions = match[1]
    .split(/\n/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim())
    .map((line) => line.replace(/^["']|["']$/g, ""))
    .filter(Boolean)
    .slice(0, 5);

  return {
    body: content.slice(0, match.index).trimEnd(),
    suggestions,
  };
}

function sourceNameFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Source";
  }
}

function MessageBubble({
  message,
  onEditUserMessage,
  selectedModel,
  onRegenerate,
  onSuggestion,
}: {
  message: Message;
  onEditUserMessage: (messageId: string, newContent: string) => Promise<void>;
  selectedModel: Model;
  onRegenerate: () => void;
  onSuggestion?: (suggestion: string) => void;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = message.content;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopyState("copied");
    window.setTimeout(() => setCopyState("idle"), 2000);
  };

  if (message.role === "user") {
    return <UserMessageBubble className="desktop-user-message" message={message} onEditUserMessage={onEditUserMessage} />;
  }

  const { body, suggestions } = splitSuggestionBlock(message.content);
  const evidenceItems =
    message.sources?.map((source) => ({
      faviconUrl: source.faviconUrl,
      icon: ExternalLink,
      sourceName: sourceNameFromUrl(source.url),
      title: source.title,
      body: source.snippet,
      url: source.url,
    })) ?? [];

  return (
    <article className="desktop-answer">
      <span className="answer-avatar" aria-hidden="true">
        <Sparkles size={19} />
      </span>
      <div className="answer-content">
        <header className="answer-meta">
          <strong>{selectedModel.name}</strong>
          <span>{message.sources?.length ? `Synthesized from ${message.sources.length} sources` : "Assistant response"}</span>
        </header>
        {message.researchTrace?.length ? <ResearchTrace events={message.researchTrace} /> : null}
        <div className="answer-copy">
          <MarkdownRenderer content={body} isStreaming={message.id === "streaming"} sources={message.sources} />
        </div>
        {suggestions.length ? (
          <div className="suggestion-row" aria-label="Suggestions">
            {suggestions.map((suggestion) => (
              <button type="button" key={suggestion} onClick={() => onSuggestion?.(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}
        {evidenceItems.length ? (
          <div className="evidence-row">
            {evidenceItems.map(({ faviconUrl, icon: Icon, sourceName, title, body, url }) => (
              <a className="evidence-card" href={url} key={`${title}-${url}`} rel="noopener noreferrer" target="_blank">
                <span className="evidence-title">
                  {faviconUrl ? (
                    <img alt="" src={faviconUrl} loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} />
                  ) : (
                    <Icon size={15} />
                  )}
                  <span>
                    <small>{sourceName}</small>
                    <strong>{title}</strong>
                  </span>
                </span>
                <span className="evidence-body">{body}</span>
                <span className="evidence-foot">
                  Source
                  <ExternalLink size={15} />
                </span>
              </a>
            ))}
          </div>
        ) : null}
        <div className="desktop-actions" aria-label="Message actions">
          <button type="button" onClick={copyMessage}>
            <Copy size={15} />
            {copyState === "copied" ? "Copied" : "Copy"}
          </button>
          <button type="button" aria-label="Regenerate response" onClick={onRegenerate}>
            <RefreshCcw size={15} />
          </button>
          <button type="button" aria-label="Helpful">
            <ThumbsUp size={15} />
          </button>
          <button type="button" aria-label="Not helpful">
            <ThumbsDown size={15} />
          </button>
        </div>
      </div>
    </article>
  );
}

function UserMessageBubble({
  className,
  message,
  onEditUserMessage,
}: {
  className: string;
  message: Message;
  onEditUserMessage: (messageId: string, newContent: string) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(message.content);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setEditDraft(message.content);
    }
  }, [isEditing, message.content]);

  const submitEdit = async () => {
    const trimmed = editDraft.trim();
    if (!trimmed || trimmed === message.content.trim()) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      await onEditUserMessage(message.id, trimmed);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <article className={className}>
      {isEditing ? (
        <form
          className="user-edit-form"
          onSubmit={(event) => {
            event.preventDefault();
            submitEdit();
          }}
        >
          <textarea value={editDraft} onChange={(event) => setEditDraft(event.target.value)} rows={3} />
          <span>
            <button
              type="button"
              onClick={() => {
                setEditDraft(message.content);
                setIsEditing(false);
              }}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button type="submit" disabled={isSaving || !editDraft.trim()}>
              {isSaving ? "Saving" : "Save"}
            </button>
          </span>
        </form>
      ) : (
        <>
          <p>{message.content}</p>
          <footer className="user-message-footer">
            <span>{formatDateLabel(message.createdAt)}</span>
            <button
              type="button"
              onClick={() => {
                setEditDraft(message.content);
                setIsEditing(true);
              }}
            >
              <FilePenLine size={14} />
              Edit
            </button>
          </footer>
        </>
      )}
    </article>
  );
}

function DesktopRail({
  activeConversationId,
  collapsed = false,
  conversations,
  conversationSearch,
  onDeleteConversation,
  onNewChat,
  onPinConversation,
  onRenameConversation,
  onSelectConversation,
  onToggle,
  profile,
  session,
  setConversationSearch,
  setView,
  view,
}: {
  activeConversationId?: string | null;
  collapsed?: boolean;
  conversations?: Conversation[];
  conversationSearch?: string;
  onNewChat?: () => void;
  onDeleteConversation?: (conversationId: string) => Promise<void>;
  onPinConversation?: (conversationId: string, pinned: boolean) => Promise<void>;
  onRenameConversation?: (conversationId: string, title: string) => Promise<void>;
  onSelectConversation?: (conversationId: string) => void;
  onToggle?: () => void;
  profile?: UserProfile | null;
  session?: SessionLike | null;
  setConversationSearch?: (value: string) => void;
  setView?: (view: View) => void;
  view?: View;
}) {
  const recentConversations = conversations?.length ? conversations : session ? [] : fallbackConversations;
  const navItems = [
    { view: "library" as const, label: "Library", icon: Library },
    { view: "projects" as const, label: "Projects", icon: FolderOpen },
    { view: "memory" as const, label: "Memory", icon: Database },
    { view: "credits" as const, label: "Credits", icon: WalletCards },
    { view: "settings" as const, label: "Settings", icon: Settings },
  ];

  return (
    <aside className={`desktop-rail ${collapsed ? "is-collapsed" : ""}`} aria-label="Workspace navigation">
      <header className="rail-brand">
        <button className="rail-mark" type="button" onClick={() => setView?.("chat")} aria-label="Closed AI home">
          C
        </button>
        <span>
          <strong>Closed AI</strong>
          <span>Research Engine</span>
        </span>
        <button type="button" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={onToggle}>
          {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
        </button>
      </header>

      <div className="rail-new">
        <button
          type="button"
          onClick={() => onNewChat?.()}
          className={view === "chat" ? "is-active" : undefined}
          aria-current={view === "chat" ? "page" : undefined}
        >
          <CirclePlus size={20} />
          <span>New Chat</span>
        </button>
        <button type="button" aria-label="New document">
          <FilePenLine size={20} />
        </button>
      </div>

      <nav className="rail-nav" aria-label="Primary">
        {navItems.map(({ icon: Icon, label, view: itemView }) => (
          <button
            type="button"
            onClick={() => setView?.(itemView)}
            className={view === itemView ? "is-active" : undefined}
            aria-current={view === itemView ? "page" : undefined}
            key={itemView}
          >
            <Icon size={24} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <section className="recent-section" aria-label="Recent threads">
        <div className="recent-header">
          <h2>Recent Threads</h2>
          <label>
            <Search size={14} />
            <span className="sr-only">Search conversations</span>
            <input
              type="search"
              value={conversationSearch ?? ""}
              onChange={(event) => setConversationSearch?.(event.target.value)}
              placeholder="Search chats"
            />
          </label>
        </div>
        <div className="recent-list">
          {recentConversations.map((thread) => (
            <div className={`recent-item ${activeConversationId === thread.id ? "is-active" : ""}`} key={thread.id}>
              <button type="button" className="recent-primary" onClick={() => onSelectConversation?.(thread.id)}>
                <strong>{thread.title}</strong>
                <span>{thread.isPinned ? "Pinned" : formatDateLabel(thread.updatedAt)}</span>
              </button>
              {session ? (
                <ConversationActions
                  compact
                  conversation={thread}
                  onDeleteConversation={onDeleteConversation}
                  onPinConversation={onPinConversation}
                  onRenameConversation={onRenameConversation}
                />
              ) : null}
            </div>
          ))}
          {!recentConversations.length ? <p>{conversationSearch ? "No matching conversations." : "No conversations yet."}</p> : null}
        </div>
      </section>

      <footer className="rail-profile">
        <span
          className="profile-photo"
          style={session?.user.avatarUrl ? { backgroundImage: `url(${session.user.avatarUrl})` } : undefined}
          aria-hidden="true"
        >
          {session?.user.avatarUrl ? "" : getInitials(profile?.displayName ?? session?.user.email ?? "User")}
        </span>
        <span>
          <strong>{profile?.displayName ?? session?.user.displayName ?? session?.user.email ?? "Closed AI User"}</strong>
          <span>{session?.user.email ?? `₹${(profile?.creditBalance ?? 0).toFixed(2)} Balance`}</span>
        </span>
        <button type="button" aria-label="Profile menu">
          <MoreVertical size={18} />
        </button>
      </footer>
    </aside>
  );
}

function SearchModeControl({
  compact = false,
  mode,
  setMode,
}: {
  compact?: boolean;
  mode: ResearchMode;
  setMode: (mode: ResearchMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = researchModeOptions.find((option) => option.value === mode) ?? researchModeOptions[0];

  return (
    <span
      className={[
        "mode-control search-mode-control",
        compact ? "is-compact" : "",
        mode === "auto" ? "is-auto" : "is-on",
        open ? "is-open" : "",
      ].filter(Boolean).join(" ")}
      onBlur={(event) => closeMenuOnBlur(event, () => setOpen(false))}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Research mode: ${selected.label}`}
        onClick={() => setOpen((current) => !current)}
      >
        <Globe2 size={compact ? 18 : 16} />
        {compact ? null : <span>{selected.label}</span>}
        <ChevronDown size={compact ? 14 : 13} />
      </button>
      {open ? (
        <span className="mode-menu" role="menu">
          {researchModeOptions.map((option) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={mode === option.value}
              className={mode === option.value ? "is-selected" : undefined}
              key={option.value}
              onClick={() => {
                setMode(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}

function ReasoningModeControl({
  compact = false,
  effortByModel,
  model,
  setReasoningEffort,
}: {
  compact?: boolean;
  effortByModel: Record<string, ReasoningEffortLevel>;
  model: Model;
  setReasoningEffort: (modelId: string, level: ReasoningEffortLevel) => void;
}) {
  const [open, setOpen] = useState(false);
  const config = model.reasoningConfig;
  if (!config) return null;

  if (config.kind === "always-on") {
    return (
      <span className={["mode-control reasoning-mode-control is-always-on", compact ? "is-compact" : ""].filter(Boolean).join(" ")}>
        <button type="button" aria-label="Reasoning is always on for this model" disabled>
          <Lightbulb size={compact ? 18 : 16} />
          {compact ? null : <span>Always</span>}
        </button>
      </span>
    );
  }

  const selected = resolveReasoningLevel(model, effortByModel) ?? config.default;
  const selectedLabel = reasoningLevelLabels[selected];

  return (
    <span
      className={[
        "mode-control reasoning-mode-control",
        compact ? "is-compact" : "",
        selected === "none" ? "is-auto" : "is-on",
        open ? "is-open" : "",
      ].filter(Boolean).join(" ")}
      onBlur={(event) => closeMenuOnBlur(event, () => setOpen(false))}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Reasoning effort: ${selectedLabel}`}
        onClick={() => setOpen((current) => !current)}
      >
        <Lightbulb size={compact ? 18 : 16} />
        {compact ? null : <span>{selectedLabel}</span>}
        <ChevronDown size={compact ? 14 : 13} />
      </button>
      {open ? (
        <span className="mode-menu" role="menu">
          {config.levels.map((level) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={selected === level}
              className={selected === level ? "is-selected" : undefined}
              key={level}
              onClick={() => {
                setReasoningEffort(model.id, level);
                setOpen(false);
              }}
            >
              {reasoningLevelLabels[level]}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}

function useScrollToBottomControl<T extends HTMLElement>() {
  const scrollRef = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  const updateVisibility = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    setVisible(element.scrollHeight > element.clientHeight + 24 && distanceFromBottom > 220);
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    updateVisibility();
    element.addEventListener("scroll", updateVisibility, { passive: true });
    window.addEventListener("resize", updateVisibility);
    return () => {
      element.removeEventListener("scroll", updateVisibility);
      window.removeEventListener("resize", updateVisibility);
    };
  }, [updateVisibility]);

  const scrollToBottom = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }, []);

  return { scrollRef, scrollToBottom, updateVisibility, visible };
}

function DesktopComposer({
  attachments,
  attachmentsEnabled,
  balanceDepleted,
  draft,
  onFilesSelected,
  reasoningEffortByModel,
  researchMode,
  selectedModel,
  setAttachments,
  setAttachmentsEnabled,
  setDraft,
  setReasoningEffort,
  setResearchMode,
  streaming,
  submitMessage,
  uploadStatus,
}: ChatProps) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <form className="desktop-composer" aria-label="Chat composer" onSubmit={(event) => {
      event.preventDefault();
      submitMessage();
    }}>
      <input
        ref={imageInputRef}
        className="sr-only"
        type="file"
        accept="image/*"
        multiple
        onChange={(event) => {
          onFilesSelected(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        accept={documentAccept}
        multiple
        onChange={(event) => {
          onFilesSelected(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
      {attachments.length || uploadStatus ? (
        <div className="attachment-strip" aria-label="Attachments">
          {attachments.map((attachment) => (
            <button
              type="button"
              key={attachment.id}
              onClick={() => {
                revokeAttachmentObjectUrl(attachment);
                setAttachments(attachments.filter((item) => item.id !== attachment.id));
              }}
              title="Remove attachment"
            >
              {attachment.type === "image" ? <ImagePlus size={14} /> : <FileText size={14} />}
              <span>{attachment.name}</span>
              {attachment.remoteUrl ? <Check size={14} /> : null}
            </button>
          ))}
          {uploadStatus ? <small>{uploadStatus}</small> : null}
        </div>
      ) : null}
      <div className="composer-input-shell">
        <div className="composer-tools" aria-label="Message tools">
          <button
            type="button"
            aria-label="Attach document"
            aria-pressed={attachmentsEnabled}
            className={attachmentsEnabled ? "is-on" : undefined}
            onClick={() => {
              setAttachmentsEnabled(!attachmentsEnabled);
              fileInputRef.current?.click();
            }}
          >
            <Paperclip size={16} />
          </button>
          <button type="button" aria-label="Attach image" onClick={() => imageInputRef.current?.click()}>
            <ImagePlus size={16} />
          </button>
          <SearchModeControl mode={researchMode} setMode={setResearchMode} />
          <ReasoningModeControl
            effortByModel={reasoningEffortByModel}
            model={selectedModel}
            setReasoningEffort={setReasoningEffort}
          />
        </div>
        <label className="sr-only" htmlFor="message-input">Ask follow-up</label>
        <textarea
          id="message-input"
          rows={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask follow-up or refine query…"
          autoComplete="off"
        />
        <button type="submit" aria-label={streaming ? "Stop streaming" : balanceDepleted ? "Top up credits" : "Send message"}>
          {streaming ? <StopCircle size={18} /> : <SendHorizontal size={18} />}
        </button>
      </div>
      <p>{balanceDepleted ? "Top up credits to use this paid model, or switch to a free model." : "Closed AI may produce inaccurate information about people, places, or facts."}</p>
    </form>
  );
}

function ModelSelector({
  models,
  selectedModelId,
  onSelect,
}: {
  models: Model[];
  selectedModelId: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedModel = models.find((model) => model.id === selectedModelId) ?? models[0] ?? staticModels[0];

  return (
    <div
      className={`model-selector ${open ? "is-open" : ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      <button className="model-trigger" type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <Sparkles size={15} />
        <span>
          <strong>{selectedModel.name}</strong>
          <small>{selectedModel.badge}</small>
        </span>
        <ChevronDown size={15} />
      </button>
      <div className="model-menu" role="listbox" aria-label="Model selector">
        {models.map((model) => (
          <button
            className={model.id === selectedModelId ? "is-selected" : undefined}
            type="button"
            role="option"
            aria-selected={model.id === selectedModelId}
            key={model.id}
            onClick={() => {
              onSelect(model.id);
              setOpen(false);
            }}
          >
            <span>
              <strong>{model.name}</strong>
              <small>{model.provider} · {model.detail}</small>
              <small>{model.context} context · {model.cost} · {model.modality}</small>
            </span>
            {model.id === selectedModelId ? <Check size={15} /> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function formatDateLabel(value: string) {
  if (!value) return "";
  if (!Number.isNaN(Date.parse(value))) {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
  }
  return value;
}

function getInitials(value: string) {
  const parts = value
    .trim()
    .split(/\s+|@/)
    .filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function ConversationActions({
  compact = false,
  conversation,
  onDeleteConversation,
  onPinConversation,
  onRenameConversation,
}: {
  compact?: boolean;
  conversation: Conversation;
  onDeleteConversation?: (conversationId: string) => Promise<void>;
  onPinConversation?: (conversationId: string, pinned: boolean) => Promise<void>;
  onRenameConversation?: (conversationId: string, title: string) => Promise<void>;
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [draft, setDraft] = useState(conversation.title);
  const [pending, setPending] = useState<"rename" | "pin" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isRenaming) {
      setDraft(conversation.title);
    }
  }, [conversation.title, isRenaming]);

  const submitRename = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === conversation.title.trim() || !onRenameConversation) {
      setIsRenaming(false);
      return;
    }
    setError(null);
    setPending("rename");
    try {
      await onRenameConversation(conversation.id, trimmed);
      setIsRenaming(false);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not rename chat");
    } finally {
      setPending(null);
    }
  };

  const togglePin = async () => {
    if (!onPinConversation) return;
    setError(null);
    setPending("pin");
    try {
      await onPinConversation(conversation.id, !conversation.isPinned);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not update pin");
    } finally {
      setPending(null);
    }
  };

  const deleteChat = async () => {
    if (!onDeleteConversation) return;
    if (!window.confirm(`Delete "${conversation.title}" permanently?`)) return;
    setError(null);
    setPending("delete");
    try {
      await onDeleteConversation(conversation.id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not delete chat");
    } finally {
      setPending(null);
    }
  };

  if (isRenaming) {
    return (
      <form
        className={`conversation-rename ${compact ? "is-compact" : ""}`}
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          void submitRename();
        }}
      >
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setDraft(conversation.title);
              setIsRenaming(false);
            }
          }}
          aria-label="Rename chat"
        />
        <button type="submit" disabled={pending === "rename" || !draft.trim()} aria-label="Save chat title">
          <Check size={compact ? 13 : 15} />
        </button>
        <button
          type="button"
          disabled={pending === "rename"}
          onClick={() => {
            setDraft(conversation.title);
            setIsRenaming(false);
          }}
          aria-label="Cancel rename"
        >
          <X size={compact ? 13 : 15} />
        </button>
        {error ? <small>{error}</small> : null}
      </form>
    );
  }

  return (
    <div className={`conversation-actions ${compact ? "is-compact" : ""}`} onClick={(event) => event.stopPropagation()}>
      <button type="button" onClick={() => setIsRenaming(true)} aria-label="Rename chat">
        <FilePenLine size={compact ? 13 : 15} />
      </button>
      <button
        type="button"
        onClick={() => void togglePin()}
        disabled={pending === "pin"}
        aria-label={conversation.isPinned ? "Unpin chat" : "Pin chat"}
      >
        {conversation.isPinned ? <PinOff size={compact ? 13 : 15} /> : <Pin size={compact ? 13 : 15} />}
      </button>
      <button type="button" onClick={() => void deleteChat()} disabled={pending === "delete"} aria-label="Delete chat">
        <Trash2 size={compact ? 13 : 15} />
      </button>
      {error ? <small>{error}</small> : null}
    </div>
  );
}

function WorkspaceView({
  conversations,
  conversationSearch,
  onDeleteConversation,
  onPinConversation,
  onRenameConversation,
  onSelectConversation,
  profile,
  refreshProfile,
  session,
  signOut,
  transactions,
  usageEvents,
  view,
}: Pick<
  ChatProps,
  | "conversations"
  | "conversationSearch"
  | "onDeleteConversation"
  | "onPinConversation"
  | "onRenameConversation"
  | "onSelectConversation"
  | "profile"
  | "refreshProfile"
  | "session"
  | "signOut"
  | "transactions"
  | "usageEvents"
> & {
  view: View;
}) {
  if (view === "settings") {
    return <SettingsPage profile={profile} session={session} signOut={signOut} />;
  }
  if (view === "credits") {
    return <CreditsPage profile={profile} refreshProfile={refreshProfile} session={session} transactions={transactions} usageEvents={usageEvents} />;
  }
  if (view === "memory") {
    return <MemoryPage />;
  }
  if (view === "projects") {
    return <ProjectPage />;
  }
  return (
    <LibraryPage
      conversations={conversations}
      conversationSearch={conversationSearch}
      onDeleteConversation={onDeleteConversation}
      onPinConversation={onPinConversation}
      onRenameConversation={onRenameConversation}
      onSelectConversation={onSelectConversation}
    />
  );
}

function SettingsPage({
  profile,
  session,
  signOut,
}: {
  profile: UserProfile | null;
  session: SessionLike | null;
  signOut: () => Promise<void>;
}) {
  return (
    <section className="settings-page">
      <header className="settings-hero">
        <p>Workspace Settings</p>
        <h1>Closed AI Control Center</h1>
        <span>Manage your account, credits, and workspace access.</span>
      </header>

      <div className="settings-grid">
        <article className="settings-card profile-settings">
          <header>
            <span
              className="profile-photo"
              style={session?.user.avatarUrl ? { backgroundImage: `url(${session.user.avatarUrl})` } : undefined}
              aria-hidden="true"
            >
              {session?.user.avatarUrl ? "" : getInitials(profile?.displayName ?? session?.user.email ?? "User")}
            </span>
            <div>
              <h2>{profile?.displayName ?? session?.user.displayName ?? session?.user.email ?? "Closed AI User"}</h2>
              <p>
                {session?.user.email ?? "No email"} · {profile?.isSuperuser ? "Admin" : "Workspace"} · ₹
                {(profile?.creditBalance ?? 0).toFixed(2)}
              </p>
            </div>
          </header>
          <button type="button" onClick={() => signOut().catch(() => {})}>Sign Out</button>
        </article>
      </div>
    </section>
  );
}

function CreditsPage({
  profile,
  refreshProfile,
  session,
  transactions,
  usageEvents,
}: {
  profile: UserProfile | null;
  refreshProfile: () => Promise<UserProfile | null>;
  session: SessionLike | null;
  transactions: CreditTransaction[];
  usageEvents: UsageEvent[];
}) {
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);

  const startTopUp = async (packId: string) => {
    if (isPaying) return;
    if (!session?.accessToken) {
      setPaymentStatus("Sign in before topping up credits.");
      return;
    }

    try {
      setIsPaying(true);
      setPaymentStatus("Loading secure checkout…");
      await loadRazorpayCheckout();
      setPaymentStatus("Creating payment order…");
      const order = await createOrder({ packId }, session.accessToken);
      const checkoutKey = order.keyId || import.meta.env.VITE_RAZORPAY_KEY_ID;
      let paymentCompleted = false;

      if (!checkoutKey) {
        throw new Error("Razorpay key id is missing.");
      }

      const Razorpay = window.Razorpay;
      if (!Razorpay) {
        throw new Error("Razorpay checkout is unavailable.");
      }

      const checkout = new Razorpay({
        key: checkoutKey,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: "Closed AI",
        description: "Credit top up",
        prefill: {
          name: session.user.displayName ?? "",
          email: session.user.email ?? "",
        },
        modal: {
          ondismiss: () => {
            if (!paymentCompleted) {
              setPaymentStatus("Payment cancelled. No credits were added.");
              setIsPaying(false);
            }
          },
        },
        handler: async (response: unknown) => {
          const payload = response as {
            razorpay_order_id: string;
            razorpay_payment_id: string;
            razorpay_signature: string;
          };
          paymentCompleted = true;
          try {
            setPaymentStatus("Verifying payment…");
            await verifyPayment(payload, session.accessToken as string);
            await refreshProfile();
            setPaymentStatus("Payment verified. Balance refreshed.");
          } catch (error) {
            setPaymentStatus(error instanceof Error ? error.message : "Payment verification failed.");
          } finally {
            setIsPaying(false);
          }
        },
      });
      checkout.on("payment.failed", (response) => {
        const error = typeof response === "object" && response && "error" in response ? (response as { error?: { description?: string } }).error : null;
        setPaymentStatus(error?.description ?? "Payment failed. No credits were added.");
        setIsPaying(false);
      });
      checkout.open();
    } catch (error) {
      setPaymentStatus(error instanceof Error ? error.message : "Could not start payment.");
      setIsPaying(false);
    }
  };

  return (
    <section className="settings-page">
      <header className="settings-hero">
        <p>Credits</p>
        <h1>Balance and Top Up</h1>
        <span>Top up credits securely with Razorpay Standard Checkout.</span>
      </header>
      <div className="feature-grid">
        <article className="balance-card">
          <span>Available Balance</span>
          <strong>₹{(profile?.creditBalance ?? 0).toFixed(2)}</strong>
          <small>{usageEvents.length} usage events this month · {transactions.length} recent transactions.</small>
        </article>
        {paymentStatus ? <p className="payment-status">{paymentStatus}</p> : null}
        {TOP_UP_PACKS.map((pack) => (
          <button className="pack-card" type="button" key={pack.label} onClick={() => startTopUp(pack.id)} disabled={isPaying}>
            <CreditCard size={20} />
            <span>
              <strong>{pack.label}</strong>
              <small>{pack.bonusLabel === "—" ? "Base credit pack" : `${pack.bonusLabel} bonus credits`}</small>
            </span>
            <em>₹{pack.amountInr}</em>
          </button>
        ))}
      </div>
    </section>
  );
}

function MemoryPage() {
  return (
    <section className="settings-page">
      <header className="settings-hero">
        <p>Memory <span className="beta-tag">Beta</span></p>
        <h1>Saved Workspace Context</h1>
        <span>Memory is experimental and not fully active yet.</span>
      </header>
      <div className="feature-grid">
        <article className="settings-card">
          <header>
            <Database size={19} />
            <h2>Memory is in beta</h2>
          </header>
          <p className="card-copy">Saved context will appear here once memory extraction is reliable enough for daily use.</p>
        </article>
      </div>
    </section>
  );
}

function LibraryPage({
  conversations,
  conversationSearch,
  onDeleteConversation,
  onPinConversation,
  onRenameConversation,
  onSelectConversation,
}: {
  conversations: Conversation[];
  conversationSearch: string;
  onDeleteConversation: (conversationId: string) => Promise<void>;
  onPinConversation: (conversationId: string, pinned: boolean) => Promise<void>;
  onRenameConversation: (conversationId: string, title: string) => Promise<void>;
  onSelectConversation: (conversationId: string) => void;
}) {
  return (
    <section className="settings-page">
      <header className="settings-hero">
        <p>Library</p>
        <h1>Conversation Archive</h1>
        <span>
          {conversationSearch
            ? `Showing matches for "${conversationSearch}"`
            : "Search and reload the latest 20 unarchived conversations from Supabase."}
        </span>
      </header>
      <div className="conversation-grid">
        {conversations.map((conversation) => (
          <article className="conversation-card" key={conversation.id}>
            <button className="conversation-card-main" type="button" onClick={() => onSelectConversation(conversation.id)}>
              <span>{conversation.isPinned ? "Pinned" : formatDateLabel(conversation.updatedAt)}</span>
              <strong>{conversation.title}</strong>
              <p>{conversation.preview || "No preview yet."}</p>
              <small>{conversation.model}</small>
            </button>
            <ConversationActions
              conversation={conversation}
              onDeleteConversation={onDeleteConversation}
              onPinConversation={onPinConversation}
              onRenameConversation={onRenameConversation}
            />
          </article>
        ))}
        {!conversations.length ? (
          <p className="empty-copy">
            {conversationSearch ? "No conversations match your search." : "No conversations yet. Start a new chat to build your archive."}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function ProjectPage() {
  return (
    <section className="settings-page">
      <header className="settings-hero">
        <p>Projects <span className="beta-tag">Beta</span></p>
        <h1>Research Workspaces</h1>
        <span>Projects are a beta workspace layer for grouping chats and files later.</span>
      </header>
      <div className="feature-grid">
        <article className="settings-card">
          <header>
            <FolderOpen size={19} />
            <h2>Project spaces are coming</h2>
          </header>
          <p className="card-copy">For now, use the Library to organize and reopen conversations.</p>
        </article>
      </div>
    </section>
  );
}

function RenderSmokePage() {
  return (
    <main className="render-smoke-page">
      <header>
        <p>Renderer QA</p>
        <h1>Math, Code, Graph, Geometry, and 3D Smoke</h1>
        <span>This route is local and does not require auth or backend connectivity.</span>
      </header>
      <MarkdownRenderer
        content={renderSmokeContent}
        sources={[
          {
            title: "Migration Spec",
            url: "/MIGRATION.md",
            snippet: "Markdown, artifact, and renderer coverage target.",
          },
        ]}
      />
    </main>
  );
}

type LiveSmokeResult = {
  label: string;
  status: "pending" | "pass" | "fail";
  detail: string;
};

const liveSmokeQuery =
  "Find current context about RBI digital lending guidelines for loan apps in India and summarize the strongest source signals.";

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function LiveSmokePage({ session }: { session: SessionLike }) {
  const location = useLocation();
  const [running, setRunning] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [results, setResults] = useState<LiveSmokeResult[]>([
    { label: "Worker health", status: "pending", detail: "Not run" },
    { label: "Embedding endpoint", status: "pending", detail: "Not run" },
    { label: "Search and context retrieval", status: "pending", detail: "Not run" },
    { label: "Crawl endpoint", status: "pending", detail: "Not run" },
    { label: "Upload storage and analyze", status: "pending", detail: "Not run" },
    { label: "Free-model chat stream", status: "pending", detail: "Not run" },
    { label: "Chat persistence reload", status: "pending", detail: "Not run" },
    { label: "Payment order creation", status: "pending", detail: "Not run" },
    { label: "Razorpay checkout script", status: "pending", detail: "Not run" },
  ]);

  const updateResult = (label: string, status: LiveSmokeResult["status"], detail: string) => {
    setResults((current) => current.map((item) => (item.label === label ? { ...item, status, detail } : item)));
  };
  const hasRun = results.some((result) => result.detail !== "Not run");
  const completed = hasRun && results.every((result) => result.status !== "pending");
  const summary = useMemo(() => {
    const passed = results.filter((result) => result.status === "pass").length;
    const failed = results.filter((result) => result.status === "fail");
    const pending = results.filter((result) => result.status === "pending").length;
    const contextRetrieval = results.find((result) => result.label === "Search and context retrieval") ?? null;
    return {
      generatedAt: new Date().toISOString(),
      signedIn: Boolean(session.accessToken),
      user: {
        id: session.user.id,
        email: session.user.email,
        displayName: session.user.displayName,
      },
      passed,
      failed: failed.length,
      pending,
      allPassed: completed && failed.length === 0,
      contextRetrieval,
      rows: results,
    };
  }, [completed, results, session.accessToken, session.user.displayName, session.user.email, session.user.id]);
  const summaryJson = useMemo(() => JSON.stringify(summary, null, 2), [summary]);

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(summaryJson);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = summaryJson;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopyState("copied");
    window.setTimeout(() => setCopyState("idle"), 2000);
  };

  const runLiveSmoke = async () => {
    const token = session.accessToken;
    if (!token || running) return;

    setRunning(true);
    setResults((current) => current.map((item) => ({ ...item, status: "pending", detail: "Running..." })));

    try {
      const health = await checkWorkerHealth();
      updateResult("Worker health", health.ok ? "pass" : "fail", `${health.service ?? "worker"} responded`);
    } catch (error) {
      updateResult("Worker health", "fail", error instanceof Error ? error.message : "Worker health failed");
    }

    try {
      const embedding = await getEmbedding(liveSmokeQuery, token);
      updateResult("Embedding endpoint", embedding.length > 0 ? "pass" : "fail", `${embedding.length} dimensions returned`);
    } catch (error) {
      updateResult("Embedding endpoint", "fail", error instanceof Error ? error.message : "Embedding failed");
    }

    try {
      const search = await searchWeb({ query: liveSmokeQuery }, token);
      const resultsCount = Array.isArray(search.results) ? search.results.length : 0;
      const factsCount = Array.isArray(search.relatedFacts) ? search.relatedFacts.length : 0;
      const answerLength = search.answer?.length ?? 0;
      const topics = search.topics?.slice(0, 3).join(", ") || "no topics";
      const passed = Boolean(search.ok && (resultsCount > 0 || answerLength > 80 || factsCount > 0));
      updateResult(
        "Search and context retrieval",
        passed ? "pass" : "fail",
        `${resultsCount} results, ${factsCount} related facts, ${answerLength} answer chars, topics: ${topics}`,
      );
    } catch (error) {
      updateResult("Search and context retrieval", "fail", error instanceof Error ? error.message : "Search failed");
    }

    try {
      const crawled = await crawlUrl("https://example.com", token);
      updateResult(
        "Crawl endpoint",
        crawled.ok && (crawled.contentLength ?? 0) > 0 ? "pass" : "fail",
        `${crawled.title ?? crawled.url ?? "crawl"} · ${crawled.contentLength ?? 0} chars`,
      );
    } catch (error) {
      updateResult("Crawl endpoint", "fail", error instanceof Error ? error.message : "Crawl failed");
    }

    try {
      const file = new File([`Closed AI live smoke upload ${new Date().toISOString()}`], `live-smoke-${Date.now()}.txt`, {
        type: "text/plain",
      });
      const attachment = attachmentFromFile(file);
      const uploaded = await uploadToStorage(attachment, session.user.id, token, { analyze: false });
      revokeAttachmentObjectUrl(attachment);

      if (!uploaded?.remoteUrl || !uploaded.storagePath) {
        updateResult("Upload storage and analyze", "fail", "Upload did not return a public URL and storage path");
      } else {
        const analyzed = await analyzeUpload(
          {
            uploadId: generateUploadAnalysisId(),
            storagePath: uploaded.storagePath,
            mimeType: uploaded.mimeType ?? "text/plain",
          },
          token,
        );
        updateResult(
          "Upload storage and analyze",
          analyzed.ok ? "pass" : "fail",
          `${uploaded.storagePath} · ${analyzed.contentType ?? "unknown"} · ${(analyzed.description ?? analyzed.transcribedText ?? "").slice(0, 100)}`,
        );
      }
    } catch (error) {
      updateResult("Upload storage and analyze", "fail", error instanceof Error ? error.message : "Upload/analyze failed");
    }

    let smokeConversationId: string | null = null;
    try {
      const conversation = await createConversation(session.user.id, FREE_MODEL_ID);
      smokeConversationId = conversation.id;
      const prompt = "Live smoke test: reply with one short sentence confirming streaming works.";
      const userMessage = await insertUserMessage(session.user.id, conversation.id, prompt, false);
      let streamed = "";
      const cancelStreamRef: { current: (() => void) | null } = { current: null };
      try {
        await withTimeout(
          new Promise<void>((resolve, reject) => {
            cancelStreamRef.current = streamChatFromWorker({
              accessToken: token,
              conversationId: conversation.id,
              modelId: FREE_MODEL_ID,
              messages: [userMessage],
              enableSearch: false,
              forceSearch: false,
              callbacks: {
                onContent: (content) => {
                  streamed = content;
                },
                onDone: () => resolve(),
                onError: reject,
              },
            });
          }),
          45_000,
          "Chat stream",
        );
      } catch (error) {
        cancelStreamRef.current?.();
        throw error;
      }
      updateResult(
        "Free-model chat stream",
        streamed.trim().length > 0 ? "pass" : "fail",
        streamed.trim() ? `${streamed.trim().slice(0, 140)}${streamed.length > 140 ? "..." : ""}` : "No streamed content",
      );
    } catch (error) {
      updateResult("Free-model chat stream", "fail", error instanceof Error ? error.message : "Chat stream failed");
    }

    try {
      if (!smokeConversationId) {
        updateResult("Chat persistence reload", "fail", "No smoke conversation was created");
      } else {
        const persistedMessages = await fetchMessagesForConversation(smokeConversationId);
        const userCount = persistedMessages.filter((message) => message.role === "user").length;
        const assistantCount = persistedMessages.filter((message) => message.role === "assistant").length;
        updateResult(
          "Chat persistence reload",
          userCount > 0 && assistantCount > 0 ? "pass" : "fail",
          `${userCount} user message(s), ${assistantCount} assistant message(s) reloaded from Supabase`,
        );
      }
    } catch (error) {
      updateResult("Chat persistence reload", "fail", error instanceof Error ? error.message : "Persistence check failed");
    }

    try {
      const order = await createOrder({ packId: TOP_UP_PACKS[0].id }, token);
      updateResult(
        "Payment order creation",
        order.orderId && order.amount > 0 ? "pass" : "fail",
        `${order.currency} ${order.amount} · ${order.orderId || "missing order id"}`,
      );
    } catch (error) {
      updateResult("Payment order creation", "fail", error instanceof Error ? error.message : "Payment order failed");
    }

    updateResult(
      "Razorpay checkout script",
      window.Razorpay ? "pass" : "fail",
      window.Razorpay ? "window.Razorpay is available" : "checkout.js has not loaded",
    );

    setRunning(false);
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const hasNotRun = results.every((result) => result.detail === "Not run");
    if (params.get("autorun") === "1" && hasNotRun && !running) {
      runLiveSmoke();
    }
  }, [location.search]);

  useEffect(() => {
    if (completed) {
      window.localStorage.setItem("closedai-live-smoke-result", summaryJson);
    }
  }, [completed, summaryJson]);

  return (
    <main className="render-smoke-page live-smoke-page">
      <header>
        <p>Authenticated QA</p>
        <h1>Live End-to-End Smoke</h1>
        <span>Runs against the signed-in Supabase session and Cloudflare Worker endpoints.</span>
      </header>
      <button className="live-smoke-run" type="button" onClick={runLiveSmoke} disabled={running}>
        {running ? "Running checks..." : "Run live smoke"}
      </button>
      <section className="live-smoke-summary" aria-label="Live smoke summary">
        <header>
          <span>{completed ? (summary.allPassed ? "All checks passed" : `${summary.failed} check(s) failed`) : hasRun ? "Checks running" : "Not run"}</span>
          <button type="button" onClick={copySummary} disabled={!hasRun}>
            <Copy size={14} />
            {copyState === "copied" ? "Copied JSON" : "Copy JSON"}
          </button>
        </header>
        <pre>{summaryJson}</pre>
      </section>
      <div className="live-smoke-grid">
        {results.map((result) => (
          <article className={`live-smoke-card is-${result.status}`} key={result.label}>
            <strong>{result.label}</strong>
            <span>{result.status}</span>
            <p>{result.detail}</p>
          </article>
        ))}
      </div>
    </main>
  );
}

function MobileLayout({
  drawerOpen,
  selectedModelId,
  setDrawerOpen,
  setSelectedModelId,
  setView,
  view,
  ...chatProps
}: ChatProps & {
  drawerOpen: boolean;
  selectedModelId: string;
  setDrawerOpen: (value: boolean) => void;
  setSelectedModelId: (id: string) => void;
}) {
  return (
    <div className="mobile-layout">
      <header className="mobile-header">
        <button type="button" aria-label="Open menu" onClick={() => setDrawerOpen(true)}>
          <Menu size={27} />
        </button>
        <h1>CLOSED AI</h1>
        <button type="button" aria-label="History" onClick={() => setDrawerOpen(true)}>
          <History size={27} />
        </button>
      </header>
      <div className="mobile-model-slot">
        <ModelSelector models={chatProps.availableModels} selectedModelId={selectedModelId} onSelect={setSelectedModelId} />
      </div>

      <aside className={`mobile-drawer ${drawerOpen ? "is-open" : ""}`} aria-label="Mobile navigation" aria-hidden={!drawerOpen}>
        <DesktopRail
          activeConversationId={chatProps.activeConversationId}
          conversations={chatProps.conversations}
          conversationSearch={chatProps.conversationSearch}
          onDeleteConversation={chatProps.onDeleteConversation}
          onNewChat={chatProps.onNewChat}
          onPinConversation={chatProps.onPinConversation}
          onRenameConversation={chatProps.onRenameConversation}
          onSelectConversation={chatProps.onSelectConversation}
          profile={chatProps.profile}
          session={chatProps.session}
          setConversationSearch={chatProps.setConversationSearch}
          setView={setView}
          view={view}
        />
      </aside>

      {view === "chat" ? (
        <MobileChat {...chatProps} setView={setView} view={view} />
      ) : (
        <WorkspaceView
          conversations={chatProps.conversations}
          conversationSearch={chatProps.conversationSearch}
          onDeleteConversation={chatProps.onDeleteConversation}
          onPinConversation={chatProps.onPinConversation}
          onRenameConversation={chatProps.onRenameConversation}
          onSelectConversation={chatProps.onSelectConversation}
          profile={chatProps.profile}
          refreshProfile={chatProps.refreshProfile}
          session={chatProps.session}
          signOut={chatProps.signOut}
          transactions={chatProps.transactions}
          usageEvents={chatProps.usageEvents}
          view={view}
        />
      )}

      {view === "chat" ? <MobileComposer {...chatProps} setView={setView} view={view} /> : null}
      <MobileNav setView={setView} view={view} />
    </div>
  );
}

function MobileChat(props: ChatProps) {
  const showEmptyState = !props.streaming && props.messages.length === 0;
  const { scrollRef, scrollToBottom, updateVisibility, visible } = useScrollToBottomControl<HTMLElement>();

  useEffect(() => {
    updateVisibility();
  }, [props.messages.length, props.streamingContent, props.streamingResearchTrace.length, showEmptyState, updateVisibility]);

  return (
    <>
    <main className="mobile-thread" aria-label="Mobile chat" ref={scrollRef}>
      {props.error ? <p className="chat-error">{props.error}</p> : null}
      {showEmptyState ? <EmptyChatState conversations={props.conversations} onSuggestion={props.setDraft} /> : null}
      {props.messages.map((message) =>
        message.role === "user" ? (
          <UserMessageBubble
            className="mobile-user-bubble"
            key={message.id}
            message={message}
            onEditUserMessage={props.editUserMessage}
          />
        ) : (() => {
          const { body, suggestions } = splitSuggestionBlock(message.content);
          return (
            <section className="mobile-analysis" key={message.id}>
              <header>
                <Sparkles size={18} />
                <span>Closed Analysis · {props.selectedModel.name}</span>
              </header>
              {message.researchTrace?.length ? <ResearchTrace events={message.researchTrace} /> : null}
              <MarkdownRenderer content={body} sources={message.sources} />
              {suggestions.length ? (
                <div className="suggestion-row" aria-label="Suggestions">
                  {suggestions.map((suggestion) => (
                    <button type="button" key={suggestion} onClick={() => props.setDraft(suggestion)}>
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
          );
        })(),
      )}
      {props.streamingResearchTrace.length ? <ResearchTrace events={props.streamingResearchTrace} /> : null}
      {props.streamingContent ? (
        <section className="mobile-analysis">
          <header>
            <Sparkles size={18} />
            <span>Closed Analysis · {props.selectedModel.name}</span>
          </header>
          <MarkdownRenderer content={props.streamingContent} isStreaming />
        </section>
      ) : null}
    </main>
    {visible ? (
      <button className="scroll-bottom-button mobile-scroll-bottom" type="button" onClick={scrollToBottom} aria-label="Scroll to latest message">
        <ChevronDown size={20} />
      </button>
    ) : null}
    </>
  );
}

function DocumentCard() {
  return (
    <article className="document-card">
      <header>
        <span>
          <FileText size={25} />
          <strong>Worker Search Contract</strong>
        </span>
        <em>Draft V2</em>
      </header>

      <div className="clause-row">
        <span>4.2</span>
        <p>
          <strong>Liability Cap at $50k</strong>
          <small>Standard limitation applied to general damages.</small>
        </p>
      </div>

      <div className="clause-row is-warning">
        <span>5.1</span>
        <p>
          <strong>
            <AlertTriangle size={23} />
            Missing Indemnification
          </strong>
          <small>Cross-indemnification clauses are absent for third-party claims.</small>
        </p>
      </div>

      <button type="button">
        View Full Document
        <ArrowRight size={26} />
      </button>
    </article>
  );
}

function MobileComposer({
  attachmentsEnabled,
  balanceDepleted,
  draft,
  onFilesSelected,
  reasoningEffortByModel,
  researchMode,
  selectedModel,
  setAttachmentsEnabled,
  setDraft,
  setReasoningEffort,
  setResearchMode,
  streaming,
  submitMessage,
}: ChatProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <form className="mobile-composer" onSubmit={(event) => {
      event.preventDefault();
      submitMessage();
    }} aria-label="Mobile composer">
      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        accept={`image/*,${documentAccept}`}
        multiple
        onChange={(event) => {
          onFilesSelected(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
      <button
        type="button"
        aria-label="Add attachment"
        aria-pressed={attachmentsEnabled}
        onClick={() => {
          setAttachmentsEnabled(!attachmentsEnabled);
          fileInputRef.current?.click();
        }}
      >
        {attachmentsEnabled ? <ImagePlus size={25} /> : <CirclePlus size={25} />}
      </button>
      <label>
        <span className="sr-only">Message Closed AI</span>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={researchMode === "auto" ? "Message Closed AI…" : `${researchModeLabel(researchMode)} research…`}
          autoComplete="off"
        />
      </label>
      <SearchModeControl compact mode={researchMode} setMode={setResearchMode} />
      <ReasoningModeControl
        compact
        effortByModel={reasoningEffortByModel}
        model={selectedModel}
        setReasoningEffort={setReasoningEffort}
      />
      <button type="submit" aria-label={streaming ? "Stop streaming" : balanceDepleted ? "Top up credits" : "Send"}>
        {streaming ? <StopCircle size={25} /> : <SendHorizontal size={25} />}
      </button>
    </form>
  );
}

function MobileNav({ setView, view }: { setView: (view: View) => void; view: View }) {
  const items = [
    { view: "credits" as const, label: "Credits", icon: Bolt },
    { view: "library" as const, label: "Library", icon: Search },
    { view: "chat" as const, label: "Chat", icon: Sparkles },
    { view: "settings" as const, label: "Settings", icon: UserRound },
  ];

  return (
    <nav className="mobile-nav" aria-label="Mobile tabs">
      {items.map(({ icon: Icon, label, view: itemView }) => (
        <button
          className={view === itemView ? "is-active" : undefined}
          type="button"
          aria-current={view === itemView ? "page" : undefined}
          aria-label={label}
          onClick={() => setView(itemView)}
          key={itemView}
        >
          <Icon size={27} />
        </button>
      ))}
    </nav>
  );
}

export { App };
