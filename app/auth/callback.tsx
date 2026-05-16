import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors } from "@/constants/colors";
import { supabase } from "@/lib/supabase";

export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{ code?: string; error_description?: string }>();
  const insets = useSafeAreaInsets();
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function completeAuth() {
      if (!supabase) {
        setError("Supabase is not configured");
        return;
      }

      if (params.error_description) {
        setError(params.error_description);
        return;
      }

      const code = Array.isArray(params.code) ? params.code[0] : params.code;
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          setError(exchangeError.message);
          return;
        }

        if (mounted) {
          setIsComplete(true);
        }
        return;
      }

      const hashParams =
        typeof window !== "undefined" ? new URLSearchParams(window.location.hash.replace(/^#/, "")) : null;
      const accessToken = hashParams?.get("access_token");
      const refreshToken = hashParams?.get("refresh_token");
      const hashError = hashParams?.get("error_description");

      if (hashError) {
        setError(hashError);
        return;
      }

      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) {
          setError(sessionError.message);
          return;
        }

        if (mounted) {
          setIsComplete(true);
        }
        return;
      }

      if (mounted) {
        setError("Missing auth code");
      }
    }

    completeAuth().catch((nextError) => {
      setError(nextError instanceof Error ? nextError.message : "Could not complete sign-in");
    });

    return () => {
      mounted = false;
    };
  }, [params.code, params.error_description]);

  if (isComplete) {
    return <Redirect href="/" />;
  }

  if (!error) {
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
