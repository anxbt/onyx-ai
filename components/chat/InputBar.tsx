import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, TextInput, View } from "react-native";

import { AttachmentPreview } from "@/components/chat/AttachmentPreview";
import { Button } from "@/components/ui/Button";
import { Colors } from "@/constants/colors";
import { Spacing } from "@/constants/spacing";
import { Typography } from "@/constants/typography";
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
    <View style={{ gap: Spacing.sm }}>
      <AttachmentPreview attachments={attachments} />
      <View
        style={{
          backgroundColor: Colors.surface,
          borderColor: Colors.borderHairline,
          borderRadius: Spacing.radius.container,
          borderWidth: 1,
          padding: Spacing.md,
          gap: Spacing.sm,
        }}
      >
        <Text style={[Typography.uiLabel, { color: Colors.textTertiary }]}>
          est {estimateTokens(draft)} tok · pay-as-you-go
        </Text>
        <TextInput
          multiline
          onChangeText={onChangeDraft}
          placeholder="Message OnyxAI…"
          placeholderTextColor={Colors.textTertiary}
          style={[
            Typography.bodyProse,
            {
              color: Colors.textPrimary,
              maxHeight: 110,
              paddingVertical: 0,
              textAlignVertical: "top",
              includeFontPadding: false,
            },
          ]}
          value={draft}
        />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", gap: Spacing.lg }}>
            <Pressable onPress={onCamera} hitSlop={8}>
              <Ionicons color={Colors.textSecondary} name="camera-outline" size={18} />
            </Pressable>
            <Pressable onPress={onAttach} hitSlop={8}>
              <Ionicons color={Colors.textSecondary} name="attach-outline" size={18} />
            </Pressable>
            {onToggleSearch ? (
              <Pressable onPress={onToggleSearch} hitSlop={8}>
                <Text
                  style={[
                    Typography.uiLabel,
                    { color: searchMode === "off" ? Colors.textTertiary : Colors.primary },
                  ]}
                >
                  🌐
                </Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable
            disabled={!streaming && !canSend}
            onPress={streaming ? onStop : onSend}
            style={{
              backgroundColor: streaming || canSend ? Colors.primary : "transparent",
              borderColor: streaming || canSend ? Colors.primary : Colors.borderHairline,
              borderWidth: 1,
              borderRadius: Spacing.radius.primaryAction,
              paddingHorizontal: Spacing.md,
              paddingVertical: Spacing.sm,
            }}
          >
            <Text style={[Typography.uiMedium, { color: streaming || canSend ? Colors.onPrimary : Colors.textSecondary }]}>
              {streaming ? "Stop" : "Send"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

