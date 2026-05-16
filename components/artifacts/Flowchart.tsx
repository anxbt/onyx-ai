import React from "react";
import { View } from "react-native";
import WebView from "react-native-webview";

interface FlowchartProps {
  data: string;
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function Flowchart({ data }: FlowchartProps) {
  const mermaidSrc = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=3, user-scalable=yes">
      <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
      <style>
        * { margin: 0; padding: 0; }
        body { 
          background: transparent;
          display: flex; 
          justify-content: center; 
          align-items: flex-start;
          min-height: 100%;
          padding: 8px 0;
        }
      </style>
    </head>
    <body>
      <div class="mermaid" style="width: 100%; max-width: 800px;">
${escapeHtml(data)}
      </div>
      <script>
        mermaid.initialize({
          theme: 'dark',
          startOnLoad: true,
          securityLevel: 'loose',
          flowchart: { useMaxWidth: false },
          themeVariables: {
            primaryColor: '#2A2118',
            primaryTextColor: '#e6e0e9',
            primaryBorderColor: '#D4A574',
            lineColor: '#D4A574',
            secondaryColor: '#1d2024',
            secondaryTextColor: '#cbc4d2',
            tertiaryColor: '#15171a',
            tertiaryTextColor: '#948e9c',
            background: '#141218',
            mainBkg: '#15171a',
            nodeBorder: '#D4A574',
            clusterBkg: '#1d2024',
            titleColor: '#e6e0e9',
            edgeLabelBackground: 'transparent',
          }
        });
      </script>
    </body>
    </html>
  `;

  return (
    <View style={{ minHeight: 300, maxHeight: 600, marginVertical: 12 }}>
      <WebView
        source={{ html: mermaidSrc }}
        style={{ backgroundColor: "transparent" }}
        scrollEnabled
        scalesPageToFit
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
