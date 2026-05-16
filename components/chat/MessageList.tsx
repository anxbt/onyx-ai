import { ScrollView, View } from "react-native";

import { MessageBubble } from "@/components/chat/MessageBubble";
import { Spacing } from "@/constants/spacing";
import type { Message } from "@/types";

interface MessageListProps {
  messages: Message[];
  streamingContent?: string;
  activeConversationId: string;
}

export function MessageList({ messages, streamingContent, activeConversationId }: MessageListProps) {
  return (
    <ScrollView
      contentContainerStyle={{ gap: Spacing.sectionGap, paddingBottom: Spacing.lg }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
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

