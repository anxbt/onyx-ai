import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Colors } from "@/constants/colors";
import { useConversations } from "@/hooks/useConversations";
import { useAuth } from "@/hooks/useAuth";
import { useAppStore } from "@/store/app";

export default function HistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const setActiveConversationId = useAppStore((state) => state.setActiveConversationId);
  const { conversations, searchQuery, setSearchQuery, error, isLoading } = useConversations(session?.user.id);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: Colors.background,
        paddingHorizontal: 16,
        paddingTop: Math.max(insets.top, 16),
        paddingBottom: Math.max(insets.bottom, 16),
        gap: 16,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: Colors.textPrimary, fontSize: 28, fontWeight: "700" }}>Chats</Text>
        <Ionicons color={Colors.textSecondary} name="add-circle-outline" onPress={() => router.push("/(tabs)")} size={24} />
      </View>

      <Card>
        <View style={{ flexDirection: "row", gap: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: Colors.textTertiary, fontSize: 11, fontWeight: "700" }}>THIS MONTH</Text>
            <Text style={{ color: Colors.textPrimary, fontSize: 22, fontWeight: "700", marginTop: 8 }}>$0.4128</Text>
          </View>
          <View style={{ width: 1, backgroundColor: Colors.border }} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: Colors.textTertiary, fontSize: 11, fontWeight: "700" }}>SAVED VS FRONTIER</Text>
            <Text style={{ color: Colors.accent, fontSize: 22, fontWeight: "700", marginTop: 8 }}>$5.84</Text>
          </View>
        </View>
      </Card>

      <TextInput
        onChangeText={setSearchQuery}
        placeholder="Search chats"
        placeholderTextColor={Colors.textTertiary}
        style={{
          color: Colors.textPrimary,
          backgroundColor: Colors.surface,
          borderColor: Colors.border,
          borderRadius: 14,
          borderWidth: 1,
          padding: 14,
        }}
        value={searchQuery}
      />

      {error ? <Text style={{ color: Colors.danger }}>{error}</Text> : null}
      {isLoading ? <Text style={{ color: Colors.textSecondary }}>Loading chats…</Text> : null}

      {conversations.length ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ gap: 12 }}>
            {conversations.map((conversation) => (
              <Card key={conversation.id}>
                <View style={{ gap: 8 }}>
                  <Text
                    onPress={() => {
                      setActiveConversationId(conversation.id);
                      router.push("/(tabs)");
                    }}
                    style={{ color: Colors.textPrimary, fontSize: 16, fontWeight: "700" }}
                  >
                    {conversation.title}
                  </Text>
                  <Text style={{ color: Colors.textSecondary }}>{conversation.preview || "No messages yet"}</Text>
                  <Text style={{ color: Colors.textTertiary, fontSize: 12 }}>
                    {new Date(conversation.updatedAt).toLocaleString()} · {conversation.tokenCount} tok
                  </Text>
                </View>
              </Card>
            ))}
          </View>
        </ScrollView>
      ) : !isLoading ? (
        <EmptyState description="Try a different search query." title="No matching chats" />
      ) : null}
    </View>
  );
}
