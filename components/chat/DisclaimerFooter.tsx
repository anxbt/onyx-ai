import { Text, View } from "react-native";

import { Colors } from "@/constants/colors";
import { Typography } from "@/constants/typography";

export function DisclaimerFooter() {
  return (
    <View style={{ alignItems: "center", paddingTop: 4 }}>
      <Text style={[Typography.uiLabel, { color: Colors.textTertiary, opacity: 0.3, letterSpacing: 0.2, textTransform: "uppercase" }]}>
        Closed AI can make mistakes. Verify technical information.
      </Text>
    </View>
  );
}
