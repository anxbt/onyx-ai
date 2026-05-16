import type { PropsWithChildren } from "react";
import { View } from "react-native";

import { Colors } from "@/constants/colors";
import { Spacing } from "@/constants/spacing";

export function Card({ children }: PropsWithChildren) {
  return (
    <View
      style={{
        backgroundColor: Colors.surface,
        borderColor: Colors.borderHairline,
        borderRadius: Spacing.radius.container,
        borderWidth: 1,
        padding: Spacing.lg,
      }}
    >
      {children}
    </View>
  );
}

