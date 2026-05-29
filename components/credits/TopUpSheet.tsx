import { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";

import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Colors } from "@/constants/colors";
import type { TopUpPack } from "@/types";

interface TopUpSheetProps {
  visible: boolean;
  onClose: () => void;
  packages: TopUpPack[];
  onSelect: (pack: TopUpPack) => void;
  onCustomAmount?: (amountInr: number) => void;
}

const QUICK_AMOUNTS = [10, 20, 50, 100];

export function TopUpSheet({ visible, onClose, packages, onSelect, onCustomAmount }: TopUpSheetProps) {
  const [customAmount, setCustomAmount] = useState("");
  const [activeTab, setActiveTab] = useState<"quick" | "packs">("quick");

  function handleCustomPay() {
    const amount = parseInt(customAmount.trim(), 10);
    if (isNaN(amount) || amount < 10) {
      Alert.alert("Invalid amount", "Minimum top-up is ₹10");
      return;
    }
    if (amount > 10000) {
      Alert.alert("Amount too high", "Maximum top-up is ₹10,000");
      return;
    }
    onCustomAmount?.(amount);
    setCustomAmount("");
  }

  return (
    <BottomSheet onClose={onClose} visible={visible}>
      <Text style={{ color: Colors.textPrimary, fontSize: 20, fontWeight: "700", marginBottom: 4 }}>
        Top up credits
      </Text>
      <Text style={{ color: Colors.textSecondary, fontSize: 13, marginBottom: 16 }}>
        1 credit = ₹1 · Use for premium AI models
      </Text>

      {/* Tab switcher */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
        <Pressable
          onPress={() => setActiveTab("quick")}
          style={{
            flex: 1,
            paddingVertical: 8,
            borderRadius: 10,
            backgroundColor: activeTab === "quick" ? Colors.primary : Colors.surfaceElevated,
            alignItems: "center",
          }}
        >
          <Text style={{
            color: activeTab === "quick" ? Colors.onPrimary : Colors.textSecondary,
            fontWeight: "600",
            fontSize: 14,
          }}>
            Custom
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab("packs")}
          style={{
            flex: 1,
            paddingVertical: 8,
            borderRadius: 10,
            backgroundColor: activeTab === "packs" ? Colors.primary : Colors.surfaceElevated,
            alignItems: "center",
          }}
        >
          <Text style={{
            color: activeTab === "packs" ? Colors.onPrimary : Colors.textSecondary,
            fontWeight: "600",
            fontSize: 14,
          }}>
            Packs
          </Text>
        </Pressable>
      </View>

      {activeTab === "quick" ? (
        <View style={{ gap: 14 }}>
          {/* Quick amount buttons */}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {QUICK_AMOUNTS.map((amt) => (
              <Pressable
                key={amt}
                onPress={() => setCustomAmount(String(amt))}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 10,
                  backgroundColor: customAmount === String(amt) ? Colors.primary : Colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: customAmount === String(amt) ? Colors.primary : Colors.border,
                }}
              >
                <Text style={{
                  color: customAmount === String(amt) ? Colors.onPrimary : Colors.textPrimary,
                  fontWeight: "600",
                  fontSize: 15,
                }}>
                  ₹{amt}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Custom input */}
          <View style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            backgroundColor: Colors.surfaceElevated,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: Colors.border,
            paddingHorizontal: 14,
            paddingVertical: 4,
          }}>
            <Text style={{ color: Colors.textPrimary, fontSize: 18, fontWeight: "600" }}>₹</Text>
            <TextInput
              value={customAmount}
              onChangeText={setCustomAmount}
              placeholder="Enter amount"
              placeholderTextColor={Colors.textTertiary}
              keyboardType="number-pad"
              style={{
                flex: 1,
                color: Colors.textPrimary,
                fontSize: 18,
                fontWeight: "600",
                paddingVertical: 10,
              }}
            />
          </View>

          <Text style={{ color: Colors.textTertiary, fontSize: 12 }}>
            Min ₹10 · Max ₹10,000 · No processing fees
          </Text>

          <Button
            label={`Pay ₹${customAmount || "0"}`}
            onPress={handleCustomPay}
            disabled={!customAmount || parseInt(customAmount) < 10}
          />
        </View>
      ) : (
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
      )}
    </BottomSheet>
  );
}
