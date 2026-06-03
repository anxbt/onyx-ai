import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Updates from "expo-updates";
import { useState } from "react";
import { Alert, Image, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors } from "@/constants/colors";
import { Spacing } from "@/constants/spacing";
import { Typography } from "@/constants/typography";
import { useAuth } from "@/hooks/useAuth";
import { getModelConfig } from "@/lib/models";

function SectionLabel({ children }: { children: string }) {
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: Colors.borderHairline, paddingBottom: Spacing.sm }}>
      <Text
        style={[
          Typography.uiLabel,
          {
            color: Colors.textTertiary,
            fontSize: 10,
            letterSpacing: 0.15,
          },
        ]}
      >
        {children}
      </Text>
    </View>
  );
}

function SettingsRow({
  label,
  detail,
  onPress,
  destructive,
}: {
  label: string;
  detail?: string;
  onPress?: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: Spacing.md,
      }}
    >
      <Text style={[Typography.bodyProseBold, { color: destructive ? Colors.danger : Colors.textPrimary }]}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
        {detail ? (
          <Text style={[Typography.uiLabel, { color: Colors.textSecondary }]}>{detail}</Text>
        ) : null}
        <Ionicons
          color={destructive ? Colors.danger : Colors.textTertiary}
          name={destructive ? "log-out-outline" : "chevron-forward"}
          size={16}
        />
      </View>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signOut, session, profile } = useAuth();
  const preferredModel = getModelConfig(profile?.preferredModel ?? "");
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);

  // Show the first 8 chars of the bundle ID so the user can verify which JS
  // they're running. Useful for debugging OTA delivery. Empty in dev / Expo Go.
  const bundleLabel = Updates.updateId
    ? `${Updates.updateId.slice(0, 8)}…`
    : Updates.isEnabled
      ? "embedded"
      : "dev";

  const handleCheckUpdates = async () => {
    if (updateBusy) return;
    if (!Updates.isEnabled) {
      Alert.alert("Not available", "OTA updates are only active in production builds.");
      return;
    }
    setUpdateBusy(true);
    setUpdateStatus("Checking…");
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        setUpdateStatus("Already on the latest version.");
        setUpdateBusy(false);
        return;
      }
      setUpdateStatus("Downloading…");
      await Updates.fetchUpdateAsync();
      setUpdateStatus("Reloading…");
      // Reload immediately into the new bundle. The user sees a brief splash
      // flash and then the app comes back with the updated JS active.
      await Updates.reloadAsync();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setUpdateStatus(`Update check failed: ${message}`);
      setUpdateBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: Spacing.md,
          paddingHorizontal: Spacing.mobileMargin,
          paddingTop: insets.top + Spacing.md,
          paddingBottom: Spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: Colors.borderHairline,
        }}
      >
        <Pressable onPress={() => router.back()}>
          <Ionicons color={Colors.textSecondary} name="arrow-back" size={22} />
        </Pressable>
        <Text style={[Typography.displayLg, { color: Colors.textPrimary }]}>Settings</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: Spacing.mobileMargin,
          paddingBottom: Math.max(insets.bottom, Spacing.xxl),
          gap: Spacing.xl,
        }}
      >
        {/* Account */}
        <View style={{ gap: Spacing.md }}>
          <SectionLabel>ACCOUNT</SectionLabel>
          <View
            style={{
              backgroundColor: Colors.surface,
              borderWidth: 1,
              borderColor: Colors.borderHairline,
              borderRadius: Spacing.radius.container,
              padding: Spacing.lg,
              flexDirection: "row",
              alignItems: "center",
              gap: Spacing.md,
            }}
          >
            {session?.user?.avatarUrl ? (
              <Image
                source={{ uri: session.user.avatarUrl }}
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: Colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: Colors.borderHairline,
                }}
              />
            ) : (
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: Colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: Colors.borderHairline,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons color={Colors.textSecondary} name="person" size={26} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[Typography.bodyProseBold, { color: Colors.textPrimary }]}>
                {session?.user.displayName ?? session?.user.email ?? "Preview account"}
              </Text>
              <Text style={[Typography.uiLabel, { color: Colors.textSecondary, marginTop: Spacing.xs }]}>
                {session?.user.displayName && session?.user.email ? `${session.user.email} · ` : ""}
                ₹{(profile?.creditBalance ?? 0).toFixed(2)} balance
                {profile?.isSuperuser ? " · Superuser" : ""}
              </Text>
            </View>
          </View>
        </View>

        {/* Preferences */}
        <View style={{ gap: Spacing.md }}>
          <SectionLabel>PREFERENCES</SectionLabel>
          <View
            style={{
              backgroundColor: Colors.surface,
              borderWidth: 1,
              borderColor: Colors.borderHairline,
              borderRadius: Spacing.radius.container,
              paddingHorizontal: Spacing.lg,
            }}
          >
            <SettingsRow detail={`₹${(profile?.creditBalance ?? 0).toFixed(2)}`} label="Credits" onPress={() => router.push("/credits")} />
            <View style={{ height: 1, backgroundColor: Colors.borderHairline }} />
            <SettingsRow detail={preferredModel.displayName} label="Default model" />
            <View style={{ height: 1, backgroundColor: Colors.borderHairline }} />
            <SettingsRow label="Memory" onPress={() => router.push("/memory")} />
          </View>
        </View>

        {/* About */}
        <View style={{ gap: Spacing.md }}>
          <SectionLabel>ABOUT</SectionLabel>
          <View
            style={{
              backgroundColor: Colors.surface,
              borderWidth: 1,
              borderColor: Colors.borderHairline,
              borderRadius: Spacing.radius.container,
              paddingHorizontal: Spacing.lg,
            }}
          >
            <SettingsRow detail="v1.0.3" label="Version" />
            <View style={{ height: 1, backgroundColor: Colors.borderHairline }} />
            <SettingsRow detail={bundleLabel} label="Bundle" />
            <View style={{ height: 1, backgroundColor: Colors.borderHairline }} />
            <SettingsRow
              detail={updateBusy ? "…" : "Tap"}
              label="Check for updates"
              onPress={handleCheckUpdates}
            />
            {updateStatus ? (
              <View style={{ paddingBottom: Spacing.md, paddingTop: 2 }}>
                <Text
                  style={[
                    Typography.uiLabel,
                    { color: Colors.textTertiary, fontSize: 11 },
                  ]}
                >
                  {updateStatus}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Danger Zone */}
        <View style={{ gap: Spacing.md }}>
          <SectionLabel>DANGER ZONE</SectionLabel>
          <View
            style={{
              backgroundColor: Colors.dangerMuted,
              borderWidth: 1,
              borderColor: Colors.danger,
              borderRadius: Spacing.radius.container,
              padding: Spacing.lg,
              gap: Spacing.md,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.md }}>
              <Ionicons color={Colors.danger} name="warning" size={20} />
              <Text
                style={[
                  Typography.uiLabel,
                  {
                    color: Colors.danger,
                    fontSize: 11,
                    letterSpacing: 0.1,
                    textTransform: "uppercase",
                  },
                ]}
              >
                Destructive actions below
              </Text>
            </View>
            <Text style={[Typography.bodyProse, { color: Colors.textSecondary, opacity: 0.8 }]}>
              Signing out will end your current session. You will need to authenticate again to continue using Closed AI.
            </Text>
            <Pressable
              onPress={async () => {
                await signOut();
                router.replace("/auth/sign-in");
              }}
              style={{
                backgroundColor: Colors.danger,
                borderRadius: Spacing.radius.button,
                paddingVertical: Spacing.md,
                alignItems: "center",
              }}
            >
              <Text style={[Typography.uiLabel, { color: Colors.onPrimary, fontSize: 11, letterSpacing: 0.1, textTransform: "uppercase" }]}>
                Sign Out
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
