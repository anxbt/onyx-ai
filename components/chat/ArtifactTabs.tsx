import { Pressable, Text, View } from "react-native";

import { Colors } from "@/constants/colors";
import { Typography } from "@/constants/typography";

type ArtifactTab = "text" | "flowchart" | "code" | "pdf";

interface ArtifactTabsProps {
  activeTab: ArtifactTab;
  availableTabs: ArtifactTab[];
  onTabChange: (tab: ArtifactTab) => void;
}

export function ArtifactTabs({ activeTab, availableTabs, onTabChange }: ArtifactTabsProps) {
  if (availableTabs.length <= 1) return null;

  return (
    <View
      style={{
        flexDirection: "row",
        borderBottomWidth: 1,
        borderBottomColor: Colors.borderHairline,
        marginBottom: 12,
      }}
    >
      {availableTabs.map((tab) => (
        <Pressable
          key={tab}
          onPress={() => onTabChange(tab)}
          style={{
            paddingVertical: 8,
            paddingHorizontal: 16,
            borderBottomWidth: 2,
            borderBottomColor: tab === activeTab ? Colors.primary : "transparent",
          }}
        >
          <Text
            style={[
              Typography.uiLabel,
              {
                color: tab === activeTab ? Colors.primary : Colors.textTertiary,
                textTransform: "capitalize",
              },
            ]}
          >
            {tab}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
