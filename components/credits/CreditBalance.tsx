import { Text, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { Colors } from "@/constants/colors";

interface CreditBalanceProps {
  balance: number;
}

export function CreditBalance({ balance }: CreditBalanceProps) {
  return (
    <Card>
      <View style={{ gap: 8 }}>
        <Text style={{ color: Colors.textTertiary, fontSize: 12, fontWeight: "700" }}>BALANCE</Text>
        <Text style={{ color: Colors.textPrimary, fontSize: 28, fontWeight: "700" }}>₹{balance.toFixed(2)}</Text>
      </View>
    </Card>
  );
}

