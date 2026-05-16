import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { Colors } from "@/constants/colors";
import { Spacing } from "@/constants/spacing";
import { Typography } from "@/constants/typography";
import { exportHtmlAsPdf } from "@/lib/export";

interface PdfCardProps {
  html: string;
  title?: string;
}

export function PdfCard({ html, title }: PdfCardProps) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      await exportHtmlAsPdf(html, title || "Document");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Ionicons name="document-outline" size={20} color={Colors.textSecondary} />
        <View style={{ flex: 1 }}>
          <Text style={[Typography.uiMedium, { color: Colors.textPrimary }]}>
            {title || "Document"}
          </Text>
          <Text style={[Typography.uiLabel, { color: Colors.textTertiary }]}>
            PDF
          </Text>
        </View>
      </View>
      <Pressable
        onPress={handleDownload}
        disabled={loading}
        style={{
          backgroundColor: Colors.primary,
          borderRadius: Spacing.radius.button,
          paddingVertical: 10,
          paddingHorizontal: 16,
          alignSelf: "flex-start",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? (
          <ActivityIndicator color={Colors.onPrimary} size="small" />
        ) : (
          <Text style={[Typography.uiMedium, { color: Colors.onPrimary }]}>
            Download
          </Text>
        )}
      </Pressable>
    </View>
  );
}
