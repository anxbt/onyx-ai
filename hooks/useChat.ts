import { useEffect, useRef, useState } from "react";

import { estimateTokens } from "@/lib/tokens";
import { chatFromWorker } from "@/lib/openrouter";
import {
  createConversation,
  fetchMessagesForConversation,
  insertUserMessage,
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
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

  async function sendMessage(content: string, attachments: Attachment[] = []) {
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

    const savedUserMessage = await insertUserMessage(session.user.id, nextConversationId, trimmed, attachments.length > 0);

    const userMessage: Message = {
      ...savedUserMessage,
      conversationId: nextConversationId,
      role: "user",
      content: trimmed,
      hasAttachment: attachments.length > 0,
    };

    setMessages((current) => [...current, userMessage]);
    setStreaming(true);
    setStreamingContent("");

    try {
      const requestMessages: Message[] = [...messages, userMessage].map((message) => ({
        id: message.id,
        conversationId: message.conversationId,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      }));

      const res = await chatFromWorker({
        accessToken: session.accessToken,
        conversationId: nextConversationId,
        messages: requestMessages,
        modelId,
      });
      const assistantText = res?.assistant ?? (res?.choices && res.choices[0]?.message?.content) ?? JSON.stringify(res ?? {});
      const assistantMessage: Message = {
        id: res?.messageId ?? `assistant-${Date.now()}`,
        conversationId: nextConversationId,
        role: "assistant",
        content: assistantText,
        model: modelId,
        createdAt: new Date().toISOString(),
      };

      setMessages((current) => [...current, assistantMessage]);
      await updateConversationSummary(
        nextConversationId,
        trimmed.slice(0, 120),
        modelId,
        estimateTokens([...requestMessages, assistantMessage].map((message) => message.content).join(" ")),
      );
      setStreaming(false);
      setStreamingContent("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send message");
      setStreaming(false);
      setStreamingContent("");
    }
  }

  function stopStreaming() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
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
