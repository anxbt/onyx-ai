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
import { pickImageFromCamera, pickImageFromGallery, pickDocument, uploadToStorage } from "@/lib/uploads";
import type { Attachment } from "@/types";

export default function ChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const activeModelId = useAppStore((state) => state.activeModelId);
  const setActiveModelId = useAppStore((state) => state.setActiveModelId);
  const activeConversationId = useAppStore((state) => state.activeConversationId);
  const setActiveConversationId = useAppStore((state) => state.setActiveConversationId);
  const { session, profile, isLoading: authLoading } = useAuth();
  const creditBalance = profile?.creditBalance ?? 0;
  const isSuperuser = profile?.isSuperuser ?? false;
  const [draft, setDraft] = useState("");
  const [selectorVisible, setSelectorVisible] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [searchMode, setSearchMode] = useState<"auto" | "force" | "off">("auto");
  const { messages, streaming, streamingContent, error, sendMessage, stopStreaming } = useChat({
    conversationId: activeConversationId,
    modelId: activeModelId,
    session,
    onConversationCreated: (conversation) => setActiveConversationId(conversation.id),
  });

  const activeModel = getModelConfig(activeModelId);

  const handleCamera = async () => {
    const attachment = await pickImageFromCamera();
    if (attachment) {
      setAttachments((prev) => [...prev, attachment]);
    }
  };

  const handleAttach = async () => {
    const image = await pickImageFromGallery();
    if (image) {
      setAttachments((prev) => [...prev, image]);
      return;
    }
    const doc = await pickDocument();
    if (doc) {
      setAttachments((prev) => [...prev, doc]);
    }
  };

  const toggleSearch = () => {
    setSearchMode((prev) => (prev === "auto" ? "force" : prev === "force" ? "off" : "auto"));
  };

  const handleSend = async () => {
    const nextDraft = draft;
    const currentAttachments = [...attachments];
    setDraft("");
    setAttachments([]);

    const userId = session?.user?.id;
    if (!session?.accessToken || !userId) {
      sendMessage(nextDraft, currentAttachments);
      return;
    }

    const uploaded: Attachment[] = [];
    for (const att of currentAttachments) {
      const result = await uploadToStorage(att, userId);
      if (result) uploaded.push(result);
    }

    sendMessage(nextDraft, uploaded, {
      enableSearch: searchMode !== "off",
      forceSearch: searchMode === "force",
    });
  };

  useEffect(() => {
    // No longer force-switch to free model — user can browse all models.
    // If credit is 0, InputBar shows "Top up" and worker returns 402.
  }, []);

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
          attachments={attachments}
          canSend={draft.trim().length > 0 || attachments.length > 0}
          creditBalance={creditBalance}
          draft={draft}
          isFreeModel={activeModel.isFree}
          isSuperuser={isSuperuser}
          onChangeDraft={setDraft}
          onAttach={handleAttach}
          onCamera={handleCamera}
          onToggleSearch={toggleSearch}
          searchMode={searchMode}
          onSend={handleSend}
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
