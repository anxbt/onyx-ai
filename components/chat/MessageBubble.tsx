import React, { memo, useMemo, useState } from "react";
import { Image, Text, View } from "react-native";

import { ArtifactTabs } from "@/components/chat/ArtifactTabs";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { StreamingIndicator } from "@/components/chat/StreamingIndicator";
import { SuggestionChips } from "@/components/chat/SuggestionChips";
import { Colors } from "@/constants/colors";
import { Spacing } from "@/constants/spacing";
import { Typography } from "@/constants/typography";
import { getModelConfig } from "@/lib/models";
import type { Message } from "@/types";

type ArtifactTab = "text" | "flowchart" | "code" | "pdf";

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  onSuggestionSelect?: (text: string) => void;
}

function detectArtifactTypes(content: string): ArtifactTab[] {
  const types: ArtifactTab[] = ["text"];
  if (/```flowchart/.test(content)) types.push("flowchart");
  if (/```(?!flowchart|roadmap|chart|html)[a-z]*\n/i.test(content) || /```$/.test(content)) types.push("code");
  if (/```html[\s\S]*?data-type\s*=\s*"pdf"/i.test(content)) types.push("pdf");
  return types;
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

  const artifactTypes = useMemo(() => {
    if (isUser || isStreaming) return ["text"] as ArtifactTab[];
    return detectArtifactTypes(message.content);
  }, [message.content, isUser, isStreaming]);

  const [activeTab, setActiveTab] = useState<ArtifactTab>(artifactTypes[0]);

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
          backgroundColor: isUser ? Colors.userBubble : Colors.assistantSurface,
          borderColor: Colors.borderHairline,
          borderRadius: Spacing.radius.container,
          borderWidth: isUser ? 0 : 0,
          paddingHorizontal: 12,
          paddingVertical: 6,
          gap: Spacing.xl,
        }}
      >
        {!isUser && model ? (
          <Text style={[Typography.uiLabel, { color: Colors.textTertiary }]}>{model.displayName}</Text>
        ) : null}
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
              }}
              resizeMode="cover"
            />
          ) : null,
        )}
        {!isUser && artifactTypes.length > 1 ? (
          <ArtifactTabs activeTab={activeTab} availableTabs={artifactTypes} onTabChange={setActiveTab} />
        ) : null}
        <MarkdownRenderer content={message.content} isStreaming={isStreaming} />
        {isStreaming ? <StreamingIndicator /> : null}
        {suggestions.length > 0 && onSuggestionSelect ? (
          <SuggestionChips suggestions={suggestions} onSelect={onSuggestionSelect} />
        ) : null}
      </View>
      {!isStreaming && message.createdAt ? (
        <Text
          style={[
            Typography.uiLabel,
            {
              color: Colors.textTertiary,
              opacity: 0.4,
              alignSelf: isUser ? "flex-end" : "flex-start",
              paddingHorizontal: 4,
            },
          ]}
        >
          {formatTime(message.createdAt)}
        </Text>
      ) : null}
    </View>
  );
}

export const MessageBubble = memo(MessageBubbleComponent);

