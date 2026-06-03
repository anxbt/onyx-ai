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
  searchMode?: "on" | "off";
  // Thinking-depth chip. When `reasoningLabel` is a string the chip renders
  // (e.g., "Med", "Always on"). When null/undefined the chip is hidden —
  // used for models that don't expose reasoning controls.
  reasoningLabel?: string | null;
  onOpenReasoningSheet?: () => void;
  streaming: boolean;
  attachments: Attachment[];
  canSend: boolean;
  creditBalance: number;
  isFreeModel: boolean;
  isSuperuser?: boolean;
  isProfileLoading?: boolean;
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
  reasoningLabel,
  onOpenReasoningSheet,
  streaming,
  attachments,
  canSend,
  creditBalance,
  isFreeModel,
  isSuperuser,
  isProfileLoading,
  onTopUp,
}: InputBarProps) {
  if (creditBalance <= 0 && !isFreeModel && !isSuperuser && !isProfileLoading) {
    return <Button label="Top up credits to continue" onPress={onTopUp} />;
  }

  const showTokenEstimate = draft.length > 0;

  return (
    <View style={{ gap: Spacing.sm }}>
      <AttachmentPreview attachments={attachments} />
      <View
        style={{
          backgroundColor: Colors.surfaceElevated,
          borderRadius: Spacing.radius.container,
          padding: Spacing.md,
          gap: Spacing.sm,
        }}
      >
        {showTokenEstimate ? (
          <Text style={[Typography.uiLabel, { color: Colors.textTertiary }]}>
            est {estimateTokens(draft)} tok
          </Text>
        ) : null}
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
                <Ionicons
                  name="globe-outline"
                  size={18}
                  color={searchMode === "off" ? Colors.textTertiary : Colors.primary}
                />
              </Pressable>
            ) : null}
            {reasoningLabel && onOpenReasoningSheet ? (
              <Pressable
                onPress={onOpenReasoningSheet}
                hitSlop={8}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  paddingHorizontal: Spacing.sm,
                  paddingVertical: 2,
                  borderRadius: Spacing.radius.button,
                  borderWidth: 1,
                  borderColor: Colors.borderHairline,
                }}
              >
                <Ionicons
                  name="bulb-outline"
                  size={14}
                  color={Colors.textSecondary}
                />
                <Text
                  style={[
                    Typography.uiLabel,
                    { color: Colors.textSecondary, fontSize: 11 },
                  ]}
                  numberOfLines={1}
                >
                  {reasoningLabel}
                </Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable
            disabled={!streaming && !canSend}
            onPress={streaming ? onStop : onSend}
            style={{
              backgroundColor: streaming || canSend ? Colors.primary : Colors.surfaceContainer,
              borderRadius: Spacing.radius.primaryAction,
              paddingHorizontal: Spacing.md,
              paddingVertical: Spacing.sm,
            }}
          >
            <Text style={[Typography.uiMedium, { color: streaming || canSend ? Colors.onPrimary : Colors.textTertiary }]}>
              {streaming ? "Stop" : "Send"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
