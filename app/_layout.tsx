import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { useFonts } from "@expo-google-fonts/inter-tight";
import {
  InterTight_400Regular,
  InterTight_500Medium,
  InterTight_600SemiBold,
  InterTight_700Bold,
} from "@expo-google-fonts/inter-tight";
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
} from "@expo-google-fonts/ibm-plex-sans";
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
} from "@expo-google-fonts/jetbrains-mono";
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
  initialRouteName: "index",
};

SystemUI.setBackgroundColorAsync(Colors.background).catch(() => {});

export default function RootLayout() {
  const { session, isLoading } = useAuth();
  const segments = useSegments();

  const [fontsLoaded] = useFonts({
    InterTight_400Regular,
    InterTight_500Medium,
    InterTight_600SemiBold,
    InterTight_700Bold,
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
  });

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(Colors.background).catch(() => {});
  }, []);

  if (isLoading || !fontsLoaded) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: Colors.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={Colors.primary} />
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
            {session && inAuthGroup ? <Redirect href="/" /> : null}
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: {
                  backgroundColor: Colors.background,
                },
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="auth/sign-in" />
              <Stack.Screen name="auth/sign-up" />
              <Stack.Screen name="auth/callback" />
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
