import React, { memo } from "react";
import { Image, Text, View } from "react-native";

import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { StreamingIndicator } from "@/components/chat/StreamingIndicator";
import { Colors } from "@/constants/colors";
import { getModelConfig } from "@/lib/models";
import type { Message } from "@/types";

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
}

function MessageBubbleComponent({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const model = message.model ? getModelConfig(message.model) : null;

  return (
    <View
      style={{
        alignSelf: isUser ? "flex-end" : "stretch",
        backgroundColor: isUser ? Colors.userBubble : Colors.assistantSurface,
        borderColor: Colors.border,
        borderRadius: 18,
        borderWidth: isUser ? 0 : 1,
        maxWidth: isUser ? "84%" : "100%",
        padding: 14,
        gap: 8,
      }}
    >
      {!isUser && model ? (
        <Text style={{ color: Colors.textTertiary, fontSize: 12, fontWeight: "700" }}>{model.displayName}</Text>
      ) : null}
      {message.attachments?.map((att) =>
        att.type === "image" && att.remoteUrl ? (
          <Image
            key={att.id}
            source={{ uri: att.remoteUrl }}
            style={{
              width: "100%",
              aspectRatio: 4 / 3,
              borderRadius: 10,
              backgroundColor: Colors.surfaceElevated,
            }}
            resizeMode="cover"
          />
        ) : null,
      )}
      <MarkdownRenderer content={message.content} isStreaming={isStreaming} />
      {isStreaming ? <StreamingIndicator /> : null}
    </View>
  );
}

export const MessageBubble = memo(MessageBubbleComponent);

