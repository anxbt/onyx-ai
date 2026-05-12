import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/hooks/useAuth";

export default function SignInScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signInWithGoogle, isPreviewMode } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleGoogleSignIn() {
    try {
      setIsSubmitting(true);
      await signInWithGoogle();
      router.replace("/(tabs)");
    } catch (error) {
      Alert.alert("Sign-in failed", error instanceof Error ? error.message : "Could not sign in");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{
        flex: 1,
        backgroundColor: Colors.background,
        paddingHorizontal: 24,
        paddingTop: Math.max(insets.top, 24),
        paddingBottom: Math.max(insets.bottom, 24),
        justifyContent: "center",
      }}
    >
      <Card>
        <View style={{ gap: 14 }}>
          <Text style={{ color: Colors.textPrimary, fontSize: 28, fontWeight: "700" }}>Sign in</Text>
          <Text style={{ color: Colors.textSecondary, fontSize: 14 }}>
            {isPreviewMode
              ? "Supabase auth is not configured yet. Add valid env values before using Google sign-in."
              : "Continue with Google to access your private wallet, history, and chat data."}
          </Text>
          <Button
            label={isSubmitting ? "Connecting…" : "Continue with Google"}
            onPress={handleGoogleSignIn}
          />
        </View>
      </Card>
    </KeyboardAvoidingView>
  );
}
