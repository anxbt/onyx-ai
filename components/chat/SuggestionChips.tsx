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
            backgroundColor: Colors.surfaceContainer,
            borderWidth: 1,
            borderColor: Colors.borderHairline,
            paddingHorizontal: 14,
            paddingVertical: 6,
            borderRadius: 20,
          }}
        >
          <Text style={[Typography.uiLabel, { color: Colors.textSecondary, fontSize: 11 }]}>
            {text}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
