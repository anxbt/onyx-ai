import { Pressable, Text, View } from "react-native";

import { Colors } from "@/constants/colors";
import { Typography } from "@/constants/typography";

interface SuggestionChipsProps {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
}

export function SuggestionChips({ suggestions, onSelect }: SuggestionChipsProps) {
  if (!suggestions.length) return null;

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
      {suggestions.map((text, i) => (
        <Pressable
          key={i}
          onPress={() => onSelect(text)}
          style={{
            backgroundColor: Colors.surfaceElevated,
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 4,
          }}
        >
          <Text style={[Typography.uiLabel, { color: Colors.textSecondary }]}>
            {text}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
