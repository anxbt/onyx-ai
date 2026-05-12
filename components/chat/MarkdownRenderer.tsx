import { Text } from "react-native";

import { Colors } from "@/constants/colors";

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <Text style={{ color: Colors.textPrimary, fontSize: 15, lineHeight: 22 }}>
      {content}
    </Text>
  );
}

