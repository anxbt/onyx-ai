import React from "react";
import { Text, View } from "react-native";
import Svg, { Rect, Text as SvgText } from "react-native-svg";

import { Colors } from "@/constants/colors";
import { Typography } from "@/constants/typography";

interface ChartData {
  type: "bar";
  labels: string[];
  values: number[];
  title?: string;
}

interface ChartProps {
  data: string;
}

const BAR_W = 28;
const BAR_GAP = 12;
const CHART_H = 120;
const MAX_BARS = 8;

export function Chart({ data }: ChartProps) {
  let parsed: ChartData | null = null;
  try {
    parsed = JSON.parse(data);
  } catch {
    return (
      <View style={{ padding: 8 }}>
        <Text style={{ color: Colors.danger, fontSize: 12 }}>Invalid chart data</Text>
      </View>
    );
  }

  if (!parsed?.labels?.length) {
    return (
      <View style={{ padding: 8 }}>
        <Text style={{ color: Colors.textTertiary, fontSize: 12 }}>Empty chart</Text>
      </View>
    );
  }

  const labels = parsed.labels.slice(0, MAX_BARS);
  const values = parsed.values.slice(0, MAX_BARS);
  const maxVal = Math.max(...values, 1);
  const svgW = labels.length * (BAR_W + BAR_GAP) + 40;
  const barAreaH = CHART_H - 24;

  return (
    <View
      style={{
        backgroundColor: Colors.surfaceElevated,
        borderColor: Colors.borderHairline,
        borderRadius: 12,
        borderWidth: 1,
        padding: 12,
      }}
    >
      {parsed.title ? (
        <Text style={[Typography.uiLabel, { color: Colors.textPrimary, marginBottom: 8 }]}>
          {parsed.title}
        </Text>
      ) : null}
      <Svg width={svgW} height={CHART_H + 30}>
        {labels.map((label, i) => {
          const barH = Math.max(4, (values[i] / maxVal) * barAreaH);
          const x = 20 + i * (BAR_W + BAR_GAP);
          const y = CHART_H - barH;
          const opacity = 0.6 + (values[i] / maxVal) * 0.4;
          return (
            <React.Fragment key={i}>
              <Rect
                x={x}
                y={y}
                width={BAR_W}
                height={barH}
                rx={3}
                fill={Colors.primary}
                opacity={opacity}
              />
              <SvgText
                x={x + BAR_W / 2}
                y={y - 4}
                fill={Colors.textSecondary}
                fontSize={9}
                textAnchor="middle"
              >
                {values[i]}
              </SvgText>
              <SvgText
                x={x + BAR_W / 2}
                y={CHART_H + 14}
                fill={Colors.textTertiary}
                fontSize={9}
                textAnchor="middle"
              >
                {label.length > 6 ? label.slice(0, 5) + "…" : label}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}
