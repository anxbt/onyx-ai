import { Text } from "react-native";

import { Colors } from "@/constants/colors";

export function StreamingIndicator() {
  return <Text style={{ color: Colors.accent, fontSize: 12, fontWeight: "700" }}>streaming…</Text>;
}

