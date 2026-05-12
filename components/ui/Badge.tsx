import { Text, View } from "react-native";

import { Colors } from "@/constants/colors";

interface BadgeProps {
  label: string;
}

export function Badge({ label }: BadgeProps) {
  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: Colors.accentSubtle,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 5,
      }}
    >
      <Text style={{ color: Colors.accent, fontSize: 11, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

