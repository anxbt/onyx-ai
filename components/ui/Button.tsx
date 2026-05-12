import { Pressable, Text } from "react-native";

import { Colors } from "@/constants/colors";

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "danger";
}

export function Button({ label, onPress, variant = "primary" }: ButtonProps) {
  const backgroundColor =
    variant === "primary" ? Colors.accent : variant === "danger" ? Colors.dangerMuted : Colors.surface;
  const borderColor = variant === "secondary" ? Colors.borderStrong : backgroundColor;

  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor,
        borderColor,
        borderRadius: 14,
        borderWidth: 1,
        minHeight: 48,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
      }}
    >
      <Text style={{ color: Colors.textPrimary, fontSize: 15, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

