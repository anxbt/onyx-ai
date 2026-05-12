import { ScrollView, View } from "react-native";

import { MessageBubble } from "@/components/chat/MessageBubble";
import type { Message } from "@/types";

interface MessageListProps {
  messages: Message[];
  streamingContent?: string;
  activeConversationId: string;
}

export function MessageList({ messages, streamingContent, activeConversationId }: MessageListProps) {
  return (
    <ScrollView
      contentContainerStyle={{ gap: 14, paddingBottom: 16 }}
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

