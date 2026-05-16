import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { Colors } from "@/constants/colors";
import { Typography } from "@/constants/typography";

export function StreamingIndicator() {
  const [dots, setDots] = useState(1);

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((d) => (d % 3) + 1);
    }, 400);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
      <Text style={[Typography.uiLabel, { color: Colors.accent }]}>
        {"•".repeat(dots)}
      </Text>
    </View>
  );
}
