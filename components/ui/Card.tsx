import type { PropsWithChildren } from "react";
import { View } from "react-native";

import { Colors } from "@/constants/colors";

export function Card({ children }: PropsWithChildren) {
  return (
    <View
      style={{
        backgroundColor: Colors.surface,
        borderColor: Colors.border,
        borderRadius: 18,
        borderWidth: 1,
        padding: 16,
      }}
    >
      {children}
    </View>
  );
}

