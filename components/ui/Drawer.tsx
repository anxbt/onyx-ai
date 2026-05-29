import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors } from "@/constants/colors";
import { Spacing } from "@/constants/spacing";
import { Typography } from "@/constants/typography";
import { useConversations } from "@/hooks/useConversations";
import { useAuth } from "@/hooks/useAuth";
import { useAppStore } from "@/store/app";

interface DrawerProps {
  visible: boolean;
  onClose: () => void;
}

export function Drawer({ visible, onClose }: DrawerProps) {
  const router = useRouter();
  const { session, profile } = useAuth();
  const activeConversationId = useAppStore((state) => state.activeConversationId);
  const setActiveConversationId = useAppStore((state) => state.setActiveConversationId);
  const { conversations, searchQuery, setSearchQuery, isLoading, error } = useConversations(session?.user.id);
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        zIndex: 100,
        flexDirection: "row",
      }}
    >
      {/* Drawer panel - must come first to be on the left */}
      <View
        style={{
          width: 300,
          height: "100%",
          backgroundColor: Colors.background,
          borderRightWidth: 1,
          borderRightColor: Colors.borderHairline,
          paddingTop: insets.top + Spacing.lg,
          paddingBottom: insets.bottom + Spacing.lg,
          paddingLeft: Spacing.lg,
          paddingRight: Spacing.lg,
          gap: Spacing.lg,
        }}
      >
        {/* Profile header */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.md }}>
            {session?.user?.avatarUrl ? (
              <Image
                source={{ uri: session.user.avatarUrl }}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: Colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: Colors.borderHairline,
                }}
              />
            ) : (
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: Colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: Colors.borderHairline,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons color={Colors.textSecondary} name="person" size={20} />
              </View>
            )}
            <View>
              <Text style={[Typography.uiMedium, { color: Colors.textPrimary }]} numberOfLines={1}>
                {session?.user?.displayName ?? profile?.displayName ?? session?.user?.email?.split("@")[0] ?? "User"}
              </Text>
              <Text style={[Typography.uiLabel, { color: Colors.textTertiary, fontSize: 10 }]}>
                {profile?.isSuperuser ? "Superuser" : `₹${(profile?.creditBalance ?? 0).toFixed(0)} credits`}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: Colors.borderHairline,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons color={Colors.textSecondary} name="close" size={16} />
          </Pressable>
        </View>

        {/* New Chat */}
        <Pressable
          onPress={() => {
            setActiveConversationId(null);
            onClose();
          }}
          style={{
            backgroundColor: Colors.primary,
            borderRadius: Spacing.radius.button,
            paddingVertical: Spacing.md,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: Spacing.sm,
          }}
        >
          <Ionicons color={Colors.onPrimary} name="add" size={18} />
          <Text style={[Typography.uiLabel, { color: Colors.onPrimary, fontSize: 11, letterSpacing: 0.05 }]}>
            NEW CHAT
          </Text>
        </Pressable>

        {/* Conversations */}
        <View style={{ flex: 1 }}>
          <Text
            style={[
              Typography.uiLabel,
              {
                color: Colors.textTertiary,
                fontSize: 10,
                letterSpacing: 0.15,
                marginBottom: Spacing.sm,
              },
            ]}
          >
            CONVERSATIONS
          </Text>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            <View style={{ gap: Spacing.xs }}>
              {isLoading ? (
                <Text style={[Typography.uiLabel, { color: Colors.textTertiary, padding: Spacing.md }]}>
                  Loading history...
                </Text>
              ) : null}
              {error ? (
                <Text style={[Typography.uiLabel, { color: Colors.danger, padding: Spacing.md }]}>
                  {error}
                </Text>
              ) : null}
              {!isLoading && !error && conversations.length === 0 ? (
                <Text style={[Typography.uiLabel, { color: Colors.textTertiary, padding: Spacing.md }]}>
                  No conversations yet
                </Text>
              ) : null}
              {conversations.map((conv) => {
                const isActive = conv.id === activeConversationId;
                return (
                  <Pressable
                    key={conv.id}
                    onPress={() => {
                      setActiveConversationId(conv.id);
                      onClose();
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: Spacing.sm,
                      padding: Spacing.md,
                      borderRadius: Spacing.radius.button,
                      backgroundColor: isActive ? Colors.surfaceElevated : "transparent",
                      borderWidth: isActive ? 1 : 0,
                      borderColor: Colors.borderHairline,
                    }}
                  >
                    <Ionicons
                      color={isActive ? Colors.primary : Colors.textTertiary}
                      name="chatbubble-ellipses"
                      size={18}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          Typography.bodyProseBold,
                          { color: isActive ? Colors.textPrimary : Colors.textSecondary },
                        ]}
                        numberOfLines={1}
                      >
                        {conv.title}
                      </Text>
                    </View>
                    <Text style={[Typography.dataMono, { color: Colors.textTertiary, fontSize: 10 }]}>
                      {new Date(conv.updatedAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>

        {/* Footer: Search + Settings + New */}
        <View
          style={{
            flexDirection: "row",
            gap: Spacing.sm,
            borderTopWidth: 1,
            borderTopColor: Colors.borderHairline,
            paddingTop: Spacing.md,
          }}
        >
          <View
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: Colors.surface,
              borderRadius: 20,
              paddingHorizontal: Spacing.md,
              borderWidth: 1,
              borderColor: Colors.borderHairline,
              gap: Spacing.sm,
            }}
          >
            <Ionicons color={Colors.textTertiary} name="search" size={14} />
            <TextInput
              onChangeText={setSearchQuery}
              placeholder="Search"
              placeholderTextColor={Colors.textTertiary}
              style={[Typography.uiLabel, { color: Colors.textPrimary, flex: 1, paddingVertical: Spacing.sm }]}
              value={searchQuery}
            />
          </View>
          <Pressable
            onPress={() => {
              onClose();
              router.push("/settings");
            }}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: Colors.borderHairline,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons color={Colors.textSecondary} name="settings-outline" size={18} />
          </Pressable>
          <Pressable
            onPress={() => {
              setActiveConversationId(null);
              onClose();
            }}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: Colors.primary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons color={Colors.onPrimary} name="add" size={20} />
          </Pressable>
        </View>
      </View>

      {/* Backdrop - on the right side */}
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} />
    </View>
  );
}
