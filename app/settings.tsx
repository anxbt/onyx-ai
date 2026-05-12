import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/ui/Card";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/hooks/useAuth";
import { getModelConfig } from "@/lib/models";

function SettingsRow({
  label,
  detail,
  onPress,
}: {
  label: string;
  detail?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={{ paddingVertical: 14, flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ color: Colors.textPrimary, fontSize: 15 }}>{label}</Text>
      <Text style={{ color: Colors.textSecondary, fontSize: 14 }}>{detail ?? "›"}</Text>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signOut, session, profile } = useAuth();
  const preferredModel = getModelConfig(profile?.preferredModel ?? "");

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: Math.max(insets.top, 16),
        paddingBottom: Math.max(insets.bottom, 16),
        gap: 16,
      }}
    >
      <Text style={{ color: Colors.textPrimary, fontSize: 28, fontWeight: "700" }}>Settings</Text>

      <Card>
        <View style={{ gap: 6 }}>
          <Text style={{ color: Colors.textPrimary, fontSize: 18, fontWeight: "700" }}>
            {session?.user.email ?? "Preview account"}
          </Text>
          <Text style={{ color: Colors.textSecondary }}>
            ₹{(profile?.creditBalance ?? 0).toFixed(2)} balance · {profile?.isSuperuser ? "Superuser" : "Standard"}
          </Text>
        </View>
      </Card>

      <Card>
        <SettingsRow detail={`₹${(profile?.creditBalance ?? 0).toFixed(2)}`} label="Balance" onPress={() => router.push("/credits")} />
        <SettingsRow detail={preferredModel.displayName} label="Default model" />
        <SettingsRow label="Memory" onPress={() => router.push("/memory")} />
      </Card>

      <Card>
        <SettingsRow detail="v1 scaffold" label="About" />
        <SettingsRow
          label="Sign out"
          onPress={async () => {
            await signOut();
            router.replace("/auth/sign-in");
          }}
        />
      </Card>
    </ScrollView>
  );
}
