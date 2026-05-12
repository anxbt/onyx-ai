import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { InputBar } from "@/components/chat/InputBar";
import { MessageList } from "@/components/chat/MessageList";
import { ModelBadge } from "@/components/model/ModelBadge";
import { ModelSelector } from "@/components/model/ModelSelector";
import { Colors } from "@/constants/colors";
import { getModelConfig } from "@/lib/models";
import { FREE_MODEL_ID } from "@/constants/models";
import { useAppStore } from "@/store/app";
import { useChat } from "@/hooks/useChat";
import { useAuth } from "@/hooks/useAuth";

export default function ChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const activeModelId = useAppStore((state) => state.activeModelId);
  const setActiveModelId = useAppStore((state) => state.setActiveModelId);
  const activeConversationId = useAppStore((state) => state.activeConversationId);
  const setActiveConversationId = useAppStore((state) => state.setActiveConversationId);
  const { session, profile, isLoading: authLoading } = useAuth();
  const creditBalance = profile?.creditBalance ?? 0;
  const [draft, setDraft] = useState("");
  const [selectorVisible, setSelectorVisible] = useState(false);
  const { messages, streaming, streamingContent, error, sendMessage, stopStreaming } = useChat({
    conversationId: activeConversationId,
    modelId: activeModelId,
    session,
    onConversationCreated: (conversation) => setActiveConversationId(conversation.id),
  });

  const activeModel = getModelConfig(activeModelId);

  useEffect(() => {
    if (!authLoading && creditBalance <= 0 && !activeModel.isFree) {
      setActiveModelId(FREE_MODEL_ID);
    }
  }, [activeModel.isFree, authLoading, creditBalance, setActiveModelId]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: Math.max(insets.top, 18),
          paddingBottom: 12,
          borderBottomColor: Colors.border,
          borderBottomWidth: 1,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <Pressable onPress={() => router.push("/settings")}>
          <Ionicons color={Colors.textSecondary} name="menu" size={22} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <ModelBadge modelId={activeModelId} onPress={() => setSelectorVisible(true)} />
        </View>
        <Pressable onPress={() => router.push("/credits")}>
          <Ionicons color={Colors.textSecondary} name="wallet-outline" size={22} />
        </Pressable>
      </View>

      <View
        style={{
          flex: 1,
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: Math.max(insets.bottom, 16),
          gap: 14,
        }}
      >
        <Text style={{ color: Colors.textSecondary, fontSize: 13 }}>
          {activeModel.displayName} · {activeModel.provider} · {activeModel.isFree ? "Free" : "Pay-as-you-go"}
        </Text>
        {error ? <Text style={{ color: Colors.danger, fontSize: 13 }}>{error}</Text> : null}
        <View style={{ flex: 1 }}>
          <MessageList
            activeConversationId={activeConversationId ?? "new"}
            messages={messages}
            streamingContent={streamingContent}
          />
        </View>
        <InputBar
          attachments={[]}
          canSend={draft.trim().length > 0}
          creditBalance={creditBalance}
          draft={draft}
          isFreeModel={activeModel.isFree}
          onChangeDraft={setDraft}
          onSend={() => {
            const nextDraft = draft;
            setDraft("");
            sendMessage(nextDraft);
          }}
          onStop={stopStreaming}
          onTopUp={() => router.push("/credits")}
          streaming={streaming}
        />
      </View>

      <ModelSelector
        currentModelId={activeModelId}
        onClose={() => setSelectorVisible(false)}
        onSelect={setActiveModelId}
        visible={selectorVisible}
      />
    </View>
  );
}
