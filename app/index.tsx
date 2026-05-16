import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { InputBar } from "@/components/chat/InputBar";
import { MessageList } from "@/components/chat/MessageList";
import { ModelBadge } from "@/components/model/ModelBadge";
import { ModelSelector } from "@/components/model/ModelSelector";
import { Drawer } from "@/components/ui/Drawer";
import { Colors } from "@/constants/colors";
import { Spacing } from "@/constants/spacing";
import { Typography } from "@/constants/typography";
import { getModelConfig } from "@/lib/models";
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
  const { session, profile } = useAuth();
  const creditBalance = profile?.creditBalance ?? 0;
  const isSuperuser = profile?.isSuperuser ?? false;
  const [draft, setDraft] = useState("");
  const [selectorVisible, setSelectorVisible] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
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

  useEffect(() => {}, []);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* Header - no border, clean */}
      <View
        style={{
          paddingHorizontal: Spacing.mobileMargin,
          paddingTop: Math.max(insets.top, Spacing.xl),
          paddingBottom: Spacing.md,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: Spacing.md,
        }}
      >
        <Pressable onPress={() => setDrawerVisible(true)}>
          <Ionicons color={Colors.textSecondary} name="menu" size={22} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <ModelBadge modelId={activeModelId} onPress={() => setSelectorVisible(true)} />
        </View>
        <Pressable onPress={() => router.push("/credits")} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Ionicons color={creditBalance < 50 ? Colors.primary : Colors.textSecondary} name="wallet-outline" size={20} />
          <Text style={[Typography.uiLabel, { color: creditBalance < 50 ? Colors.primary : Colors.textSecondary }]}>
            ₹{creditBalance.toFixed(0)}
          </Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View
          style={{
            flex: 1,
            paddingHorizontal: Spacing.mobileMargin,
            paddingTop: Spacing.lg,
            paddingBottom: Math.max(insets.bottom, Spacing.lg),
            gap: Spacing.sectionGap,
          }}
        >
          {/* Error banner */}
          {error ? (
            <View
              style={{
                backgroundColor: Colors.surfaceElevated,
                borderLeftWidth: 3,
                borderLeftColor: Colors.danger,
                padding: Spacing.md,
                borderRadius: 4,
              }}
            >
              <Text style={[Typography.uiLabel, { color: Colors.danger }]}>{error}</Text>
            </View>
          ) : null}

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
      </KeyboardAvoidingView>

      <ModelSelector
        currentModelId={activeModelId}
        onClose={() => setSelectorVisible(false)}
        onSelect={setActiveModelId}
        visible={selectorVisible}
      />

      <Drawer visible={drawerVisible} onClose={() => setDrawerVisible(false)} />
    </View>
  );
}
