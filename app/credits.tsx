import { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CreditBalance } from "@/components/credits/CreditBalance";
import { TopUpSheet } from "@/components/credits/TopUpSheet";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Colors } from "@/constants/colors";
import { useCredits } from "@/hooks/useCredits";
import { useAuth } from "@/hooks/useAuth";
import { startRazorpayTopUp } from "@/lib/payments";
import type { TopUpPack } from "@/types";

export default function CreditsScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { balance, transactions, packages, error, isLoading, refresh } = useCredits(session?.user.id);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [isPaying, setIsPaying] = useState(false);

  async function handleTopUp(pack: TopUpPack) {
    if (!session?.accessToken) {
      Alert.alert("Sign in required", "Please sign in before topping up credits.");
      return;
    }

    try {
      setIsPaying(true);
      await startRazorpayTopUp({
        accessToken: session.accessToken,
        email: session.user.email,
        pack,
      });
      setSheetVisible(false);
      await refresh();
    } catch (nextError) {
      Alert.alert("Payment failed", nextError instanceof Error ? nextError.message : "Could not complete payment");
    } finally {
      setIsPaying(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: Math.max(insets.top, 16),
        paddingBottom: Math.max(insets.bottom, 16),
        gap: 16,
      }}
    >
      <Text style={{ color: Colors.textPrimary, fontSize: 28, fontWeight: "700" }}>Credits</Text>
      <CreditBalance balance={balance} />
      <Button label={isPaying ? "Opening payment…" : "Top up"} onPress={() => setSheetVisible(true)} />
      {error ? <Text style={{ color: Colors.danger }}>{error}</Text> : null}
      {isLoading ? <Text style={{ color: Colors.textSecondary }}>Loading activity…</Text> : null}

      <Card>
        <Text style={{ color: Colors.textPrimary, fontSize: 16, fontWeight: "700", marginBottom: 12 }}>Recent activity</Text>
        {transactions.length ? (
          <View style={{ gap: 10 }}>
          {transactions.map((transaction) => (
            <View key={transaction.id}>
              <Text style={{ color: Colors.textPrimary, fontWeight: "600" }}>
                {transaction.type === "usage" ? `-${Math.abs(transaction.amount).toFixed(2)}` : `+${transaction.amount.toFixed(2)}`}
              </Text>
              <Text style={{ color: Colors.textSecondary }}>
                {transaction.model ?? "Wallet"} · {new Date(transaction.createdAt).toLocaleString()}
              </Text>
            </View>
          ))}
          </View>
        ) : (
          <Text style={{ color: Colors.textSecondary }}>No wallet activity yet.</Text>
        )}
      </Card>

      <TopUpSheet
        onClose={() => setSheetVisible(false)}
        onSelect={handleTopUp}
        packages={packages}
        visible={sheetVisible}
      />
    </ScrollView>
  );
}
