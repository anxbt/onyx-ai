import { Ionicons } from "@expo/vector-icons";
import React, { memo, useMemo, useState } from "react";
import { Image, Pressable, Text, TextInput, View } from "react-native";

import { CitationCards } from "@/components/chat/CitationCard";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { StreamingIndicator } from "@/components/chat/StreamingIndicator";
import { SuggestionChips } from "@/components/chat/SuggestionChips";
import { Colors } from "@/constants/colors";
import { Spacing } from "@/constants/spacing";
import { Typography } from "@/constants/typography";
import { extractResponseType } from "@/lib/markdown";
import { getModelConfig } from "@/lib/models";
import { detectUncertainty } from "@/lib/uncertainty";
import type { Message } from "@/types";

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  onSuggestionSelect?: (text: string) => void;
  onEdit?: (messageId: string, newContent: string) => void;
  onRegenerate?: () => void;
  isLastAssistant?: boolean;
  canMutate?: boolean;
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

function MessageBubbleComponent({
  message,
  isStreaming,
  onSuggestionSelect,
  onEdit,
  onRegenerate,
  isLastAssistant,
  canMutate,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const model = message.model ? getModelConfig(message.model) : null;
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

  // Output harness: extract response-type marker and produce clean body
  const { type: responseType, cleanContent } = useMemo(
    () => (isUser ? { type: null, cleanContent: message.content } : extractResponseType(message.content)),
    [message.content, isUser],
  );

  const suggestions = useMemo(() => {
    if (isUser || isStreaming) return [];
    return extractSuggestions(cleanContent);
  }, [cleanContent, isUser, isStreaming]);

  // Output harness: surface uncertainty when no sources are available
  const uncertainty = useMemo(() => {
    if (isUser || isStreaming) return { matched: false };
    if (message.sources?.length) return { matched: false };
    return detectUncertainty(cleanContent);
  }, [cleanContent, isUser, isStreaming, message.sources]);

  if (isEditing && isUser) {
    return (
      <View
        style={{
          alignSelf: "flex-end",
          maxWidth: "84%",
          gap: Spacing.xs,
          backgroundColor: Colors.userBubble,
          borderRadius: Spacing.radius.container,
          paddingHorizontal: 10,
          paddingVertical: 6,
        }}
      >
        <TextInput
          value={draft}
          onChangeText={setDraft}
          multiline
          autoFocus
          style={[
            Typography.bodyProse,
            { color: Colors.textPrimary, minWidth: 220, paddingVertical: 4 },
          ]}
        />
        <View style={{ flexDirection: "row", gap: Spacing.sm, justifyContent: "flex-end" }}>
          <Pressable
            onPress={() => {
              setDraft(message.content);
              setIsEditing(false);
            }}
            hitSlop={8}
          >
            <Text style={[Typography.uiLabel, { color: Colors.textTertiary }]}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              const next = draft.trim();
              if (!next || next === message.content) {
                setIsEditing(false);
                return;
              }
              setIsEditing(false);
              onEdit?.(message.id, next);
            }}
            hitSlop={8}
          >
            <Text style={[Typography.uiLabel, { color: Colors.primary, fontWeight: "600" }]}>
              Save & Submit
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

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

        {/* Output harness: response-type badge */}
        {!isUser && responseType ? (
          <Text
            style={[
              Typography.uiLabel,
              {
                color: Colors.textTertiary,
                fontSize: 10,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                opacity: 0.5,
                marginBottom: 4,
              },
            ]}
          >
            {responseType}
          </Text>
        ) : null}

        {/* Output harness: uncertainty banner */}
        {!isUser && !isStreaming && uncertainty.matched ? (
          <View
            style={{
              backgroundColor: Colors.accentSubtle,
              borderLeftWidth: 3,
              borderLeftColor: Colors.warning,
              paddingHorizontal: Spacing.md,
              paddingVertical: Spacing.sm,
              borderRadius: 4,
              marginBottom: Spacing.sm,
            }}
          >
            <Text style={[Typography.uiLabel, { color: Colors.warning, fontWeight: "700", fontSize: 11 }]}>
              No live data
            </Text>
            <Text style={[Typography.uiLabel, { color: Colors.textSecondary, fontSize: 11, marginTop: 2 }]}>
              The model couldn't verify this with live data. Toggle the web search icon to get current info.
            </Text>
          </View>
        ) : null}

        <MarkdownRenderer content={(cleanContent || "").trim()} isStreaming={isStreaming} sources={message.sources} />
        {isStreaming ? <StreamingIndicator /> : null}

        {/* Citation cards */}
        {!isUser && !isStreaming && message.sources?.length ? (
          <CitationCards sources={message.sources} />
        ) : null}

        {suggestions.length > 0 && onSuggestionSelect ? (
          <SuggestionChips suggestions={suggestions} onSelect={onSuggestionSelect} />
        ) : null}
        
        {/* Footer: model name, timestamp, and regenerate */}
        {!isUser && (model || message.createdAt || isLastAssistant) ? (
          <View style={{ flexDirection: "row", marginTop: Spacing.md, gap: 8, alignItems: "center" }}>
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
            {isLastAssistant && !isStreaming && onRegenerate && canMutate ? (
              <Pressable
                onPress={onRegenerate}
                hitSlop={8}
                style={{ flexDirection: "row", alignItems: "center", gap: 4, marginLeft: 4 }}
              >
                <Ionicons name="refresh" size={12} color={Colors.textTertiary} />
                <Text style={[Typography.uiLabel, { color: Colors.textTertiary }]}>Regenerate</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        
        {/* User message timestamp + edit */}
        {isUser && !isStreaming ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              alignSelf: "flex-end",
              marginTop: 0,
            }}
          >
            {onEdit && canMutate ? (
              <Pressable
                onPress={() => {
                  setDraft(message.content);
                  setIsEditing(true);
                }}
                hitSlop={8}
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                <Ionicons name="pencil" size={11} color={Colors.textTertiary} />
                <Text style={[Typography.uiLabel, { color: Colors.textTertiary }]}>Edit</Text>
              </Pressable>
            ) : null}
            {message.createdAt ? (
              <Text style={[Typography.uiLabel, { color: Colors.textTertiary }]}>
                {formatTime(message.createdAt)}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export const MessageBubble = memo(MessageBubbleComponent);
