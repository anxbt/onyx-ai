import { Text, View } from "react-native";

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Colors } from "@/constants/colors";
import type { MemoryFact } from "@/types";

interface MemoryFactCardProps {
  fact: MemoryFact;
}

export function MemoryFactCard({ fact }: MemoryFactCardProps) {
  return (
    <Card>
      <View style={{ gap: 10 }}>
        <Badge label={fact.category.toUpperCase()} />
        <Text style={{ color: Colors.textPrimary, fontSize: 15, lineHeight: 22 }}>{fact.content}</Text>
        <Text style={{ color: Colors.textTertiary, fontSize: 12 }}>
          confidence {fact.confidence.toFixed(2)} · updated {fact.updatedAt}
        </Text>
      </View>
    </Card>
  );
}

