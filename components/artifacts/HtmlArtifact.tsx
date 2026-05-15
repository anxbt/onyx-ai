import React from "react";
import { Text, View } from "react-native";

import { Colors } from "@/constants/colors";

interface HtmlArtifactProps {
  html: string;
}

export const DESIGN_TOKENS = `
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0A0A0A;
    color: #ECECED;
    font-family: -apple-system, 'IBM Plex Sans', sans-serif;
    font-size: 14px;
    line-height: 1.5;
    padding: 8px;
    -webkit-text-size-adjust: 100%;
  }
  h1 { font-size: 18px; font-weight: 600; margin-bottom: 12px; color: #ECECED; }
  h2 { font-size: 15px; font-weight: 500; margin-top: 24px; margin-bottom: 8px; color: #ECECED; }
  h3 { font-size: 13px; font-weight: 600; margin-bottom: 6px; color: #9A9EA4; }
  p { margin-bottom: 8px; }
  code { font-family: monospace; font-size: 12px; background: #1A1A1A; padding: 2px 5px; border-radius: 3px; color: #7C3AED; }
  pre { background: #1A1A1A; padding: 10px; border-radius: 6px; overflow-x: auto; font-size: 12px; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; }
  td, th { padding: 6px 10px; text-align: left; border-bottom: 1px solid #2A2A2A; color: #ECECED; font-size: 13px; }
  th { color: #9A9EA4; font-weight: 600; font-size: 12px; }
  ul, ol { padding-left: 18px; margin-bottom: 8px; }
  li { margin-bottom: 3px; }
  blockquote { border-left: 2px solid #7C3AED; padding-left: 12px; margin: 8px 0; color: #9A9EA4; }
  a { color: #7C3AED; }
  .accent { color: #7C3AED; }
  .flex-row { display: flex; flex-direction: row; gap: 8px; align-items: center; flex-wrap: wrap; }
  .card { background: #141414; border: 1px solid #2A2A2A; border-radius: 10px; padding: 12px; margin-bottom: 8px; }
  .pill { display: inline-block; background: #1A1A1A; border: 1px solid #2A2A2A; padding: 4px 12px; border-radius: 16px; color: #ECECED; font-size: 13px; }
  .pill-active { background: #7C3AED; border-color: #7C3AED; }
  .bar-bg { background: #1A1A1A; border-radius: 4px; height: 12px; margin: 4px 0; }
  .bar-fill { background: #7C3AED; border-radius: 4px; height: 12px; }
  .node { margin-left: 16px; padding: 4px 0; border-left: 1px solid #2A2A2A; padding-left: 12px; }
  .node-root { border-left: none; margin-left: 0; padding-left: 0; }
  .node-label { font-weight: 600; font-size: 13px; color: #ECECED; }
  .node-detail { font-size: 12px; color: #9A9EA4; margin-top: 2px; }
  .section-break { margin-top: 32px; }
</style>`;

export function wrapHtml(inner: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  ${DESIGN_TOKENS}
</head>
<body>${inner}</body>
</html>`;
}

export function HtmlArtifact({ html }: HtmlArtifactProps) {
  const fullHtml = wrapHtml(html);

  return (
    <View
      style={{
        backgroundColor: Colors.surfaceElevated,
        borderColor: Colors.border,
        borderRadius: 12,
        borderWidth: 1,
        overflow: "hidden",
        marginVertical: 6,
        height: 400,
      }}
    >
      {/* @ts-ignore — iframe is valid on web */}
      <iframe
        srcDoc={fullHtml}
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          backgroundColor: "#0A0A0A",
        }}
        sandbox="allow-scripts"
      />
    </View>
  );
}
