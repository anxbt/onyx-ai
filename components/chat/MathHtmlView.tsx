import { useState } from "react";
import { Text, View } from "react-native";
import { WebView } from "react-native-webview";

import { Colors } from "@/constants/colors";

interface MathHtmlViewProps {
  // Marker-stripped markdown content (may contain LaTeX math + code fences).
  content: string;
}

// Extract math BEFORE markdown so markdown can't corrupt the LaTeX. Done in
// TypeScript (single-layer escaping — safe) rather than inside the WebView's
// JS string (which would be triple-escaped). Returns prose-with-tokens plus
// the pulled-out math; the WebView re-renders each token with KaTeX.
function prepareContent(content: string): {
  text: string;
  maths: { tex: string; display: boolean }[];
} {
  let raw = content;
  // Normalize AMS delimiters to $ / $$ so one extraction pass covers all four.
  raw = raw.replace(/\\\[([\s\S]*?)\\\]/g, (_m, m) => `$$${m}$$`);
  raw = raw.replace(/\\\(([\s\S]*?)\\\)/g, (_m, m) => `$${m}$`);

  const maths: { tex: string; display: boolean }[] = [];
  // Display math first.
  raw = raw.replace(/\$\$([\s\S]*?)\$\$/g, (_m, m) => {
    maths.push({ tex: m, display: true });
    return `@@MATH${maths.length - 1}@@`;
  });
  // Inline: require non-space just inside the $…$ so we don't match currency.
  raw = raw.replace(/\$(?=\S)([^\n$]*?\S)\$/g, (_m, m) => {
    maths.push({ tex: m, display: false });
    return `@@MATH${maths.length - 1}@@`;
  });

  return { text: raw, maths };
}

function buildHtml(content: string): string {
  const { text, maths } = prepareContent(content);
  const textJson = JSON.stringify(text);
  const mathsJson = JSON.stringify(maths);
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github-dark.min.css" />
<style>
  html, body { margin: 0; padding: 0; background: transparent; }
  body { color: ${Colors.textPrimary}; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 16px; line-height: 1.55; word-wrap: break-word; overflow-wrap: anywhere; }
  a { color: ${Colors.primary}; text-decoration: none; }
  pre { background: ${Colors.surface}; border: 1px solid ${Colors.borderHairline}; border-radius: 8px; padding: 12px; overflow-x: auto; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 14px; }
  :not(pre) > code { background: ${Colors.surface}; padding: 1px 5px; border-radius: 4px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid ${Colors.borderHairline}; padding: 6px 10px; text-align: left; }
  blockquote { border-left: 3px solid ${Colors.borderHairline}; margin: 8px 0; padding-left: 12px; color: ${Colors.textSecondary}; }
  .katex { font-size: 1.05em; }
  .katex-display { overflow-x: auto; overflow-y: hidden; padding: 4px 0; }
  h1,h2,h3 { line-height: 1.3; }
</style>
</head>
<body>
<div id="content"></div>
<script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
<script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/highlight.min.js"></script>
<script>
  var TEXT = ${textJson};
  var MATHS = ${mathsJson};

  function postHeight() {
    try {
      var h = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight
      );
      window.ReactNativeWebView.postMessage(String(h + 8));
    } catch (e) {}
  }

  function render() {
    var el = document.getElementById("content");
    try {
      var html = window.marked ? marked.parse(TEXT) : TEXT;
      html = html.replace(/@@MATH(\\d+)@@/g, function (_m, i) {
        var it = MATHS[+i];
        if (!it) return "";
        try { return katex.renderToString(it.tex, { displayMode: it.display, throwOnError: false }); }
        catch (e) { return it.tex; }
      });
      el.innerHTML = html;
      if (window.hljs) {
        el.querySelectorAll("pre code").forEach(function (b) { try { hljs.highlightElement(b); } catch (e) {} });
      }
    } catch (e) {
      el.textContent = TEXT;
    }
    postHeight();
    setTimeout(postHeight, 300);
    setTimeout(postHeight, 900);
    // KaTeX webfonts load after first paint and grow the layout — re-measure
    // when they're ready so the last line (e.g. the boxed answer) isn't clipped.
    try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(postHeight); } catch (e) {}
    // And re-measure on any later layout change (reflow, late images).
    try { if (window.ResizeObserver) new ResizeObserver(postHeight).observe(document.body); } catch (e) {}
  }

  window.addEventListener("load", render);
</script>
</body>
</html>`;
}

export function MathHtmlView({ content }: MathHtmlViewProps) {
  const [height, setHeight] = useState(40);
  const [failed, setFailed] = useState(false);

  // Crash-proof fallback: if the WebView errors, show raw text rather than
  // taking down the message.
  if (failed) {
    return (
      <Text selectable style={{ color: Colors.textPrimary, fontSize: 16, lineHeight: 24 }}>
        {content}
      </Text>
    );
  }

  return (
    <View style={{ height, width: "100%" }}>
      <WebView
        source={{ html: buildHtml(content) }}
        style={{ height, backgroundColor: "transparent" }}
        scrollEnabled={false}
        originWhitelist={["*"]}
        javaScriptEnabled={true}
        showsVerticalScrollIndicator={false}
        // Allow initial html load + CDN https subresources (on iOS this fires
        // for subresources, so https must be allowed or KaTeX/marked won't load).
        onShouldStartLoadWithRequest={(req) => {
          const url = req.url || "";
          return (
            url === "about:blank" ||
            url === "" ||
            url.startsWith("data:") ||
            url.startsWith("https://")
          );
        }}
        onMessage={(e) => {
          const h = parseInt(e.nativeEvent.data, 10);
          if (!Number.isNaN(h) && h > 0) setHeight(h);
        }}
        onError={() => setFailed(true)}
        onRenderProcessGone={() => setFailed(true)}
      />
    </View>
  );
}
