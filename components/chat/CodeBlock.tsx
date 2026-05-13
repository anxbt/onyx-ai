import { useCallback, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Colors } from "@/constants/colors";
import { copyToClipboard } from "@/lib/clipboard";
import { tokenizeFast, type TokenType } from "@/lib/syntaxHighlighter";

interface CodeBlockProps {
  code: string;
  language?: string;
}

function getColorForTokenType(type: TokenType): string {
  switch (type) {
    case "keyword":
      return Colors.syntaxKeyword;
    case "string":
      return Colors.syntaxString;
    case "comment":
      return Colors.syntaxComment;
    case "number":
      return Colors.syntaxNumber;
    case "function":
      return Colors.syntaxFunction;
    case "operator":
      return Colors.syntaxOperator;
    case "type":
      return Colors.syntaxType;
    case "punctuation":
      return Colors.textSecondary;
    default:
      return Colors.codeText;
  }
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const ok = await copyToClipboard(code);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [code]);

  const lines = tokenizeFast(code, language);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.langBadge}>{language || "text"}</Text>
        <Pressable onPress={handleCopy} style={styles.copyBtn} hitSlop={8}>
          <Text style={styles.copyText}>{copied ? "Copied!" : "Copy"}</Text>
        </Pressable>
      </View>

      {/* Code */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.codeScroll}
      >
        <View style={styles.codeInner}>
          {lines.map((tokens, lineIdx) => (
            <View key={lineIdx} style={styles.line}>
              {/* Line number */}
              <Text style={styles.lineNumber}>{lineIdx + 1}</Text>
              {/* Tokens */}
              <View style={styles.tokens}>
                {tokens.map((token, tokIdx) => (
                  <Text
                    key={tokIdx}
                    style={[
                      styles.token,
                      { color: getColorForTokenType(token.type) },
                    ]}
                    selectable
                  >
                    {token.value}
                  </Text>
                ))}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.codeBlockBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
    marginVertical: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.codeBackground,
  },
  langBadge: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "lowercase",
  },
  copyBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Colors.surfaceElevated,
  },
  copyText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  codeScroll: {
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  codeInner: {
    minWidth: "100%",
  },
  line: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingRight: 16,
  },
  lineNumber: {
    color: Colors.textTertiary,
    fontSize: 13,
    lineHeight: 20,
    width: 36,
    textAlign: "right",
    paddingRight: 10,
    fontVariant: ["tabular-nums"],
  },
  tokens: {
    flexDirection: "row",
    flexWrap: "wrap",
    flex: 1,
  },
  token: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
});
