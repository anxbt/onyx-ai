import React from "react";
import { Text, View } from "react-native";

import { Colors } from "@/constants/colors";
import { DESIGN_TOKENS, wrapHtml } from "./HtmlArtifact.shared";

interface HtmlArtifactProps {
  html: string;
}

export { DESIGN_TOKENS, wrapHtml };

export function HtmlArtifact({ html }: HtmlArtifactProps) {
  const fullHtml = wrapHtml(html);

  return (
    <View style={{ height: 400 }}>
      {/* @ts-ignore — iframe is valid on web */}
      <iframe
        srcDoc={fullHtml}
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          backgroundColor: "transparent",
        }}
        sandbox="allow-scripts"
      />
    </View>
  );
}
