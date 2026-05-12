import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors } from "@/constants/colors";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === "web" ? 0 : insets.bottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          height: 58 + bottomInset,
          paddingBottom: Math.max(bottomInset, 6),
          paddingTop: 6,
        },
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textTertiary,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Chat",
          tabBarIcon: ({ color, size }) => <Ionicons color={color} name="chatbubble-ellipses" size={size} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ color, size }) => <Ionicons color={color} name="time" size={size} />,
        }}
      />
    </Tabs>
  );
}
