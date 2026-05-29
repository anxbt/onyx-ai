import { Platform } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

const ACCENT = "#2563EB";
const HEADING = "#111827";
const BODY = "#374151";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");
}

/* ------------------------------------------------------------------ */
/*  Professional print CSS (white bg, serif body, clean typography)   */
/* ------------------------------------------------------------------ */
function printStyles(): string {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Merriweather:ital,wght@0,400;0,700;1,400&display=swap');
    
    @page {
      size: letter;
      margin: 72px 72px 72px 72px;
    }
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      background: #FFFFFF;
      color: ${BODY};
      font-family: 'Merriweather', Georgia, 'Times New Roman', serif;
      font-size: 11pt;
      line-height: 1.7;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    
    /* Document header */
    .doc-header {
      margin-bottom: 36pt;
      padding-bottom: 16pt;
      border-bottom: 1.5pt solid ${HEADING};
    }
    .doc-header h1 {
      font-family: 'Inter', -apple-system, sans-serif;
      font-size: 22pt;
      font-weight: 700;
      color: ${HEADING};
      margin-bottom: 8pt;
      letter-spacing: -0.3pt;
      line-height: 1.25;
    }
    .doc-header .subtitle {
      font-family: 'Inter', sans-serif;
      font-size: 12pt;
      font-weight: 400;
      color: ${MUTED};
      margin-bottom: 4pt;
    }
    .doc-header .meta {
      font-family: 'Inter', sans-serif;
      font-size: 9pt;
      color: ${MUTED};
      text-transform: uppercase;
      letter-spacing: 0.5pt;
    }
    
    /* Headings */
    h1, h2, h3, h4, h5, h6 {
      font-family: 'Inter', -apple-system, sans-serif;
      color: ${HEADING};
      page-break-after: avoid;
      orphans: 3;
      widows: 3;
    }
    h1 { font-size: 18pt; font-weight: 700; margin-top: 28pt; margin-bottom: 12pt; line-height: 1.3; }
    h2 { font-size: 14pt; font-weight: 600; margin-top: 24pt; margin-bottom: 10pt; line-height: 1.35; }
    h3 { font-size: 12pt; font-weight: 600; margin-top: 20pt; margin-bottom: 8pt; color: ${BODY}; }
    h4 { font-size: 11pt; font-weight: 600; margin-top: 16pt; margin-bottom: 6pt; color: ${BODY}; }
    h5 { font-size: 10pt; font-weight: 600; margin-top: 14pt; margin-bottom: 4pt; text-transform: uppercase; letter-spacing: 0.5pt; color: ${MUTED}; }
    h6 { font-size: 10pt; font-weight: 500; margin-top: 12pt; margin-bottom: 4pt; color: ${MUTED}; }
    
    /* Body text */
    p.body {
      margin-bottom: 11pt;
      text-align: left;
      orphans: 2;
      widows: 2;
    }
    p.lead {
      font-size: 12pt;
      line-height: 1.65;
      margin-bottom: 16pt;
      color: ${BODY};
    }
    p.caption {
      font-family: 'Inter', sans-serif;
      font-size: 9pt;
      color: ${MUTED};
      margin-top: 4pt;
      margin-bottom: 12pt;
      text-align: left;
    }
    
    /* Lists */
    ul.list, ol.list {
      margin-bottom: 11pt;
      padding-left: 24pt;
    }
    ul.list { list-style-type: disc; }
    ol.list { list-style-type: decimal; }
    li.item {
      margin-bottom: 5pt;
      padding-left: 4pt;
    }
    li.item::marker {
      color: ${HEADING};
    }
    
    /* Blockquotes */
    blockquote.pull {
      margin: 16pt 0;
      padding: 12pt 20pt;
      border-left: 3pt solid ${ACCENT};
      background: #F9FAFB;
      font-style: italic;
      color: ${BODY};
      page-break-inside: avoid;
    }
    blockquote.pull p {
      margin-bottom: 0;
    }
    
    /* Horizontal rules */
    hr {
      border: none;
      border-top: 0.75pt solid ${BORDER};
      margin: 24pt 0;
      page-break-after: avoid;
    }
    
    /* Tables */
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      margin: 14pt 0;
      font-size: 10pt;
      font-family: 'Inter', sans-serif;
      page-break-inside: avoid;
    }
    table.data-table th {
      text-align: left;
      padding: 8pt 10pt;
      border-bottom: 1.5pt solid ${HEADING};
      font-weight: 600;
      color: ${HEADING};
      font-size: 9pt;
      text-transform: uppercase;
      letter-spacing: 0.3pt;
    }
    table.data-table td {
      padding: 7pt 10pt;
      border-bottom: 0.5pt solid ${BORDER};
      color: ${BODY};
      vertical-align: top;
    }
    table.data-table tr:last-child td {
      border-bottom: 1.5pt solid ${HEADING};
    }
    
    /* Code blocks */
    pre.code-block {
      background: #F3F4F6;
      padding: 12pt 14pt;
      margin: 14pt 0;
      overflow-x: auto;
      font-family: 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
      font-size: 9pt;
      line-height: 1.5;
      border-left: 2.5pt solid ${ACCENT};
      border-radius: 0;
      page-break-inside: avoid;
    }
    pre.code-block code {
      background: none;
      padding: 0;
      font-size: inherit;
      color: ${BODY};
    }
    code {
      font-family: 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
      font-size: 9.5pt;
      background: #F3F4F6;
      padding: 1.5pt 4pt;
      color: ${HEADING};
    }
    
    /* Inline emphasis */
    span.highlight {
      color: ${ACCENT};
      font-weight: 600;
    }
    span.meta {
      font-family: 'Inter', sans-serif;
      font-size: 8.5pt;
      color: ${MUTED};
    }
    
    /* Links */
    a {
      color: ${ACCENT};
      text-decoration: none;
      border-bottom: 0.5pt solid ${ACCENT};
    }
    
    /* Utility */
    .two-col {
      column-count: 2;
      column-gap: 24pt;
    }
    strong { font-weight: 700; color: ${HEADING}; }
    em { font-style: italic; }
    
    /* Print-specific */
    @media print {
      body { padding: 0; max-width: none; }
      .doc-header { margin-top: 0; }
    }
  `;
}

/* ------------------------------------------------------------------ */
/*  Wrap raw markdown-converted HTML for PDF export                   */
/* ------------------------------------------------------------------ */
function wrapHtml(content: string, title: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>${printStyles()}</style>
</head>
<body>
  <div class="doc-header">
    <h1>${escapeHtml(title)}</h1>
    <p class="meta">Generated by Closed AI · ${new Date().toLocaleDateString()}</p>
  </div>
  ${content}
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/*  Convert markdown → HTML (regex-based, sufficient for simple docs) */
/* ------------------------------------------------------------------ */
export function markdownToHtml(markdown: string): string {
  return markdown
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) => `<pre class="code-block"><code>${escapeHtml(code.trim())}</code></pre>`)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/^> (.+)$/gm, '<blockquote class="pull"><p class="body">$1</p></blockquote>')
    .replace(/^- (.+)$/gm, '<li class="item">$1</li>')
    .replace(/(<li class="item">.*<\/li>\n?)+/g, '<ul class="list">$&</ul>')
    .replace(/\n\n/g, '</p><p class="body">')
    .replace(/^(.+)$/gm, (line: string) => {
      if (line.startsWith("<")) return line;
      return `<p class="body">${line}</p>`;
    });
}

/* ------------------------------------------------------------------ */
/*  Export a chat message as PDF                                      */
/* ------------------------------------------------------------------ */
export async function exportMessageAsPdf(content: string, title?: string) {
  const html = wrapHtml(markdownToHtml(content), title || "Closed AI Export");

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

/* ------------------------------------------------------------------ */
/*  Wrap AI-generated artifact HTML for PDF export                    */
/* ------------------------------------------------------------------ */
export function wrapPdfHtml(bodyHtml: string, title: string): string {
  // Strip any existing html/head/body/style tags the AI may have added
  const clean = bodyHtml
    .replace(/<html[^>]*>/gi, "")
    .replace(/<\/html>/gi, "")
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
    .replace(/<body[^>]*>/gi, "")
    .replace(/<\/body>/gi, "")
    .replace(/<meta[^>]*>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/style\s*=\s*"[^"]*"/gi, "");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>${printStyles()}</style>
</head>
<body>${clean}</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/*  Export artifact HTML as PDF                                       */
/* ------------------------------------------------------------------ */
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
