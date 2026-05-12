import { Text, View } from "react-native";

import { Colors } from "@/constants/colors";

export function MemoryIndicator() {
  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: Colors.accentSubtle,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}
    >
      <Text style={{ color: Colors.accent, fontSize: 11, fontWeight: "700" }}>FROM MEMORY</Text>
    </View>
  );
}

