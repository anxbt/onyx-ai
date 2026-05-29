import { Redirect, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors } from "@/constants/colors";
import { useAuth } from "@/hooks/useAuth";

export default function AuthCallbackScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ code?: string }>();
  const { session, isLoading, authError } = useAuth();

  if (session) {
    return <Redirect href="/" />;
  }

  if (isLoading || params.code) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: Colors.background,
          alignItems: "center",
          justifyContent: "center",
          paddingTop: Math.max(insets.top, 24),
          paddingBottom: Math.max(insets.bottom, 24),
          paddingHorizontal: 24,
          gap: 12,
        }}
      >
        <ActivityIndicator color={Colors.accent} />
        <Text style={{ color: Colors.textSecondary }}>Completing sign-in…</Text>
      </View>
    );
  }

  const error = authError ?? "Could not complete sign-in";

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: Colors.background,
        alignItems: "center",
        justifyContent: "center",
        paddingTop: Math.max(insets.top, 24),
        paddingBottom: Math.max(insets.bottom, 24),
        paddingHorizontal: 24,
      }}
    >
      <Text style={{ color: Colors.textPrimary, fontSize: 18, fontWeight: "700", marginBottom: 8 }}>
        Sign-in error
      </Text>
      <Text style={{ color: Colors.textSecondary, textAlign: "center" }}>{error}</Text>
    </View>
  );
}
