import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";

import { Colors } from "@/constants/colors";

export function StreamingIndicator() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.2, duration: 500, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2, marginLeft: 1 }}>
      <Animated.View
        style={{
          width: 8,
          height: 16,
          backgroundColor: Colors.accent,
          borderRadius: 1,
          opacity,
        }}
      />
    </View>
  );
}
