import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, TextInput, View } from "react-native";

import { AttachmentPreview } from "@/components/chat/AttachmentPreview";
import { Button } from "@/components/ui/Button";
import { Colors } from "@/constants/colors";
import { estimateTokens } from "@/lib/tokens";
import type { Attachment } from "@/types";

interface InputBarProps {
  draft: string;
  onChangeDraft: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  onAttach?: () => void;
  onCamera?: () => void;
  onToggleSearch?: () => void;
  searchMode?: "auto" | "force" | "off";
  streaming: boolean;
  attachments: Attachment[];
  canSend: boolean;
  creditBalance: number;
  isFreeModel: boolean;
  isSuperuser?: boolean;
  onTopUp?: () => void;
}

export function InputBar({
  draft,
  onChangeDraft,
  onSend,
  onStop,
  onAttach,
  onCamera,
  onToggleSearch,
  searchMode,
  streaming,
  attachments,
  canSend,
  creditBalance,
  isFreeModel,
  isSuperuser,
  onTopUp,
}: InputBarProps) {
  if (creditBalance <= 0 && !isFreeModel && !isSuperuser) {
    return <Button label="Top up credits to continue" onPress={onTopUp} />;
  }

  return (
    <View style={{ gap: 10 }}>
      <AttachmentPreview attachments={attachments} />
      <View
        style={{
          backgroundColor: Colors.surface,
          borderColor: Colors.border,
          borderRadius: 18,
          borderWidth: 1,
          padding: 12,
          gap: 10,
        }}
      >
        <Text style={{ color: Colors.textTertiary, fontSize: 11 }}>
          est {estimateTokens(draft)} tok · pay-as-you-go
        </Text>
        <TextInput
          multiline
          onChangeText={onChangeDraft}
          placeholder="Message OnyxAI…"
          placeholderTextColor={Colors.textTertiary}
          style={{
            color: Colors.textPrimary,
            fontSize: 15,
            maxHeight: 110,
          }}
          value={draft}
        />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", gap: 14 }}>
            <Pressable onPress={onCamera} hitSlop={8}>
              <Ionicons color={Colors.textSecondary} name="camera-outline" size={18} />
            </Pressable>
            <Pressable onPress={onAttach} hitSlop={8}>
              <Ionicons color={Colors.textSecondary} name="attach-outline" size={18} />
            </Pressable>
            {onToggleSearch ? (
              <Pressable onPress={onToggleSearch} hitSlop={8}>
                <Text
                  style={{
                    color: searchMode === "off" ? Colors.textTertiary : Colors.accent,
                    fontSize: 11,
                    fontWeight: "600",
                  }}
                >
                  {searchMode === "force" ? "🌐" : searchMode === "auto" ? "🌐" : "🌐"}
                </Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable
            disabled={!streaming && !canSend}
            onPress={streaming ? onStop : onSend}
            style={{
              backgroundColor: streaming || canSend ? Colors.accent : Colors.surfaceElevated,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          >
            <Text style={{ color: Colors.textPrimary, fontWeight: "700" }}>{streaming ? "Stop" : "Send"}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

