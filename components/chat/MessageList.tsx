import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  View,
} from "react-native";

import { MessageBubble } from "@/components/chat/MessageBubble";
import { Colors } from "@/constants/colors";
import { Spacing } from "@/constants/spacing";
import type { Message } from "@/types";

// Within this many px of the bottom = "at bottom"; keep auto-scrolling.
const STICK_TO_BOTTOM_THRESHOLD_PX = 80;
// Scrolled up more than this = show the jump-to-bottom arrow.
const SHOW_FAB_THRESHOLD_PX = 220;

interface MessageListProps {
  messages: Message[];
  streamingContent?: string;
  streamingReasoning?: string;
  activeConversationId: string;
  onEdit?: (messageId: string, newContent: string) => void;
  onRegenerate?: () => void;
  canMutate?: boolean;
}

export function MessageList({
  messages,
  streamingContent,
  streamingReasoning,
  activeConversationId,
  onEdit,
  onRegenerate,
  canMutate,
}: MessageListProps) {
  const scrollRef = useRef<ScrollView>(null);
  // True when the user has manually scrolled away from the bottom.
  const userScrolledUpRef = useRef(false);
  const [showFab, setShowFab] = useState(false);

  let lastAssistantId: string | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      lastAssistantId = messages[i].id;
      break;
    }
  }

  const scrollToEnd = (animated = true) => {
    scrollRef.current?.scrollToEnd({ animated });
  };

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom =
      contentSize.height - (contentOffset.y + layoutMeasurement.height);
    userScrolledUpRef.current = distanceFromBottom > STICK_TO_BOTTOM_THRESHOLD_PX;
    const shouldShow = distanceFromBottom > SHOW_FAB_THRESHOLD_PX;
    setShowFab((prev) => (prev !== shouldShow ? shouldShow : prev));
  };

  // Land at the bottom when a chat opens / switches.
  useEffect(() => {
    userScrolledUpRef.current = false;
    setShowFab(false);
    const t = setTimeout(() => scrollToEnd(false), 60);
    return () => clearTimeout(t);
  }, [activeConversationId]);

  // Auto-scroll on new message / streaming tick, unless the user scrolled up.
  useEffect(() => {
    if (!userScrolledUpRef.current) scrollToEnd();
  }, [messages.length, streamingContent]);

  const jumpToBottom = () => {
    userScrolledUpRef.current = false;
    setShowFab(false);
    scrollToEnd(true);
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={scrollRef}
        onScroll={handleScroll}
        onContentSizeChange={() => {
          if (!userScrolledUpRef.current) scrollToEnd();
        }}
        scrollEventThrottle={16}
        contentContainerStyle={{
          gap: Spacing.sectionGap,
          paddingBottom: Spacing.lg,
        }}
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
        {streamingContent || streamingReasoning ? (
          <View>
            <MessageBubble
              isStreaming
              streamingReasoning={streamingReasoning}
              message={{
                id: "streaming",
                conversationId: activeConversationId,
                role: "assistant",
                content: streamingContent ?? "",
                createdAt: new Date().toISOString(),
              }}
            />
          </View>
        ) : null}
      </ScrollView>

      {showFab ? (
        <Pressable
          onPress={jumpToBottom}
          hitSlop={8}
          style={{
            position: "absolute",
            bottom: Spacing.md,
            alignSelf: "center",
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: Colors.surfaceElevated,
            borderWidth: 1,
            borderColor: Colors.borderHairline,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="arrow-down" size={20} color={Colors.textPrimary} />
        </Pressable>
      ) : null}
    </View>
  );
}
