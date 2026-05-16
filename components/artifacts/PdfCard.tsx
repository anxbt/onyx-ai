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
    <View
      style={{
        backgroundColor: Colors.surfaceElevated,
        borderColor: Colors.primary,
        borderRadius: 12,
        borderWidth: 1,
        padding: 16,
        gap: 12,
        marginVertical: 6,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Text style={{ fontSize: 20 }}>📄</Text>
        <View style={{ flex: 1 }}>
          <Text style={[Typography.bodyProseBold, { color: Colors.textPrimary, flex: 1 }]}>
            {title || "Document"}
          </Text>
          <Text style={[Typography.uiLabel, { color: Colors.textTertiary, marginTop: 2 }]}>
            PDF document
          </Text>
        </View>
      </View>
      <Pressable
        onPress={handleDownload}
        disabled={loading}
        style={{
          backgroundColor: Colors.primaryContainer,
          borderRadius: Spacing.radius.button,
          paddingVertical: 10,
          alignItems: "center",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? (
          <ActivityIndicator color={Colors.textPrimary} size="small" />
        ) : (
          <Text style={[Typography.uiMedium, { color: Colors.onPrimaryContainer }]}>
            Download PDF
          </Text>
        )}
      </Pressable>
    </View>
  );
}
