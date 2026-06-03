import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Colors } from "@/constants/colors";
import { Spacing } from "@/constants/spacing";
import { Typography } from "@/constants/typography";

interface ReasoningPanelProps {
  // The full reasoning trace. May be partial during streaming.
  reasoning?: string;
  // True while the model is still emitting reasoning or content tokens.
  // Controls the live "Thinking…" affordance and the elapsed-time counter.
  isStreaming?: boolean;
}

export function ReasoningPanel({ reasoning, isStreaming }: ReasoningPanelProps) {
  const [expanded, setExpanded] = useState(false);
  // Elapsed seconds since reasoning started, for the "Thinking for Xs" label.
  // Frozen once streaming completes so the badge keeps showing the final time.
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isStreaming) return;
    if (startRef.current === null) startRef.current = Date.now();
    const id = setInterval(() => {
      if (startRef.current !== null) {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [isStreaming]);

  // Nothing to show: no reasoning yet AND not streaming. The panel just
  // doesn't render. (When streaming with no reasoning yet, we still render
  // the "Thinking…" pulse so the user knows the model is working.)
  if (!reasoning && !isStreaming) return null;

  const hasReasoning = reasoning && reasoning.length > 0;
  const elapsedLabel = elapsed > 0 ? ` for ${elapsed}s` : "";

  return (
    <View
      style={{
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.borderHairline,
        borderRadius: Spacing.radius.button,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        marginBottom: Spacing.sm,
      }}
    >
      <Pressable
        onPress={() => hasReasoning && setExpanded((v) => !v)}
        hitSlop={4}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Ionicons
          name={
            isStreaming
              ? "bulb"
              : expanded
                ? "chevron-down"
                : "chevron-forward"
          }
          size={12}
          color={Colors.textTertiary}
        />
        <Text
          style={[
            Typography.uiLabel,
            { color: Colors.textTertiary, fontSize: 11 },
          ]}
        >
          {isStreaming
            ? `Thinking${elapsedLabel}…`
            : `Thought${elapsedLabel}`}
        </Text>
      </Pressable>

      {expanded && hasReasoning ? (
        <View
          style={{
            marginTop: Spacing.sm,
            paddingTop: Spacing.sm,
            borderTopWidth: 1,
            borderTopColor: Colors.borderHairline,
          }}
        >
          <Text
            // Raw text, NOT markdown-rendered. The trace is the model's
            // internal monologue and frequently contains delimiters and
            // markup that would render weirdly if treated as markdown.
            selectable
            style={{
              color: Colors.textTertiary,
              fontSize: 12,
              lineHeight: 18,
            }}
          >
            {reasoning}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
