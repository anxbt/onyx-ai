import React, { useRef, useState } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";

import { Colors } from "@/constants/colors";
import { wrapHtml } from "./HtmlArtifact.shared";

interface HtmlArtifactProps {
  html: string;
}

export { DESIGN_TOKENS } from "./HtmlArtifact.shared";

export function HtmlArtifact({ html }: HtmlArtifactProps) {
  const [webHeight, setWebHeight] = useState(120);
  const initialHtml = useRef(wrapHtml(html)).current;

  const injectedJS = `
    setTimeout(function() {
      var h = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.offsetHeight
      );
      window.ReactNativeWebView.postMessage(String(h + 16));
    }, 50);
    true;
  `;

  return (
    <View
      style={{
        backgroundColor: Colors.surfaceElevated,
        borderColor: Colors.border,
        borderRadius: 12,
        borderWidth: 1,
        overflow: "hidden",
        marginVertical: 6,
      }}
    >
      <WebView
        source={{ html: initialHtml }}
        style={{ height: webHeight, backgroundColor: "transparent" }}
        scrollEnabled={false}
        originWhitelist={["*"]}
        javaScriptEnabled={true}
        allowsInlineMediaPlayback={false}
        onShouldStartLoadWithRequest={(req) => req.url === "about:blank"}
        onMessage={(event) => {
          const h = parseInt(event.nativeEvent.data, 10);
          if (h > 0 && h !== webHeight) setWebHeight(h);
        }}
        injectedJavaScript={injectedJS}
      />
    </View>
  );
}
