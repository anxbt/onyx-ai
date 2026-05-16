import React, { memo, useMemo } from "react";
import { Image, Text, View } from "react-native";

import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { StreamingIndicator } from "@/components/chat/StreamingIndicator";
import { SuggestionChips } from "@/components/chat/SuggestionChips";
import { Colors } from "@/constants/colors";
import { Spacing } from "@/constants/spacing";
import { Typography } from "@/constants/typography";
import { getModelConfig } from "@/lib/models";
import type { Message } from "@/types";

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  onSuggestionSelect?: (text: string) => void;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function extractSuggestions(content: string): string[] {
  const match = content.match(/\[Suggestions\]\s*\n([\s\S]+)$/i);
  if (!match) return [];
  return match[1].split("\n").map((s) => s.replace(/^[-*]\s*/, "").trim()).filter(Boolean).slice(0, 4);
}

function MessageBubbleComponent({ message, isStreaming, onSuggestionSelect }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const model = message.model ? getModelConfig(message.model) : null;

  const suggestions = useMemo(() => {
    if (isUser || isStreaming) return [];
    return extractSuggestions(message.content);
  }, [message.content, isUser, isStreaming]);

  return (
    <View
      style={{
        alignSelf: isUser ? "flex-end" : "stretch",
        maxWidth: isUser ? "84%" : "100%",
        gap: Spacing.xs,
      }}
    >
         <View
           style={{
             backgroundColor: isUser ? Colors.userBubble : "transparent",
             borderRadius: isUser ? Spacing.radius.container : 0,
            paddingHorizontal: isUser ? 10 : 0,
            paddingVertical: isUser ? 6 : 0,
            gap: isUser ? Spacing.xs : Spacing.xs,
           }}
         >
        {message.attachments?.map((att) =>
          att.type === "image" && att.remoteUrl ? (
            <Image
              key={att.id}
              source={{ uri: att.remoteUrl }}
              style={{
                width: "100%",
                aspectRatio: 4 / 3,
                borderRadius: Spacing.radius.button,
                backgroundColor: Colors.surfaceElevated,
                marginBottom: Spacing.md,
              }}
              resizeMode="cover"
            />
          ) : null
        )}
        <MarkdownRenderer content={(message.content || "").trim()} isStreaming={isStreaming} />
        {isStreaming ? <StreamingIndicator /> : null}
        {suggestions.length > 0 && onSuggestionSelect ? (
          <SuggestionChips suggestions={suggestions} onSelect={onSuggestionSelect} />
        ) : null}
        
        {/* Footer: model name and timestamp */}
        {!isUser && (model || message.createdAt) ? (
          <View style={{ flexDirection: "row", marginTop: Spacing.md, gap: 8 }}>
            {model ? (
              <Text style={[Typography.uiLabel, { color: Colors.textTertiary }]}>
                {model.displayName}
              </Text>
            ) : null}
            {message.createdAt && !isStreaming ? (
              <Text style={[Typography.uiLabel, { color: Colors.textTertiary }]}>
                · {formatTime(message.createdAt)}
              </Text>
            ) : null}
          </View>
        ) : null}
        
        {/* User message timestamp */}
        {isUser && message.createdAt && !isStreaming ? (
          <Text
            style={[
              Typography.uiLabel,
              {
                color: Colors.textTertiary,
                marginTop: 0,
                alignSelf: "flex-end",
              },
            ]}
          >
            {formatTime(message.createdAt)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export const MessageBubble = memo(MessageBubbleComponent);
