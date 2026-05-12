import { Text, View } from "react-native";

import { Colors } from "@/constants/colors";

interface EmptyStateProps {
  title: string;
  description: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <View style={{ paddingVertical: 40, alignItems: "center", gap: 8 }}>
      <Text style={{ color: Colors.textPrimary, fontSize: 18, fontWeight: "700" }}>{title}</Text>
      <Text style={{ color: Colors.textSecondary, fontSize: 14, textAlign: "center", maxWidth: 280 }}>
        {description}
      </Text>
    </View>
  );
}

