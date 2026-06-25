import { useEffect, useRef, useState } from "react";

import { getEmbedding, extractMemoryFacts, summarizeConversation } from "@/api/worker";
import { streamChatFromWorker } from "@/api/stream";
import { getModelConfig } from "@/lib/models";
import { useAppStore } from "@/store/app";
import {
  createConversation,
  deleteMessagesAfter,
  fetchMessagesForConversation,
  insertUserMessage,
  supabase,
  updateConversationSummary,
  updateMessageContent,
} from "@/api/supabase";
import { estimateTokens } from "@/lib/tokens";
import type { Attachment, Conversation, Message, ReasoningEffortLevel, ResearchMode, ResearchTraceEvent, SessionLike, Source } from "@/types";

function upsertResearchTraceEvent(events: ResearchTraceEvent[], event: ResearchTraceEvent) {
  const existingIndex = events.findIndex((item) => item.id === event.id);
  if (existingIndex === -1) return [...events, event];
  return events.map((item, index) => (index === existingIndex ? event : item));
}

function resolveReasoningEffort(modelId: string): ReasoningEffortLevel | undefined {
  const config = getModelConfig(modelId).reasoningConfig;
  if (!config || config.kind === "always-on") return undefined;
  const stored = useAppStore.getState().reasoningEffortByModel[modelId];
  return stored && config.levels.includes(stored) ? stored : config.default;
}

export function useChat({
  conversationId,
  modelId,
  session,
  onConversationCreated,
  onConversationUpdated,
}: {
  conversationId: string | null;
  modelId: string;
  session: SessionLike | null;
  onConversationCreated?: (conversation: Conversation) => void;
  onConversationUpdated?: () => void;
}) {
  const [activeConversationId, setActiveConversationId] = useState(conversationId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingResearchTrace, setStreamingResearchTrace] = useState<ResearchTraceEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const sawContentRef = useRef(false);
  const polyfillTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.();
      if (polyfillTimerRef.current) {
        window.clearInterval(polyfillTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setActiveConversationId(conversationId);

    if (!conversationId) {
      setMessages([]);
      return;
    }

    let mounted = true;
    fetchMessagesForConversation(conversationId)
      .then((nextMessages) => {
        if (mounted) {
          setMessages(nextMessages);
        }
      })
      .catch((nextError) => {
        if (mounted) {
          setError(nextError instanceof Error ? nextError.message : "Could not load messages");
        }
      });

    return () => {
      mounted = false;
    };
  }, [conversationId]);

  async function sendMessage(content: string, attachments: Attachment[] = [], search?: { enableSearch: boolean; forceSearch: boolean; researchMode?: ResearchMode }) {
    const trimmed = content.trim();
    if (!trimmed || !session?.accessToken) {
      return;
    }

    setError(null);
    sawContentRef.current = false;
    let nextConversationId = activeConversationId;
    if (!nextConversationId) {
      const conversation = await createConversation(session.user.id, modelId);
      nextConversationId = conversation.id;
      setActiveConversationId(conversation.id);
      onConversationCreated?.(conversation);
    }

    const convId = nextConversationId;
    const token = session.accessToken;
    const savedUserMessage = await insertUserMessage(
      session.user.id,
      convId,
      trimmed,
      attachments.length > 0,
      attachments.length > 0 ? attachments : undefined,
    );

    const userMessage: Message = {
      ...savedUserMessage,
      conversationId: convId,
      role: "user",
      content: trimmed,
      hasAttachment: attachments.length > 0,
      attachments: attachments.length > 0 ? attachments : undefined,
    };

    const allMessages = [...messages, userMessage];
    setMessages(allMessages);
    setStreaming(true);
    setStreamingContent("");
    setStreamingResearchTrace([]);

    getEmbedding(trimmed, token)
      .then((embedding) => {
        if (embedding.length && supabase) {
          supabase.from("messages").update({ embedding }).eq("id", savedUserMessage.id).then(
            () => {},
            () => {},
          );
        }
      })
      .catch(() => {});

    const totalMessageCount = allMessages.length + 1;
    if (totalMessageCount > 0 && totalMessageCount % 15 === 0) {
      extractMemoryFacts(convId, token).catch(() => {});
    }

    runStreamForHistory(convId, token, allMessages, {
      search,
      attachments,
      summaryPreview: trimmed.slice(0, 120),
    });
  }

  function runStreamForHistory(
    convId: string,
    token: string,
    history: Message[],
    options?: {
      search?: { enableSearch: boolean; forceSearch: boolean; researchMode?: ResearchMode };
      attachments?: Attachment[];
      summaryPreview?: string;
    },
  ) {
    const requestMessages: Message[] = history.slice(-8).map((message) => ({
      id: message.id,
      conversationId: message.conversationId,
      role: message.role,
      content: message.content,
      attachments: message.attachments,
      createdAt: message.createdAt,
    }));

    let finalContent = "";
    let capturedSources: Source[] = [];
    let capturedResearchTrace: ResearchTraceEvent[] = [];
    sawContentRef.current = false;
    setStreaming(true);
    setStreamingContent("");
    setStreamingResearchTrace([]);
    setError(null);

    const cancel = streamChatFromWorker({
      accessToken: token,
      conversationId: convId,
      messages: requestMessages,
      modelId,
      attachments: options?.attachments?.length ? options.attachments : undefined,
      enableSearch: options?.search?.enableSearch,
      forceSearch: options?.search?.forceSearch,
      researchMode: options?.search?.researchMode,
      reasoningEffort: resolveReasoningEffort(modelId),
      callbacks: {
        onContent: (accumulated) => {
          sawContentRef.current = true;
          finalContent = accumulated;
          setStreamingContent(accumulated);
        },
        onSources: (sources) => {
          capturedSources = sources;
        },
        onResearchStep: (event) => {
          capturedResearchTrace = upsertResearchTraceEvent(capturedResearchTrace, event);
          setStreamingResearchTrace((current) => {
            const existingIndex = current.findIndex((item) => item.id === event.id);
            if (existingIndex === -1) return [...current, event];
            return current.map((item, index) => (index === existingIndex ? event : item));
          });
        },
        onDone: (result) => {
          const pushFinalMessage = (contentToPush: string) => {
            const assistantMessage: Message = {
              id: result.messageId ?? `assistant-${Date.now()}`,
              conversationId: convId,
              role: "assistant",
              content: contentToPush || "",
              model: modelId,
              sources: capturedSources.length ? capturedSources : undefined,
              researchTrace: capturedResearchTrace.length ? capturedResearchTrace : undefined,
              createdAt: new Date().toISOString(),
            };

            setMessages((current) => [...current, assistantMessage]);
            setStreaming(false);
            setStreamingContent("");
            setStreamingResearchTrace([]);
          };

          if (!sawContentRef.current && finalContent) {
            const text = finalContent;
            let idx = 0;
            const chunkSize = Math.max(1, Math.floor(text.length / 30));
            setStreaming(true);
            setStreamingContent("");
            polyfillTimerRef.current = window.setInterval(() => {
              if (idx >= text.length) {
                if (polyfillTimerRef.current) {
                  window.clearInterval(polyfillTimerRef.current);
                  polyfillTimerRef.current = null;
                }
                pushFinalMessage(text);
                return;
              }
              idx = Math.min(text.length, idx + chunkSize);
              setStreamingContent(text.slice(0, idx));
            }, 50);
          } else {
            pushFinalMessage(finalContent || "");
          }

          const lastUser = [...history].reverse().find((message) => message.role === "user");
          const preview = options?.summaryPreview ?? (lastUser?.content ?? "").slice(0, 120);
          updateConversationSummary(
            convId,
            preview,
            modelId,
            estimateTokens([...requestMessages, { content: finalContent }].map((message) => message.content).join(" ")),
            finalContent,
          )
            .then(() => onConversationUpdated?.())
            .catch(() => {});

          const totalMessageCount = history.length + 1;
          if (totalMessageCount > 0 && totalMessageCount % 10 === 0) {
            summarizeConversation({ conversationId: convId }, token).catch(() => {});
          }
        },
        onError: (err) => {
          setError(err.message || "Could not send message");
          setStreaming(false);
          setStreamingContent("");
          setStreamingResearchTrace([]);
        },
      },
    });

    abortRef.current = cancel;
  }

  async function regenerateLastAssistant() {
    if (!session?.accessToken || !activeConversationId || streaming) return;
    const lastAssistantIdx = [...messages].map((message) => message.role).lastIndexOf("assistant");
    if (lastAssistantIdx === -1) return;

    const lastAssistant = messages[lastAssistantIdx];
    const truncated = messages.slice(0, lastAssistantIdx);
    setMessages(truncated);

    try {
      await deleteMessagesAfter(activeConversationId, lastAssistant.createdAt, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not regenerate");
      setMessages(messages);
      return;
    }

    runStreamForHistory(activeConversationId, session.accessToken, truncated);
  }

  async function editUserMessage(messageId: string, newContent: string) {
    if (!session?.accessToken || !activeConversationId || streaming) return;
    const trimmed = newContent.trim();
    if (!trimmed) return;

    const idx = messages.findIndex((message) => message.id === messageId && message.role === "user");
    if (idx === -1) return;

    const target = messages[idx];
    const updatedTarget: Message = { ...target, content: trimmed };
    const truncated = [...messages.slice(0, idx), updatedTarget];
    setMessages(truncated);

    try {
      await updateMessageContent(messageId, trimmed);
      await deleteMessagesAfter(activeConversationId, target.createdAt, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not edit message");
      setMessages(messages);
      return;
    }

    runStreamForHistory(activeConversationId, session.accessToken, truncated);
  }

  function stopStreaming() {
    abortRef.current?.();
    abortRef.current = null;
    if (polyfillTimerRef.current) {
      window.clearInterval(polyfillTimerRef.current);
      polyfillTimerRef.current = null;
    }
    sawContentRef.current = false;
    setStreaming(false);
    setStreamingResearchTrace([]);
  }

  return {
    messages,
    setMessages,
    streaming,
    streamingContent,
    streamingResearchTrace,
    error,
    activeConversationId,
    sendMessage,
    regenerateLastAssistant,
    editUserMessage,
    stopStreaming,
    estimatedTokens: estimateTokens(streaming ? streamingContent : (messages[messages.length - 1]?.content ?? "")),
  };
}
