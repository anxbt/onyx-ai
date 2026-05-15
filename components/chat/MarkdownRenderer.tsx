import React, { useMemo } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Markdown, { type RenderRules } from "react-native-markdown-display";
import * as WebBrowser from "expo-web-browser";

import { Colors } from "@/constants/colors";
import { CodeBlock } from "@/components/chat/CodeBlock";
import {
  extractMath,
  isMathPlaceholder,
  parsePlaceholderIndex,
  streamingSafeContent,
} from "@/lib/markdown";
import { Roadmap } from "@/components/artifacts/Roadmap";
import { Flowchart } from "@/components/artifacts/Flowchart";
import { Chart } from "@/components/artifacts/Chart";
import { HtmlArtifact } from "@/components/artifacts/HtmlArtifact";
import { PdfCard } from "@/components/artifacts/PdfCard";

function extractDataAttr(html: string, attr: string): string | undefined {
  const re = new RegExp(`${attr}\\s*=\\s*"([^"]*)"`, "i");
  const m = html.slice(0, 300).match(re);
  return m ? m[1] : undefined;
}

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Link handling                                                       */
/* ------------------------------------------------------------------ */
function openLink(url: string) {
  if (!url) return;
  WebBrowser.openBrowserAsync(url, {
    toolbarColor: Colors.background,
    controlsColor: Colors.accent,
  }).catch(() => {
    // Fallback silently
  });
}

/* ------------------------------------------------------------------ */
/*  Markdown styles (dark theme)                                        */
/* ------------------------------------------------------------------ */
const markdownStyles = StyleSheet.create({
  body: {
    color: Colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: 10,
    color: Colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
  },
  text: {
    color: Colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
  },
  heading1: {
    color: Colors.textPrimary,
    fontSize: 24,
    fontWeight: "800",
    marginTop: 18,
    marginBottom: 10,
    lineHeight: 30,
  },
  heading2: {
    color: Colors.textPrimary,
    fontSize: 20,
    fontWeight: "700",
    marginTop: 16,
    marginBottom: 8,
    lineHeight: 26,
  },
  heading3: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: "700",
    marginTop: 14,
    marginBottom: 6,
    lineHeight: 24,
  },
  heading4: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: "700",
    marginTop: 12,
    marginBottom: 4,
    lineHeight: 22,
  },
  heading5: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 10,
    marginBottom: 4,
    lineHeight: 20,
  },
  heading6: {
    color: Colors.textTertiary,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 8,
    marginBottom: 4,
    lineHeight: 18,
  },
  bullet_list: {
    marginVertical: 6,
  },
  ordered_list: {
    marginVertical: 6,
  },
  list_item: {
    flexDirection: "row",
    marginVertical: 3,
  },
  bullet_list_icon: {
    color: Colors.accent,
    fontSize: 15,
    lineHeight: 22,
    marginRight: 8,
    marginLeft: 4,
  },
  ordered_list_icon: {
    color: Colors.accent,
    fontSize: 15,
    lineHeight: 22,
    marginRight: 8,
    marginLeft: 4,
    fontVariant: ["tabular-nums"],
  },
  code_inline: {
    backgroundColor: Colors.inlineCodeBackground,
    color: Colors.codeText,
    fontSize: 13,
    lineHeight: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  code_block: {
    display: "none", // we render via custom fence rule
  },
  fence: {
    display: "none", // we render via custom fence rule
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.blockquoteBorder,
    backgroundColor: Colors.blockquoteBackground,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginVertical: 8,
    borderRadius: 4,
  },
  hr: {
    backgroundColor: Colors.border,
    height: 1,
    marginVertical: 14,
  },
  strong: {
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  em: {
    fontStyle: "italic",
    color: Colors.textSecondary,
  },
  s: {
    textDecorationLine: "line-through",
    color: Colors.textTertiary,
  },
  link: {
    color: Colors.linkColor,
    textDecorationLine: "underline",
  },
  table: {
    borderWidth: 1,
    borderColor: Colors.tableBorder,
    marginVertical: 10,
    borderRadius: 8,
    overflow: "hidden",
  },
  thead: {
    backgroundColor: Colors.tableHeaderBackground,
  },
  th: {
    padding: 10,
    borderBottomWidth: 1,
    borderColor: Colors.tableBorder,
    color: Colors.textPrimary,
    fontWeight: "700",
    fontSize: 13,
  },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: Colors.tableBorder,
  },
  td: {
    padding: 10,
    color: Colors.textSecondary,
    fontSize: 13,
    flex: 1,
  },
  // Math
  math: {
    color: Colors.mathColor,
    fontSize: 15,
    lineHeight: 22,
    fontStyle: "italic",
  },
  mathBlock: {
    color: Colors.mathColor,
    fontSize: 16,
    lineHeight: 24,
    fontStyle: "italic",
    textAlign: "center",
    marginVertical: 10,
    paddingHorizontal: 8,
  },
});

/* ------------------------------------------------------------------ */
/*  Custom render rules                                                 */
/* ------------------------------------------------------------------ */
function createCustomRules(
  placeholders: ReturnType<typeof extractMath>["placeholders"]
): RenderRules {
  return {
    // Code blocks (fenced) — includes artifact detection
    fence: (node) => {
      const info = (node as any).sourceInfo || (node as any).info || "";
      const code = node.content || "";
      const lang = info.trim().toLowerCase();

      if (lang === "roadmap") {
        return <Roadmap key={node.key} data={code} />;
      }
      if (lang === "flowchart") {
        return <Flowchart key={node.key} data={code} />;
      }
      if (lang === "chart") {
        return <Chart key={node.key} data={code} />;
      }
      if (lang === "html") {
        const dataType = extractDataAttr(code, "data-type");
        const dataTitle = extractDataAttr(code, "data-title");
        if (dataType === "pdf") {
          return <PdfCard key={node.key} html={code} title={dataTitle} />;
        }
        return <HtmlArtifact key={node.key} html={code} />;
      }

      return (
        <View key={node.key}>
          <CodeBlock code={code} language={info} />
        </View>
      );
    },

    // Inline code
    code_inline: (node, _children, _parent, styles) => {
      return (
        <Text
          key={node.key}
          style={styles.code_inline}
          selectable={Platform.OS !== "ios"}
        >
          {node.content}
        </Text>
      );
    },

    // Links → open in in-app browser
    link: (node, children, _parent, styles) => {
      const href =
        node.attributes?.href ||
        (node as unknown as Record<string, string>).href ||
        "";
      return (
        <Text
          key={node.key}
          style={styles.link}
          onPress={() => openLink(href)}
          selectable={Platform.OS !== "ios"}
        >
          {children}
        </Text>
      );
    },

    // Math placeholders (split mixed text)
    text: (node, _children, _parent, styles) => {
      const text = node.content || "";
      const parts = text.split(/(__MATH_\d+__)/g);
      if (parts.length === 1 && !isMathPlaceholder(text)) {
        return (
          <Text
            key={node.key}
            style={styles.text}
            selectable={Platform.OS !== "ios"}
          >
            {text}
          </Text>
        );
      }
      return (
        <Text key={node.key} selectable={Platform.OS !== "ios"}>
          {parts.map((part, i) => {
            if (isMathPlaceholder(part)) {
              const idx = parsePlaceholderIndex(part);
              const math = placeholders[idx];
              if (math) {
                return (
                  <Text
                    key={`${node.key}-math-${i}`}
                    style={math.display ? styles.mathBlock : styles.math}
                  >
                    {math.display ? `  ${math.raw}  ` : math.raw}
                  </Text>
                );
              }
              return <Text key={`${node.key}-math-${i}`}>{part}</Text>;
            }
            return (
              <Text key={`${node.key}-txt-${i}`} style={styles.text}>
                {part}
              </Text>
            );
          })}
        </Text>
      );
    },

    // Blockquote
    blockquote: (node, children, _parent, styles) => {
      return (
        <View key={node.key} style={styles.blockquote}>
          {children}
        </View>
      );
    },

    // Horizontal rule
    hr: (node, _children, _parent, styles) => {
      return <View key={node.key} style={styles.hr} />;
    },

    // Headings (wrap in View for spacing)
    heading1: (node, children, _parent, styles) => (
      <View key={node.key} style={{ marginTop: 4 }}>
        <Text style={styles.heading1} selectable={Platform.OS !== "ios"}>
          {children}
        </Text>
      </View>
    ),
    heading2: (node, children, _parent, styles) => (
      <View key={node.key} style={{ marginTop: 4 }}>
        <Text style={styles.heading2} selectable={Platform.OS !== "ios"}>
          {children}
        </Text>
      </View>
    ),
    heading3: (node, children, _parent, styles) => (
      <View key={node.key} style={{ marginTop: 4 }}>
        <Text style={styles.heading3} selectable={Platform.OS !== "ios"}>
          {children}
        </Text>
      </View>
    ),
    heading4: (node, children, _parent, styles) => (
      <View key={node.key} style={{ marginTop: 4 }}>
        <Text style={styles.heading4} selectable={Platform.OS !== "ios"}>
          {children}
        </Text>
      </View>
    ),
    heading5: (node, children, _parent, styles) => (
      <View key={node.key} style={{ marginTop: 4 }}>
        <Text style={styles.heading5} selectable={Platform.OS !== "ios"}>
          {children}
        </Text>
      </View>
    ),
    heading6: (node, children, _parent, styles) => (
      <View key={node.key} style={{ marginTop: 4 }}>
        <Text style={styles.heading6} selectable={Platform.OS !== "ios"}>
          {children}
        </Text>
      </View>
    ),

    // Lists
    bullet_list: (node, children, _parent, styles) => (
      <View key={node.key} style={styles.bullet_list}>
        {children}
      </View>
    ),
    ordered_list: (node, children, _parent, styles) => (
      <View key={node.key} style={styles.ordered_list}>
        {children}
      </View>
    ),
    list_item: (node, children, _parent, styles) => (
      <View key={node.key} style={styles.list_item}>
        {children}
      </View>
    ),

    // Paragraph
    paragraph: (node, children, _parent, styles) => (
      <View key={node.key} style={{ marginBottom: 8 }}>
        <Text style={styles.paragraph} selectable={Platform.OS !== "ios"}>
          {children}
        </Text>
      </View>
    ),

    // Table
    table: (node, children, _parent, styles) => (
      <View key={node.key} style={styles.table}>
        {children}
      </View>
    ),
    thead: (node, children, _parent, styles) => (
      <View key={node.key} style={styles.thead}>
        {children}
      </View>
    ),
    tbody: (node, children) => <View key={node.key}>{children}</View>,
    tr: (node, children, _parent, styles) => (
      <View key={node.key} style={styles.tr}>
        {children}
      </View>
    ),
    th: (node, children, _parent, styles) => (
      <View key={node.key} style={{ flex: 1 }}>
        <Text style={styles.th} selectable={Platform.OS !== "ios"}>
          {children}
        </Text>
      </View>
    ),
    td: (node, children, _parent, styles) => (
      <View key={node.key} style={{ flex: 1 }}>
        <Text style={styles.td} selectable={Platform.OS !== "ios"}>
          {children}
        </Text>
      </View>
    ),
  };
}

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */
export function MarkdownRenderer({ content, isStreaming }: MarkdownRendererProps) {
  const { cleaned, placeholders } = useMemo(() => extractMath(content), [content]);

  const safeContent = useMemo(() => {
    if (isStreaming) {
      return streamingSafeContent(cleaned);
    }
    return cleaned;
  }, [cleaned, isStreaming]);

  const rules = useMemo(() => createCustomRules(placeholders), [placeholders]);

  return (
    <View style={{ flex: 1 }}>
      <Markdown style={markdownStyles} rules={rules}>
        {safeContent}
      </Markdown>
    </View>
  );
}
