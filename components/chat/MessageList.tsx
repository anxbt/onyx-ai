import { ScrollView, View } from "react-native";

import { MessageBubble } from "@/components/chat/MessageBubble";
import { Spacing } from "@/constants/spacing";
import type { Message } from "@/types";

interface MessageListProps {
  messages: Message[];
  streamingContent?: string;
  activeConversationId: string;
  onEdit?: (messageId: string, newContent: string) => void;
  onRegenerate?: () => void;
  canMutate?: boolean;
}

export function MessageList({
  messages,
  streamingContent,
  activeConversationId,
  onEdit,
  onRegenerate,
  canMutate,
}: MessageListProps) {
  let lastAssistantId: string | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      lastAssistantId = messages[i].id;
      break;
    }
  }

  return (
    <ScrollView
      contentContainerStyle={{ gap: Spacing.sectionGap, paddingBottom: Spacing.lg }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          onEdit={onEdit}
          onRegenerate={onRegenerate}
          isLastAssistant={!streamingContent && message.id === lastAssistantId}
          canMutate={canMutate}
        />
      ))}
      {streamingContent ? (
        <View>
          <MessageBubble
            isStreaming
            message={{
              id: "streaming",
              conversationId: activeConversationId,
              role: "assistant",
              content: streamingContent,
              createdAt: new Date().toISOString(),
            }}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

