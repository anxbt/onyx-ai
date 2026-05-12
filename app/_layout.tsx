import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { Redirect, Stack, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { Colors } from "@/constants/colors";
import { useAuth } from "@/hooks/useAuth";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

SystemUI.setBackgroundColorAsync(Colors.background).catch(() => {});

export default function RootLayout() {
  const { session, isLoading } = useAuth();
  const segments = useSegments();

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(Colors.background).catch(() => {});
  }, []);

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: Colors.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  const inAuthGroup = segments[0] === "auth";

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <ThemeProvider value={DarkTheme}>
            <StatusBar style="light" />
            {!session && !inAuthGroup ? <Redirect href="/auth/sign-in" /> : null}
            {session && inAuthGroup ? <Redirect href="/(tabs)" /> : null}
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: {
                  backgroundColor: Colors.background,
                },
              }}
            >
              <Stack.Screen name="auth/sign-in" />
              <Stack.Screen name="auth/sign-up" />
              <Stack.Screen name="auth/callback" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="memory" />
              <Stack.Screen name="credits" />
              <Stack.Screen name="settings" />
              <Stack.Screen name="+not-found" />
            </Stack>
          </ThemeProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
