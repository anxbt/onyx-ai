import { Pressable, Text } from "react-native";

import { Colors } from "@/constants/colors";

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}

export function Button({ label, onPress, variant = "primary", disabled }: ButtonProps) {
  const backgroundColor =
    variant === "primary" ? Colors.accent : variant === "danger" ? Colors.dangerMuted : Colors.surface;
  const borderColor = variant === "secondary" ? Colors.borderStrong : backgroundColor;

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={{
        backgroundColor: disabled ? Colors.surfaceElevated : backgroundColor,
        borderColor: disabled ? Colors.border : borderColor,
        borderRadius: 14,
        borderWidth: 1,
        minHeight: 48,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{
        color: disabled ? Colors.textTertiary : Colors.textPrimary,
        fontSize: 15,
        fontWeight: "700",
      }}>
        {label}
      </Text>
    </Pressable>
  );
}

