import React, { useCallback, useState } from "react";
import { LayoutAnimation, Platform, Pressable, Text, UIManager, View } from "react-native";

import { Colors } from "@/constants/colors";
import { Typography } from "@/constants/typography";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface RoadmapNode {
  label: string;
  detail?: string;
  children?: RoadmapNode[];
}

interface RoadmapProps {
  data: string;
  onPromptSeed?: (text: string) => void;
}

function RoadmapNodeView({
  node,
  depth,
  onPromptSeed,
}: {
  node: RoadmapNode;
  depth: number;
  onPromptSeed?: (text: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;

  const toggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  }, []);

  const handleLongPress = useCallback(() => {
    onPromptSeed?.(node.label);
  }, [node.label, onPromptSeed]);

  const accentOpacity = Math.max(0.4, 1 - depth * 0.2);
  const indent = depth * 20;

  return (
    <View>
      <Pressable
        onPress={hasChildren ? toggle : handleLongPress}
        onLongPress={handleLongPress}
        style={{ paddingLeft: indent, paddingVertical: 4 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {hasChildren ? (
            <Text style={{ color: Colors.textTertiary, fontSize: 10, width: 12 }}>
              {expanded ? "▼" : "▶"}
            </Text>
          ) : (
            <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: Colors.primary, opacity: 0.5 }} />
          )}
          <Text
            style={[
              Typography.uiLabel,
              {
                color: Colors.textPrimary,
                fontWeight: hasChildren ? "600" : "400",
                opacity: accentOpacity,
              },
            ]}
          >
            {node.label}
          </Text>
        </View>
        {node.detail ? (
          <Text
            style={{
              color: Colors.textTertiary,
              fontSize: 11,
              marginLeft: indent + 18,
              marginTop: 1,
            }}
            numberOfLines={2}
          >
            {node.detail}
          </Text>
        ) : null}
      </Pressable>
      {hasChildren && expanded ? (
        <View style={{ borderLeftWidth: 1, borderLeftColor: Colors.border, marginLeft: indent + 5 }}>
          {node.children!.map((child, i) => (
            <RoadmapNodeView key={i} node={child} depth={depth + 1} onPromptSeed={onPromptSeed} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function Roadmap({ data, onPromptSeed }: RoadmapProps) {
  let root: RoadmapNode | null = null;

  try {
    root = JSON.parse(data);
  } catch {
    return (
      <View style={{ padding: 8 }}>
        <Text style={{ color: Colors.danger, fontSize: 12 }}>Invalid roadmap data</Text>
        <Text style={{ color: Colors.textTertiary, fontSize: 11 }}>{data.slice(0, 200)}</Text>
      </View>
    );
  }

  if (!root || !root.label) {
    return (
      <View style={{ padding: 8 }}>
        <Text style={{ color: Colors.textTertiary, fontSize: 12 }}>Empty roadmap</Text>
      </View>
    );
  }

  return (
    <View
      style={{
        backgroundColor: Colors.surfaceElevated,
        borderColor: Colors.borderHairline,
        borderRadius: 12,
        borderWidth: 1,
        padding: 12,
        gap: 2,
      }}
    >
      <Text style={[Typography.uiLabel, { color: Colors.textTertiary, marginBottom: 4 }]}>
        ROADMAP
      </Text>
      <RoadmapNodeView node={root} depth={0} onPromptSeed={onPromptSeed} />
      <Text style={[Typography.uiLabel, { color: Colors.textTertiary, marginTop: 8, fontSize: 9 }]}>
        Tap to expand · Long-press to ask about a topic
      </Text>
    </View>
  );
}
