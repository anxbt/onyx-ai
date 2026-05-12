import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MemoryFactCard } from "@/components/memory/MemoryFactCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Colors } from "@/constants/colors";
import { useMemory } from "@/hooks/useMemory";

export default function MemoryScreen() {
  const insets = useSafeAreaInsets();
  const { facts } = useMemory();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: Math.max(insets.top, 16),
        paddingBottom: Math.max(insets.bottom, 16),
        gap: 14,
      }}
    >
      <Text style={{ color: Colors.textPrimary, fontSize: 28, fontWeight: "700" }}>Memory</Text>
      <Text style={{ color: Colors.textSecondary }}>
        Facts are grouped and editable later. This checkpoint focuses on the structure and preview UX.
      </Text>
      {facts.length ? (
        <View style={{ gap: 12 }}>
          {facts.map((fact) => (
            <MemoryFactCard fact={fact} key={fact.id} />
          ))}
        </View>
      ) : (
        <EmptyState description="Once the model learns persistent user facts, they will appear here." title="No memory facts yet" />
      )}
    </ScrollView>
  );
}
