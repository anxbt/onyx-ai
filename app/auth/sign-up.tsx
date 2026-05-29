import { Ionicons } from "@expo/vector-icons";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/hooks/useAuth";

const SCREEN_COLORS = {
  background: "#0D0E10",
  surfaceLow: "#1D1B20",
  surface: "#211F24",
  surfaceHigh: "#2B292F",
  outline: "#272A2F",
  textPrimary: "#E6E0E9",
  textSecondary: "#CBC4D2",
  textMuted: "rgba(203, 196, 210, 0.6)",
  moss: "#99FFAA",
} as const;

const inputStyle = {
  height: 48,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: SCREEN_COLORS.outline,
  backgroundColor: SCREEN_COLORS.surfaceLow,
  color: SCREEN_COLORS.textPrimary,
  paddingHorizontal: 14,
  fontSize: 15,
} as const;

export default function SignUpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signUpWithEmail } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSignUp() {
    if (!email.trim() || !password) {
      Alert.alert("Missing info", "Please fill in email and password.");
      return;
    }
    if (password.length < 8) {
      Alert.alert("Weak password", "Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      Alert.alert("Passwords don't match", "Re-enter your password to confirm.");
      return;
    }
    try {
      setIsSubmitting(true);
      const result = await signUpWithEmail(email, password);
      if (result.needsEmailConfirmation) {
        Alert.alert(
          "Check your inbox",
          "We sent a confirmation link to your email. Click it, then sign in.",
          [{ text: "OK", onPress: () => router.replace("/auth/sign-in") }],
        );
      } else {
        router.replace("/");
      }
    } catch (error) {
      Alert.alert("Sign-up failed", error instanceof Error ? error.message : "Could not create account");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: SCREEN_COLORS.background }}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 24,
          paddingTop: Math.max(insets.top, 24) + 32,
          paddingBottom: Math.max(insets.bottom, 24),
          gap: 32,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignItems: "center", gap: 8 }}>
          <Text style={{ color: SCREEN_COLORS.textPrimary, fontSize: 28, fontWeight: "600" }}>Create account</Text>
          <Text style={{ color: SCREEN_COLORS.textSecondary, fontSize: 14, textAlign: "center" }}>
            Join Closed AI. Get free credits to try every model.
          </Text>
        </View>

        <View style={{ width: "100%", maxWidth: 380, alignSelf: "center", gap: 12 }}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={SCREEN_COLORS.textMuted}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            style={inputStyle}
          />
          <View style={{ position: "relative" }}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Password (min 8 characters)"
              placeholderTextColor={SCREEN_COLORS.textMuted}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="password-new"
              style={[inputStyle, { paddingRight: 44 }]}
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={8}
              style={{ position: "absolute", right: 12, top: 0, bottom: 0, justifyContent: "center" }}
            >
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={SCREEN_COLORS.textMuted}
              />
            </Pressable>
          </View>
          <View style={{ position: "relative" }}>
            <TextInput
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Confirm password"
              placeholderTextColor={SCREEN_COLORS.textMuted}
              secureTextEntry={!showConfirm}
              autoCapitalize="none"
              style={[inputStyle, { paddingRight: 44 }]}
            />
            <Pressable
              onPress={() => setShowConfirm((v) => !v)}
              hitSlop={8}
              style={{ position: "absolute", right: 12, top: 0, bottom: 0, justifyContent: "center" }}
            >
              <Ionicons
                name={showConfirm ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={SCREEN_COLORS.textMuted}
              />
            </Pressable>
          </View>

          <Pressable
            onPress={handleSignUp}
            disabled={isSubmitting}
            style={({ pressed }) => [
              {
                height: 50,
                borderRadius: 12,
                backgroundColor: SCREEN_COLORS.moss,
                alignItems: "center",
                justifyContent: "center",
                marginTop: 8,
              },
              pressed ? { transform: [{ scale: 0.98 }] } : null,
              isSubmitting ? { opacity: 0.7 } : null,
            ]}
          >
            <Text style={{ color: "#000000", fontSize: 15, fontWeight: "700" }}>
              {isSubmitting ? "Creating account..." : "Create account"}
            </Text>
          </Pressable>

          <Link href="/auth/sign-in" asChild>
            <Pressable>
              <Text
                style={{
                  color: SCREEN_COLORS.textSecondary,
                  fontSize: 13,
                  textAlign: "center",
                  marginTop: 12,
                }}
              >
                Already have an account? <Text style={{ color: SCREEN_COLORS.moss, fontWeight: "600" }}>Sign in</Text>
              </Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
