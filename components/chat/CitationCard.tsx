import * as WebBrowser from "expo-web-browser";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Colors } from "@/constants/colors";
import { Spacing } from "@/constants/spacing";
import { Typography } from "@/constants/typography";
import type { Source } from "@/types";

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function openSource(url: string) {
  if (!url) return;
  WebBrowser.openBrowserAsync(url, {
    toolbarColor: Colors.background,
    controlsColor: Colors.primary,
  }).catch(() => {});
}

interface CitationCardsProps {
  sources: Source[];
}

export function CitationCards({ sources }: CitationCardsProps) {
  if (!sources?.length) return null;

  return (
    <View style={{ marginTop: Spacing.md, gap: Spacing.xs }}>
      <Text
        style={[
          Typography.uiLabel,
          {
            color: Colors.textTertiary,
            fontSize: 10,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            marginBottom: 2,
          },
        ]}
      >
        Sources
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: Spacing.sm, paddingRight: Spacing.md }}
      >
        {sources.map((source, i) => (
          <Pressable
            key={`${source.url}-${i}`}
            onPress={() => openSource(source.url)}
            style={({ pressed }) => ({
              width: 220,
              padding: Spacing.md,
              borderRadius: 12,
              backgroundColor: Colors.surfaceElevated,
              borderWidth: 1,
              borderColor: Colors.borderHairline,
              opacity: pressed ? 0.7 : 1,
              gap: Spacing.xs,
            })}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  backgroundColor: Colors.accentSubtle,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={[
                    Typography.uiLabel,
                    { color: Colors.accent, fontSize: 10, fontWeight: "700" },
                  ]}
                >
                  {i + 1}
                </Text>
              </View>
              <Text
                numberOfLines={1}
                style={[
                  Typography.uiLabel,
                  { color: Colors.textTertiary, fontSize: 11, flex: 1 },
                ]}
              >
                {domainFromUrl(source.url)}
              </Text>
            </View>
            <Text
              numberOfLines={2}
              style={[
                Typography.bodyProseBold,
                { color: Colors.textPrimary, fontSize: 13, lineHeight: 18 },
              ]}
            >
              {source.title}
            </Text>
            <Text
              numberOfLines={2}
              style={[
                Typography.uiLabel,
                { color: Colors.textSecondary, fontSize: 11, lineHeight: 15 },
              ]}
            >
              {source.snippet}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
