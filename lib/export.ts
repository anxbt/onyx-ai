import { Platform } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

const BG = "#0A0A0A";
const TXT = "#ECECED";
const ACCENT = "#7C3AED";
const TXT2 = "#9A9EA4";

function wrapHtml(content: string, title: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: ${BG};
      color: ${TXT};
      font-family: 'IBM Plex Sans', -apple-system, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      padding: 48px 40px 48px 40px;
      max-width: 680px;
    }
    h1 { font-size: 22px; font-weight: 600; margin-bottom: 24px; color: ${TXT}; }
    h2 { font-size: 17px; font-weight: 500; margin-bottom: 12px; color: ${TXT}; margin-top: 48px; }
    h3 { font-size: 15px; font-weight: 600; margin-bottom: 8px; color: ${TXT2}; margin-top: 32px; }
    p { margin-bottom: 14px; }
    code { font-family: 'JetBrains Mono', monospace; font-size: 12px; background: #1a1a1a; padding: 2px 6px; border-radius: 3px; }
    pre { background: #0D0D0D; padding: 14px; border-radius: 8px; margin: 16px 0; overflow-x: auto; font-family: 'JetBrains Mono', monospace; font-size: 12px; line-height: 1.5; border-left: 3px solid ${ACCENT}; }
    blockquote { border-left: 3px solid ${ACCENT}; padding-left: 16px; margin: 16px 0; color: ${TXT2}; }
    ul, ol { padding-left: 20px; margin-bottom: 14px; }
    li { margin-bottom: 4px; }
    a { color: ${ACCENT}; }
    .accent { color: ${ACCENT}; }
    .meta { font-size: 11px; color: ${TXT2}; margin-bottom: 40px; }
    .section-break { margin-top: 56px; }
  </style>
</head>
<body>${content}</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function markdownToHtml(markdown: string): string {
  return markdown
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => `<pre><code>${escapeHtml(code.trim())}</code></pre>`)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(.+)$/gm, (line: string) => {
      if (line.startsWith("<")) return line;
      return `<p>${line}</p>`;
    });
}

export async function exportMessageAsPdf(content: string, title?: string) {
  const html = wrapHtml(markdownToHtml(content), title || "OnyxAI Export");

  if (Platform.OS === "web") {
    const win = window.open("", "_blank");
    if (!win) {
      throw new Error("Popup blocked. Please allow popups for this site.");
    }
    win.document.write(html);
    win.document.close();
    setTimeout(() => {
      win.focus();
      win.print();
    }, 500);
    return;
  }

  const { uri } = await Print.printToFileAsync({ html });
  await Sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    dialogTitle: title || "Export as PDF",
  });
}

export function wrapPdfHtml(bodyHtml: string, title: string): string {
  const clean = bodyHtml
    .replace(/<html[^>]*>/gi, "")
    .replace(/<\/html>/gi, "")
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
    .replace(/<body[^>]*>/gi, "")
    .replace(/<\/body>/gi, "")
    .replace(/<meta[^>]*>/gi, "");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: ${BG};
      color: ${TXT};
      font-family: 'IBM Plex Sans', -apple-system, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      padding: 48px 40px 48px 40px;
      max-width: 680px;
    }
    h1 { font-size: 22px; font-weight: 600; margin-bottom: 16px; color: ${TXT}; }
    h2 { font-size: 17px; font-weight: 500; margin-bottom: 10px; color: ${TXT}; margin-top: 40px; }
    h3 { font-size: 14px; font-weight: 600; margin-bottom: 6px; color: ${TXT2}; margin-top: 24px; }
    p { margin-bottom: 10px; }
    code { font-family: 'JetBrains Mono', monospace; font-size: 12px; background: #1a1a1a; padding: 2px 6px; border-radius: 3px; color: ${ACCENT}; }
    pre { background: #0D0D0D; padding: 14px; border-radius: 8px; margin: 12px 0; overflow-x: auto; font-family: 'JetBrains Mono', monospace; font-size: 12px; line-height: 1.5; border-left: 3px solid ${ACCENT}; }
    blockquote { border-left: 3px solid ${ACCENT}; padding-left: 16px; margin: 12px 0; color: ${TXT2}; }
    ul, ol { padding-left: 20px; margin-bottom: 10px; }
    li { margin-bottom: 3px; }
    a { color: ${ACCENT}; }
    table { border-collapse: collapse; width: 100%; margin: 10px 0; }
    td, th { padding: 6px 10px; text-align: left; border-bottom: 1px solid #2A2A2A; font-size: 13px; }
    th { color: ${TXT2}; font-weight: 600; font-size: 12px; }
    .accent { color: ${ACCENT}; }
    .flex-row { display: flex; flex-direction: row; gap: 8px; align-items: center; flex-wrap: wrap; }
    .card { background: #141414; border: 1px solid #2A2A2A; border-radius: 10px; padding: 12px; margin-bottom: 8px; }
    .pill { display: inline-block; background: #1A1A1A; border: 1px solid #2A2A2A; padding: 4px 12px; border-radius: 16px; font-size: 13px; }
    .bar-bg { background: #1A1A1A; border-radius: 4px; height: 10px; margin: 4px 0; }
    .bar-fill { background: ${ACCENT}; border-radius: 4px; height: 10px; }
    .node { margin-left: 16px; padding: 4px 0; border-left: 1px solid #2A2A2A; padding-left: 12px; }
    .node-root { border-left: none; margin-left: 0; padding-left: 0; }
    .node-label { font-weight: 600; font-size: 13px; color: ${TXT}; }
    .node-detail { font-size: 12px; color: ${TXT2}; margin-top: 2px; }
    .section-break { margin-top: 48px; }
    @page { margin: 0; }
  </style>
</head>
<body>${clean}</body>
</html>`;
}

export async function exportHtmlAsPdf(html: string, title: string) {
  const wrapped = wrapPdfHtml(html, title);

  if (Platform.OS === "web") {
    const win = window.open("", "_blank");
    if (!win) {
      throw new Error("Popup blocked. Please allow popups for this site.");
    }
    win.document.write(wrapped);
    win.document.close();
    setTimeout(() => {
      win.focus();
      win.print();
    }, 500);
    return;
  }

  const { uri } = await Print.printToFileAsync({ html: wrapped });
  await Sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    dialogTitle: title,
  });
}
