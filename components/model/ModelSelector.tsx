import { Pressable, ScrollView, Text, View } from "react-native";

import { BottomSheet } from "@/components/ui/BottomSheet";
import { Badge } from "@/components/ui/Badge";
import { Colors } from "@/constants/colors";
import { MODELS } from "@/constants/models";

interface ModelSelectorProps {
  currentModelId: string;
  visible: boolean;
  onClose: () => void;
  onSelect: (modelId: string) => void;
}

export function ModelSelector({ currentModelId, visible, onClose, onSelect }: ModelSelectorProps) {
  return (
    <BottomSheet onClose={onClose} visible={visible}>
      <Text style={{ color: Colors.textPrimary, fontSize: 20, fontWeight: "700" }}>Choose a model</Text>
      <Text style={{ color: Colors.textSecondary, fontSize: 14 }}>
        All 5 curated models from the spec are scaffolded here.
      </Text>
      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
        <View style={{ gap: 12 }}>
          {MODELS.map((model) => (
            <Pressable
              key={model.id}
              onPress={() => {
                onSelect(model.id);
                onClose();
              }}
              style={{
                backgroundColor: Colors.surfaceElevated,
                borderColor: model.id === currentModelId ? Colors.accent : Colors.border,
                borderRadius: 16,
                borderWidth: 1,
                padding: 14,
                gap: 8,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: Colors.textPrimary, fontSize: 16, fontWeight: "700" }}>
                  {model.displayName}
                </Text>
                {model.id === currentModelId ? <Badge label="ACTIVE" /> : null}
              </View>
              <Text style={{ color: Colors.textSecondary }}>{model.description}</Text>
              <Text style={{ color: Colors.textTertiary, fontSize: 12 }}>
                {model.provider} · {model.contextWindow.toLocaleString()} ctx ·
                {" "}
                ${model.outputCostPerMToken.toFixed(2)}/M output
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

