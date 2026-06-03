import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors } from "@/constants/colors";
import { Spacing } from "@/constants/spacing";
import { Typography } from "@/constants/typography";
import type { ModelConfig, ReasoningEffortLevel } from "@/types";

// User-facing labels for each effort level. Kept short so the chip in the
// input bar displays cleanly.
const LEVEL_LABEL: Record<ReasoningEffortLevel, string> = {
  none: "Off",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "X-High",
};

// Plain-English hint per level. The percentage refers to how much of the
// model's max_tokens budget gets allocated to reasoning per OpenRouter docs.
const LEVEL_HINT: Record<ReasoningEffortLevel, string> = {
  none: "No thinking pass. Fastest, cheapest.",
  minimal: "Slightly more careful (~10% extra tokens).",
  low: "Quick analysis (~20% extra tokens).",
  medium: "Balanced (~50% extra tokens). Best default.",
  high: "Hard problems (~80% extra tokens).",
  xhigh: "Maximum depth (~95% extra tokens). Slowest, most thorough.",
};

interface ReasoningEffortSheetProps {
  visible: boolean;
  onClose: () => void;
  model: ModelConfig;
  currentLevel?: ReasoningEffortLevel;
  onSelect: (level: ReasoningEffortLevel) => void;
}

export function ReasoningEffortSheet({
  visible,
  onClose,
  model,
  currentLevel,
  onSelect,
}: ReasoningEffortSheetProps) {
  const insets = useSafeAreaInsets();
  const config = model.reasoningConfig;
  const effectiveLevel =
    currentLevel ??
    (config && config.kind === "effort" ? config.default : undefined);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.55)",
          justifyContent: "flex-end",
        }}
      >
        <Pressable
          // Stop the backdrop press from closing when the user taps inside.
          onPress={() => {}}
          style={{
            backgroundColor: Colors.background,
            borderTopLeftRadius: Spacing.radius.container,
            borderTopRightRadius: Spacing.radius.container,
            paddingHorizontal: Spacing.lg,
            paddingTop: Spacing.lg,
            paddingBottom: Math.max(insets.bottom + Spacing.md, Spacing.lg),
            gap: Spacing.md,
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <View style={{ gap: 2 }}>
              <Text
                style={[Typography.bodyProseBold, { color: Colors.textPrimary }]}
              >
                Thinking depth
              </Text>
              <Text
                style={[
                  Typography.uiLabel,
                  { color: Colors.textTertiary, fontSize: 11 },
                ]}
              >
                Model: {model.displayName}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={8}
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
              <Ionicons name="close" size={16} color={Colors.textSecondary} />
            </Pressable>
          </View>

          {/* Body */}
          {!config ? (
            <Text
              style={[
                Typography.uiLabel,
                { color: Colors.textTertiary, paddingVertical: Spacing.md },
              ]}
            >
              This model doesn't expose reasoning controls.
            </Text>
          ) : config.kind === "always-on" ? (
            <View style={{ paddingVertical: Spacing.md, gap: Spacing.sm }}>
              <Text
                style={[Typography.bodyProse, { color: Colors.textPrimary }]}
              >
                {model.displayName} reasons on every reply.
              </Text>
              <Text
                style={[Typography.uiLabel, { color: Colors.textTertiary }]}
              >
                This isn't adjustable — the model's purpose is extended thinking.
              </Text>
            </View>
          ) : (
            config.levels.map((level) => {
              const isSelected = level === effectiveLevel;
              return (
                <Pressable
                  key={level}
                  onPress={() => {
                    onSelect(level);
                    onClose();
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: Spacing.md,
                    paddingVertical: Spacing.sm,
                  }}
                  hitSlop={4}
                >
                  <Ionicons
                    name={isSelected ? "radio-button-on" : "radio-button-off"}
                    size={20}
                    color={isSelected ? Colors.primary : Colors.textTertiary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        Typography.bodyProse,
                        {
                          color: isSelected
                            ? Colors.textPrimary
                            : Colors.textSecondary,
                          fontWeight: isSelected ? "600" : "400",
                        },
                      ]}
                    >
                      {LEVEL_LABEL[level]}
                    </Text>
                    <Text
                      style={[
                        Typography.uiLabel,
                        { color: Colors.textTertiary, fontSize: 11 },
                      ]}
                    >
                      {LEVEL_HINT[level]}
                    </Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Helper used by the chip in InputBar so callers don't need to know the
// label-mapping table.
export function getReasoningChipLabel(
  model: ModelConfig,
  currentLevel: ReasoningEffortLevel | undefined,
): string | null {
  const config = model.reasoningConfig;
  if (!config) return null;
  if (config.kind === "always-on") return "Always on";
  const level = currentLevel ?? config.default;
  return LEVEL_LABEL[level];
}
