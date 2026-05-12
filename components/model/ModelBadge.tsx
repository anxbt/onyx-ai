import { Pressable, Text, View } from "react-native";

import { Colors } from "@/constants/colors";
import { getModelConfig } from "@/lib/models";

interface ModelBadgeProps {
  modelId: string;
  onPress: () => void;
}

export function ModelBadge({ modelId, onPress }: ModelBadgeProps) {
  const model = getModelConfig(modelId);

  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: Colors.surface,
        borderColor: Colors.border,
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}
    >
      <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: Colors.accent }} />
      <Text style={{ color: Colors.textPrimary, fontWeight: "700" }}>{model.displayName}</Text>
      <Text style={{ color: Colors.textTertiary }}>⌄</Text>
    </Pressable>
  );
}

