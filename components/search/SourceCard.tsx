import { Text, View } from "react-native";

import { Colors } from "@/constants/colors";

export interface SourceCardProps {
  title: string;
  url: string;
  content: string;
  relevanceBoost?: string;
}

export function SourceCard({ title, url, content, relevanceBoost }: SourceCardProps) {
  const domain = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  })();

  return (
    <View
      style={{
        backgroundColor: Colors.surfaceElevated,
        borderColor: Colors.border,
        borderRadius: 12,
        borderWidth: 1,
        padding: 12,
        gap: 6,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: Colors.accent, fontSize: 12, fontWeight: "600" }} numberOfLines={1}>
          {domain}
        </Text>
      </View>
      <Text style={{ color: Colors.textPrimary, fontSize: 13, fontWeight: "600" }} numberOfLines={2}>
        {title}
      </Text>
      <Text style={{ color: Colors.textSecondary, fontSize: 12, lineHeight: 17 }} numberOfLines={3}>
        {content}
      </Text>
      {relevanceBoost ? (
        <Text style={{ color: Colors.accent, fontSize: 10, fontWeight: "500" }}>
          {relevanceBoost}
        </Text>
      ) : null}
    </View>
  );
}
