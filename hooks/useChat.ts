import { useEffect, useRef, useState } from "react";

import { estimateTokens } from "@/lib/tokens";
import { streamChatFromWorker, summarizeConversation } from "@/lib/openrouter";
import { getEmbedding, extractMemoryFacts } from "@/lib/memory";
import {
  createConversation,
  fetchMessagesForConversation,
  insertUserMessage,
  supabase,
  updateConversationSummary,
} from "@/lib/supabase";
import type { Attachment, Conversation, Message, SessionLike } from "@/types";

export function useChat({
  conversationId,
  modelId,
  session,
  onConversationCreated,
}: {
  conversationId: string | null;
  modelId: string;
  session: SessionLike | null;
  onConversationCreated?: (conversation: Conversation) => void;
}) {
  const [activeConversationId, setActiveConversationId] = useState(conversationId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const sawContentRef = useRef(false);
  const polyfillTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.();
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

  async function sendMessage(content: string, attachments: Attachment[] = [], search?: { enableSearch: boolean; forceSearch: boolean }) {
    const trimmed = content.trim();
    if (!trimmed || !session?.accessToken) {
      return;
    }

    setError(null);
    let nextConversationId = activeConversationId;
    if (!nextConversationId) {
      const conversation = await createConversation(session.user.id, modelId);
      nextConversationId = conversation.id;
      setActiveConversationId(conversation.id);
      onConversationCreated?.(conversation);
    }
    const convId = nextConversationId as string; // narrowed via check above
    const token = session.accessToken as string; // narrowed via check above

    const savedUserMessage = await insertUserMessage(session.user.id, convId, trimmed, attachments.length > 0);

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

    // Wave 4: embed user message for future semantic retrieval (background)
    getEmbedding(trimmed, token).then((embedding) => {
      if (embedding.length && supabase) {
        supabase.from("messages").update({ embedding }).eq("id", savedUserMessage.id).then(
          () => {},
          () => {},
        );
      }
    }).catch(() => {});

    // Wave 4: trigger memory extraction every 15 messages (fire-and-forget)
    const totalMessageCount = allMessages.length + 1;
    if (totalMessageCount > 0 && totalMessageCount % 15 === 0) {
      extractMemoryFacts(convId, token);
    }

    const requestMessages: Message[] = allMessages.slice(-8).map((message) => ({
      id: message.id,
      conversationId: message.conversationId,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
    }));

    let finalContent = "";

    const cancel = streamChatFromWorker({
      accessToken: token,
      conversationId: convId,
      messages: requestMessages,
      modelId,
      attachments: attachments.length > 0 ? attachments : undefined,
      enableSearch: search?.enableSearch,
      forceSearch: search?.forceSearch,
      callbacks: {
        onContent: (accumulated) => {
          sawContentRef.current = true;
          finalContent = accumulated;
          setStreamingContent(accumulated);
        },
        onDone: (result) => {
          // If server didn't stream any chunks, polyfill streaming locally
          const performPolyfill = !sawContentRef.current && finalContent;

          const pushFinalMessage = (contentToPush: string) => {
            const assistantMessage: Message = {
              id: result.messageId ?? `assistant-${Date.now()}`,
              conversationId: convId,
              role: "assistant",
              content: contentToPush || "",
              model: modelId,
              createdAt: new Date().toISOString(),
            };

            setMessages((current) => [...current, assistantMessage]);
            setStreaming(false);
            setStreamingContent("");
          };

          if (performPolyfill) {
            // Reveal text in small increments to emulate streaming
            const text = finalContent;
            let idx = 0;
            const chunkSize = Math.max(1, Math.floor(text.length / 30));
            setStreaming(true);
            setStreamingContent("");
            polyfillTimerRef.current = global.setInterval(() => {
              if (idx >= text.length) {
                if (polyfillTimerRef.current) {
                  clearInterval(polyfillTimerRef.current as any);
                  polyfillTimerRef.current = null;
                }
                pushFinalMessage(text);
                return;
              }
              idx = Math.min(text.length, idx + chunkSize);
              setStreamingContent(text.slice(0, idx));
            }, 50) as unknown as number;
          } else {
            const assistantMessage: Message = {
              id: result.messageId ?? `assistant-${Date.now()}`,
              conversationId: convId,
              role: "assistant",
              content: finalContent || "",
              model: modelId,
              createdAt: new Date().toISOString(),
            };

            setMessages((current) => [...current, assistantMessage]);
            setStreaming(false);
            setStreamingContent("");
          }

          const assistantContent = finalContent || "";
          updateConversationSummary(
            convId,
            trimmed.slice(0, 120),
            modelId,
            estimateTokens([...requestMessages, { content: assistantContent }].map((message) => message.content).join(" ")),
          ).catch(() => {});

          // Wave 1: trigger summarization every 10 messages
          const totalMessageCount = allMessages.length + 1;
          if (totalMessageCount > 0 && totalMessageCount % 10 === 0) {
            summarizeConversation({
              accessToken: token,
              conversationId: convId,
            }).catch(() => {});
          }
        },
        onError: (err) => {
          setError(err.message || "Could not send message");
          setStreaming(false);
          setStreamingContent("");
        },
      },
    });

    abortRef.current = cancel;
  }

  function stopStreaming() {
    abortRef.current?.();
    abortRef.current = null;
    if (polyfillTimerRef.current) {
      clearInterval(polyfillTimerRef.current as any);
      polyfillTimerRef.current = null;
    }
    sawContentRef.current = false;
    setStreaming(false);
  }

  return {
    messages,
    setMessages,
    streaming,
    streamingContent,
    error,
    activeConversationId,
    sendMessage,
    stopStreaming,
    estimatedTokens: estimateTokens(
      streaming ? streamingContent : messages[messages.length - 1]?.content ?? "",
    ),
  };
}
