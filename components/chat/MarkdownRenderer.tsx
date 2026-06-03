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
import { Typography } from "@/constants/typography";
import { CodeBlock } from "@/components/chat/CodeBlock";
import {
  extractMath,
  isMathPlaceholder,
  MATH_PLACEHOLDER_SPLIT_REGEX,
  parsePlaceholderIndex,
  streamingSafeContent,
} from "@/lib/markdown";
import { Roadmap } from "@/components/artifacts/Roadmap";
import { Flowchart } from "@/components/artifacts/Flowchart";
import { Chart } from "@/components/artifacts/Chart";
import { HtmlArtifact } from "@/components/artifacts/HtmlArtifact";
import { PdfCard } from "@/components/artifacts/PdfCard";
import type { Source } from "@/types";

function extractDataAttr(html: string, attr: string): string | undefined {
  const re = new RegExp(`${attr}\\s*=\\s*"([^"]*)"`, "i");
  const m = html.slice(0, 300).match(re);
  return m ? m[1] : undefined;
}

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
  sources?: Source[];
}

/* ------------------------------------------------------------------ */
/*  Link handling                                                       */
/* ------------------------------------------------------------------ */
function openLink(url: string) {
  if (!url) return;
  WebBrowser.openBrowserAsync(url, {
    toolbarColor: Colors.background,
    controlsColor: Colors.primary,
  }).catch(() => {
    // Fallback silently
  });
}

/* ------------------------------------------------------------------ */
/*  Markdown styles (dark theme)                                        */
/* ------------------------------------------------------------------ */
const markdownStyles = StyleSheet.create({
  body: {
    ...Typography.bodyProse,
    lineHeight: 20,
    includeFontPadding: false,
    paddingVertical: 0,
    color: Colors.textPrimary,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: 0,
    ...Typography.bodyProse,
    lineHeight: 20,
    includeFontPadding: false,
    paddingVertical: 0,
    color: Colors.textPrimary,
  },
  text: {
    ...Typography.bodyProse,
    lineHeight: 20,
    includeFontPadding: false,
    paddingVertical: 0,
    color: Colors.textPrimary,
  },
  heading1: {
    ...Typography.displayLg,
    marginTop: 24,
    marginBottom: 12,
    color: Colors.textPrimary,
  },
  heading2: {
    fontFamily: Typography.displayLg.fontFamily,
    fontSize: 18,
    fontWeight: "700",
    marginTop: 20,
    marginBottom: 10,
    lineHeight: 24,
    color: Colors.textPrimary,
  },
  heading3: {
    fontFamily: Typography.uiMedium.fontFamily,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 16,
    marginBottom: 8,
    lineHeight: 22,
    color: Colors.textPrimary,
  },
  heading4: {
    fontFamily: Typography.uiMedium.fontFamily,
    fontSize: 15,
    fontWeight: "700",
    marginTop: 14,
    marginBottom: 6,
    lineHeight: 22,
    color: Colors.textSecondary,
  },
  heading5: {
    fontFamily: Typography.uiMedium.fontFamily,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 10,
    marginBottom: 4,
    lineHeight: 20,
    color: Colors.textSecondary,
  },
  heading6: {
    fontFamily: Typography.uiLabel.fontFamily,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 8,
    marginBottom: 4,
    lineHeight: 18,
    color: Colors.textTertiary,
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
    color: Colors.primary,
    ...Typography.bodyProse,
    marginRight: 8,
    marginLeft: 4,
  },
  ordered_list_icon: {
    color: Colors.primary,
    ...Typography.bodyProse,
    marginRight: 8,
    marginLeft: 4,
    fontVariant: ["tabular-nums"],
  },
  code_inline: {
    backgroundColor: Colors.inlineCodeBackground,
    color: Colors.codeText,
    ...Typography.codeBlock,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  code_block: {
    display: "none",
  },
  fence: {
    display: "none",
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.blockquoteBorder,
    backgroundColor: Colors.blockquoteBackground,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginVertical: 8,
  },
  hr: {
    backgroundColor: Colors.borderHairline,
    height: 1,
    marginVertical: 14,
  },
  strong: {
    fontFamily: Typography.bodyProseBold.fontFamily,
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
    ...Typography.uiLabel,
    color: Colors.textPrimary,
  },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: Colors.tableBorder,
  },
  td: {
    padding: 10,
    ...Typography.uiLabel,
    color: Colors.textSecondary,
    flex: 1,
  },
  math: {
    color: Colors.mathColor,
    ...Typography.bodyProse,
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
  placeholders: ReturnType<typeof extractMath>["placeholders"],
  sources?: Source[],
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

    // Text with math placeholders + inline citation pills
    text: (node, _children, _parent, styles) => {
      const text = node.content || "";
      // Use the shared regex from lib/markdown.ts so the format stays in sync
      // with extractMath's prefix/suffix. NOTE: String.prototype.split with a
      // global RegExp can be stateful in some engines; clone via .source/.flags
      // to get a fresh stateless instance per call.
      const splitRegex = new RegExp(
        MATH_PLACEHOLDER_SPLIT_REGEX.source,
        MATH_PLACEHOLDER_SPLIT_REGEX.flags,
      );
      const parts = text.split(splitRegex);

      const renderWithCitations = (segment: string, baseKey: string) => {
        // Split on [1], [2], [3] inline citation markers
        const tokens = segment.split(/(\[\d+\])/g);
        if (tokens.length === 1) {
          return (
            <Text key={baseKey} style={styles.text}>
              {segment}
            </Text>
          );
        }
        return tokens.map((token, j) => {
          const m = token.match(/^\[(\d+)\]$/);
          if (m) {
            const n = Number.parseInt(m[1], 10);
            const source = sources?.[n - 1];
            if (source?.url) {
              return (
                <Text
                  key={`${baseKey}-cite-${j}`}
                  onPress={() => openLink(source.url)}
                  style={{
                    color: Colors.accent,
                    fontWeight: "700",
                    fontSize: 13,
                  }}
                >
                  {` [${n}]`.trimStart()}
                </Text>
              );
            }
          }
          return (
            <Text key={`${baseKey}-tok-${j}`} style={styles.text}>
              {token}
            </Text>
          );
        });
      };

      if (parts.length === 1 && !isMathPlaceholder(text)) {
        return (
          <Text
            key={node.key}
            style={styles.text}
            selectable={Platform.OS !== "ios"}
          >
            {renderWithCitations(text, `${node.key}-c`)}
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
                {renderWithCitations(part, `${node.key}-${i}`)}
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

    // Headings (styles control spacing, not wrapper)
    heading1: (node, children, _parent, styles) => (
      <View key={node.key}>
        <Text style={styles.heading1} selectable={Platform.OS !== "ios"}>
          {children}
        </Text>
      </View>
    ),
    heading2: (node, children, _parent, styles) => (
      <View key={node.key}>
        <Text style={styles.heading2} selectable={Platform.OS !== "ios"}>
          {children}
        </Text>
      </View>
    ),
    heading3: (node, children, _parent, styles) => (
      <View key={node.key}>
        <Text style={styles.heading3} selectable={Platform.OS !== "ios"}>
          {children}
        </Text>
      </View>
    ),
    heading4: (node, children, _parent, styles) => (
      <View key={node.key}>
        <Text style={styles.heading4} selectable={Platform.OS !== "ios"}>
          {children}
        </Text>
      </View>
    ),
    heading5: (node, children, _parent, styles) => (
      <View key={node.key}>
        <Text style={styles.heading5} selectable={Platform.OS !== "ios"}>
          {children}
        </Text>
      </View>
    ),
    heading6: (node, children, _parent, styles) => (
      <View key={node.key}>
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
export function MarkdownRenderer({ content, isStreaming, sources }: MarkdownRendererProps) {
  const { cleaned, placeholders } = useMemo(() => extractMath(content), [content]);

  const safeContent = useMemo(() => {
    if (isStreaming) {
      return streamingSafeContent(cleaned);
    }
    return cleaned;
  }, [cleaned, isStreaming]);

  const rules = useMemo(() => createCustomRules(placeholders, sources), [placeholders, sources]);

  return (
    <View>
      <Markdown style={markdownStyles} rules={rules}>
        {safeContent}
      </Markdown>
    </View>
  );
}
