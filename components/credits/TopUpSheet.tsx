import { Pressable, Text, View } from "react-native";

import { BottomSheet } from "@/components/ui/BottomSheet";
import { Colors } from "@/constants/colors";
import type { TopUpPack } from "@/types";

interface TopUpSheetProps {
  visible: boolean;
  onClose: () => void;
  packages: TopUpPack[];
  onSelect: (pack: TopUpPack) => void;
}

export function TopUpSheet({ visible, onClose, packages, onSelect }: TopUpSheetProps) {
  return (
    <BottomSheet onClose={onClose} visible={visible}>
      <Text style={{ color: Colors.textPrimary, fontSize: 20, fontWeight: "700" }}>Top up credits</Text>
      <View style={{ gap: 10 }}>
        {packages.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => onSelect(item)}
            style={{
              backgroundColor: Colors.surfaceElevated,
              borderColor: Colors.border,
              borderRadius: 16,
              borderWidth: 1,
              padding: 14,
            }}
          >
            <Text style={{ color: Colors.textPrimary, fontSize: 16, fontWeight: "700" }}>
              {item.label} · ₹{item.amountInr}
            </Text>
            <Text style={{ color: Colors.textSecondary, marginTop: 4 }}>
              ₹{item.creditsInr} credits · {item.bonusLabel}
            </Text>
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}
