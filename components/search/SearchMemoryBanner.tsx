import { Text, View } from "react-native";

import { Colors } from "@/constants/colors";

export interface SearchMemoryBannerProps {
  relatedFacts: Array<{ content: string; category: string }>;
}

const CATEGORY_LABELS: Record<string, string> = {
  learning: "Learned",
  preference: "Prefers",
  project: "Project",
  personal: "Personal",
};

export function SearchMemoryBanner({ relatedFacts }: SearchMemoryBannerProps) {
  if (!relatedFacts.length) return null;

  return (
    <View
      style={{
        backgroundColor: Colors.accentSubtle,
        borderColor: Colors.accent,
        borderRadius: 10,
        borderWidth: 1,
        padding: 10,
        gap: 4,
      }}
    >
      <Text style={{ color: Colors.accent, fontSize: 11, fontWeight: "700" }}>
        Based on what you've told OnyxAI
      </Text>
      {relatedFacts.map((fact, i) => (
        <Text key={i} style={{ color: Colors.textPrimary, fontSize: 12 }}>
          {CATEGORY_LABELS[fact.category] ?? fact.category}: {fact.content}
        </Text>
      ))}
    </View>
  );
}
