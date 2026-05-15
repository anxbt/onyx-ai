import React, { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { Colors } from "@/constants/colors";
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
        borderColor: "#7C3AED",
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
          <Text style={{ color: Colors.textPrimary, fontSize: 15, fontWeight: "600" }}>
            {title || "Document"}
          </Text>
          <Text style={{ color: Colors.textTertiary, fontSize: 12, marginTop: 2 }}>
            PDF document
          </Text>
        </View>
      </View>
      <Pressable
        onPress={handleDownload}
        disabled={loading}
        style={{
          backgroundColor: "#7C3AED",
          borderRadius: 10,
          paddingVertical: 10,
          alignItems: "center",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "600" }}>
            Download PDF
          </Text>
        )}
      </Pressable>
    </View>
  );
}
