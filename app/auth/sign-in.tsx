import { Ionicons } from "@expo/vector-icons";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/hooks/useAuth";

const SCREEN_COLORS = {
  background: "#0D0E10",
  surfaceLow: "#1D1B20",
  surface: "#211F24",
  surfaceHigh: "#2B292F",
  surfaceHighest: "#36343A",
  outline: "#272A2F",
  textPrimary: "#E6E0E9",
  textSecondary: "#CBC4D2",
  textMuted: "rgba(203, 196, 210, 0.6)",
  moss: "#99FFAA",
  mossSoft: "rgba(153, 255, 170, 0.3)",
} as const;

const LEDGER_ROWS = [
  { name: "Yi Lightning", price: "$0.10", tag: "Cheapest", highlight: true },
  { name: "DeepSeek V2.5", price: "$0.14" },
  { name: "Llama 3.1 405B", price: "$1.20" },
  { name: "GPT-4o", price: "$5.00" },
  { name: "Claude 3.5 Sonnet", price: "$3.00" },
];

export default function SignInScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signInWithGoogle, signInWithEmail } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  async function handleGoogleSignIn() {
    try {
      setIsSubmitting(true);
      await signInWithGoogle();
      router.replace("/");
    } catch (error) {
      Alert.alert("Sign-in failed", error instanceof Error ? error.message : "Could not sign in");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleEmailSignIn() {
    if (!email.trim() || !password) {
      Alert.alert("Missing info", "Please enter both email and password.");
      return;
    }
    try {
      setIsSubmitting(true);
      await signInWithEmail(email, password);
      router.replace("/");
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
        backgroundColor: SCREEN_COLORS.background,
      }}
    >
      <View pointerEvents="none" style={{ position: "absolute", inset: 0 }}>
        <View
          style={{
            position: "absolute",
            top: "10%",
            left: "5%",
            width: 320,
            height: 320,
            borderRadius: 160,
            backgroundColor: SCREEN_COLORS.moss,
            opacity: 0.08,
          }}
        />
        <View
          style={{
            position: "absolute",
            bottom: "10%",
            right: "5%",
            width: 260,
            height: 260,
            borderRadius: 130,
            backgroundColor: SCREEN_COLORS.surfaceHigh,
            opacity: 0.2,
          }}
        />
      </View>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 24,
          paddingTop: Math.max(insets.top, 24),
          paddingBottom: Math.max(insets.bottom, 24),
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flex: 1, justifyContent: "space-between" }}>
          <View style={{ alignItems: "center" }}>
            <View style={{ alignItems: "center", gap: 10, paddingVertical: 24 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 4,
                    backgroundColor: SCREEN_COLORS.moss,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: "#000000", fontSize: 14, fontWeight: "700" }}>K</Text>
                </View>
                <Text
                  style={{
                    color: SCREEN_COLORS.textPrimary,
                    fontSize: 14,
                    fontWeight: "600",
                    letterSpacing: 1.2,
                    textTransform: "uppercase",
                  }}
                >
                  kestrel
                </Text>
              </View>
            </View>
            <View style={{ alignItems: "center", marginTop: 12, marginBottom: 32 }}>
              <Text
                style={{
                  color: SCREEN_COLORS.textPrimary,
                  fontSize: 32,
                  fontWeight: "500",
                  lineHeight: 38,
                  textAlign: "center",
                }}
              >
                Seven AI models.{"\n"}
                <Text style={{ color: SCREEN_COLORS.textSecondary }}>One chat.{"\n"}</Text>
                <Text style={{ color: SCREEN_COLORS.moss }}>10x cheaper.</Text>
              </Text>
            </View>
            <View style={{ width: "100%", maxWidth: 380, gap: 24 }}>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: SCREEN_COLORS.outline,
                  borderRadius: 12,
                  overflow: "hidden",
                  backgroundColor: SCREEN_COLORS.surfaceLow,
                }}
              >
                <View
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderBottomWidth: 1,
                    borderColor: SCREEN_COLORS.outline,
                    backgroundColor: SCREEN_COLORS.surface,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <Text
                    style={{
                      color: SCREEN_COLORS.textSecondary,
                      fontSize: 10,
                      letterSpacing: 1.6,
                      textTransform: "uppercase",
                    }}
                  >
                    Model Comparison Ledger
                  </Text>
                  <Text
                    style={{
                      color: SCREEN_COLORS.textSecondary,
                      fontSize: 10,
                      letterSpacing: 1.6,
                      textTransform: "uppercase",
                    }}
                  >
                    Cost / 1M Tokens
                  </Text>
                </View>
                {LEDGER_ROWS.map((row, index) => {
                  const isLast = index === LEDGER_ROWS.length - 1;
                  return (
                    <View
                      key={row.name}
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        borderBottomWidth: isLast ? 0 : 1,
                        borderColor: SCREEN_COLORS.outline,
                        backgroundColor: row.highlight ? "rgba(43, 41, 47, 0.3)" : "transparent",
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text
                          style={{
                            color: row.highlight ? SCREEN_COLORS.moss : SCREEN_COLORS.textSecondary,
                            fontSize: 14,
                          }}
                        >
                          {row.name}
                        </Text>
                        {row.tag ? (
                          <View
                            style={{
                              borderWidth: 1,
                              borderColor: SCREEN_COLORS.mossSoft,
                              borderRadius: 999,
                              paddingHorizontal: 6,
                              paddingVertical: 2,
                            }}
                          >
                            <Text
                              style={{
                                color: SCREEN_COLORS.moss,
                                fontSize: 9,
                                letterSpacing: 1,
                                textTransform: "uppercase",
                              }}
                            >
                              {row.tag}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text
                        style={{
                          color: row.highlight ? SCREEN_COLORS.moss : SCREEN_COLORS.textPrimary,
                          fontSize: 14,
                        }}
                      >
                        {row.price}
                      </Text>
                    </View>
                  );
                })}
                <View
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderTopWidth: 1,
                    borderColor: SCREEN_COLORS.outline,
                    backgroundColor: "rgba(15, 13, 19, 0.5)",
                  }}
                >
                  <Text
                    style={{
                      color: SCREEN_COLORS.textMuted,
                      fontSize: 11,
                      fontStyle: "italic",
                      textAlign: "center",
                    }}
                  >
                    * Prices based on public API benchmarks
                  </Text>
                </View>
              </View>
              {/* Email/password form */}
              <View style={{ gap: 10 }}>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email"
                  placeholderTextColor={SCREEN_COLORS.textMuted}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  style={{
                    height: 48,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: SCREEN_COLORS.outline,
                    backgroundColor: SCREEN_COLORS.surfaceLow,
                    color: SCREEN_COLORS.textPrimary,
                    paddingHorizontal: 14,
                    fontSize: 15,
                  }}
                />
                <View style={{ position: "relative" }}>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Password"
                    placeholderTextColor={SCREEN_COLORS.textMuted}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoComplete="password"
                    style={{
                      height: 48,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: SCREEN_COLORS.outline,
                      backgroundColor: SCREEN_COLORS.surfaceLow,
                      color: SCREEN_COLORS.textPrimary,
                      paddingHorizontal: 14,
                      paddingRight: 44,
                      fontSize: 15,
                    }}
                  />
                  <Pressable
                    onPress={() => setShowPassword((v) => !v)}
                    hitSlop={8}
                    style={{
                      position: "absolute",
                      right: 12,
                      top: 0,
                      bottom: 0,
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={20}
                      color={SCREEN_COLORS.textMuted}
                    />
                  </Pressable>
                </View>
                <Pressable
                  onPress={handleEmailSignIn}
                  disabled={isSubmitting}
                  style={({ pressed }) => [
                    {
                      height: 48,
                      borderRadius: 12,
                      backgroundColor: SCREEN_COLORS.surfaceHigh,
                      borderWidth: 1,
                      borderColor: SCREEN_COLORS.outline,
                      alignItems: "center",
                      justifyContent: "center",
                    },
                    pressed ? { transform: [{ scale: 0.98 }] } : null,
                    isSubmitting ? { opacity: 0.7 } : null,
                  ]}
                >
                  <Text style={{ color: SCREEN_COLORS.textPrimary, fontSize: 14, fontWeight: "600" }}>
                    {isSubmitting ? "Signing in..." : "Sign in with Email"}
                  </Text>
                </Pressable>
                <Link href="/auth/sign-up" asChild>
                  <Pressable>
                    <Text
                      style={{
                        color: SCREEN_COLORS.textSecondary,
                        fontSize: 12,
                        textAlign: "center",
                        marginTop: 4,
                      }}
                    >
                      No account? <Text style={{ color: SCREEN_COLORS.moss, fontWeight: "600" }}>Create one</Text>
                    </Text>
                  </Pressable>
                </Link>
              </View>

              {/* Divider */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: SCREEN_COLORS.outline }} />
                <Text style={{ color: SCREEN_COLORS.textMuted, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase" }}>
                  Or
                </Text>
                <View style={{ flex: 1, height: 1, backgroundColor: SCREEN_COLORS.outline }} />
              </View>

              <Pressable
                onPress={handleGoogleSignIn}
                disabled={isSubmitting}
                style={({ pressed }) => [
                  {
                    height: 50,
                    borderRadius: 12,
                    backgroundColor: SCREEN_COLORS.moss,
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "row",
                  },
                  pressed ? { transform: [{ scale: 0.98 }] } : null,
                  isSubmitting ? { opacity: 0.7 } : null,
                ]}
              >
                <Text style={{ color: "#000000", fontSize: 15, fontWeight: "700" }}>
                  {isSubmitting ? "Connecting..." : "Login with Google"}
                </Text>
              </Pressable>
            </View>
          </View>
          <View
            style={{
              marginTop: 32,
              paddingTop: 20,
              borderTopWidth: 1,
              borderColor: SCREEN_COLORS.outline,
              alignItems: "center",
              gap: 12,
            }}
          >
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 24, justifyContent: "center" }}>
              <Text
                style={{
                  color: "rgba(203, 196, 210, 0.4)",
                  fontSize: 11,
                  letterSpacing: 2.4,
                  textTransform: "uppercase",
                }}
              >
                Latency: 24ms
              </Text>
              <Text
                style={{
                  color: "rgba(203, 196, 210, 0.4)",
                  fontSize: 11,
                  letterSpacing: 2.4,
                  textTransform: "uppercase",
                }}
              >
                Uptime: 99.9%
              </Text>
              <Text
                style={{
                  color: "rgba(203, 196, 210, 0.4)",
                  fontSize: 11,
                  letterSpacing: 2.4,
                  textTransform: "uppercase",
                }}
              >
                v2.0.4-LTS
              </Text>
            </View>
            <View style={{ width: 64, height: 1, backgroundColor: SCREEN_COLORS.outline }} />
            <View style={{ width: "100%", maxWidth: 420, paddingHorizontal: 12 }}>
              <Image
                accessibilityLabel="AI Data Visualization"
                source={{
                  uri: "https://lh3.googleusercontent.com/aida-public/AB6AXuCz4rIEn0FEwV72dOqlXiEw2DNwjOet2iX2ReG73eIhM3QhFkEVolkIgtAKVfMHjvbjac5UOhk0N1FynRzZxt_uJOxTGdcE022UZDnTg5yvZk1AkBGOZi5YaWaCWk0aLXKsdisRfDroj4o7P_imzwXwGs2pp6vOnXkjl9VGs-u3bQ-MpjyGhaumr7SA-xfyvNGV2STfzI5ikjql6IXdDC9vfA7XeKYkc73al-nschaRmGJMyXu9V2DVojgk0XhS0x7VfSKbJGNpfts",
                }}
                style={{
                  width: "100%",
                  height: 48,
                  borderRadius: 999,
                  opacity: 0.1,
                }}
                resizeMode="cover"
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
