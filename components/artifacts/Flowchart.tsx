import React from "react";
import { Text, View } from "react-native";
import Svg, { Line, Polygon, Rect, Text as SvgText } from "react-native-svg";

import { Colors } from "@/constants/colors";

interface FlowchartNode {
  id: string;
  label: string;
  shape?: "rounded" | "rectangle" | "diamond";
}

interface FlowchartEdge {
  from: string;
  to: string;
  label?: string;
}

interface FlowchartData {
  nodes: FlowchartNode[];
  edges: FlowchartEdge[];
}

interface FlowchartProps {
  data: string;
}

const NODE_W = 140;
const NODE_H = 36;
const V_GAP = 56;

function renderShape(shape: string | undefined) {
  if (shape === "diamond") {
    const cx = NODE_W / 2;
    const cy = NODE_H / 2;
    const w = NODE_W / 2;
    const h = NODE_H / 2;
    return (
      <Polygon
        points={`${cx},${cy - h} ${cx + w},${cy} ${cx},${cy + h} ${cx - w},${cy}`}
        fill={Colors.surfaceElevated}
        stroke={Colors.accent}
        strokeWidth={1.5}
      />
    );
  }
  return (
    <Rect
      x={0}
      y={0}
      width={NODE_W}
      height={NODE_H}
      rx={shape === "rounded" ? NODE_H / 2 : 4}
      fill={Colors.surfaceElevated}
      stroke={Colors.accent}
      strokeWidth={1}
    />
  );
}

export function Flowchart({ data }: FlowchartProps) {
  let parsed: FlowchartData | null = null;
  try {
    parsed = JSON.parse(data);
  } catch {
    return (
      <View style={{ padding: 8 }}>
        <Text style={{ color: Colors.danger, fontSize: 12 }}>Invalid flowchart data</Text>
      </View>
    );
  }

  if (!parsed?.nodes?.length) {
    return (
      <View style={{ padding: 8 }}>
        <Text style={{ color: Colors.textTertiary, fontSize: 12 }}>Empty flowchart</Text>
      </View>
    );
  }

  const nodes = parsed.nodes;
  const edges = parsed.edges ?? [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const totalH = nodes.length * V_GAP + NODE_H;
  const svgW = NODE_W + 60;

  return (
    <View
      style={{
        backgroundColor: Colors.surfaceElevated,
        borderColor: Colors.border,
        borderRadius: 12,
        borderWidth: 1,
        padding: 12,
      }}
    >
      <Text style={{ color: Colors.textTertiary, fontSize: 10, fontWeight: "600", marginBottom: 8 }}>
        FLOWCHART
      </Text>
      <Svg width={svgW} height={totalH}>
        {nodes.map((node, i) => {
          const y = i * V_GAP;
          return (
            <React.Fragment key={node.id}>
              {renderShape(node.shape)}
              <SvgText
                x={node.shape === "diamond" ? NODE_W / 2 : 8}
                y={NODE_H / 2 + 4}
                fill={Colors.textPrimary}
                fontSize={11}
                fontWeight="500"
                textAnchor={node.shape === "diamond" ? "middle" : "start"}
              >
                {node.label.length > 18 ? node.label.slice(0, 17) + "…" : node.label}
              </SvgText>
            </React.Fragment>
          );
        })}
        {edges.map((edge, i) => {
          const fromIdx = nodes.findIndex((n) => n.id === edge.from);
          const toIdx = nodes.findIndex((n) => n.id === edge.to);
          if (fromIdx === -1 || toIdx === -1) return null;
          const x1 = NODE_W / 2;
          const y1 = fromIdx * V_GAP + NODE_H;
          const x2 = NODE_W / 2;
          const y2 = toIdx * V_GAP;
          return (
            <React.Fragment key={i}>
              <Line x1={x1} y1={y1} x2={x2} y2={y2 - 6} stroke={Colors.borderStrong} strokeWidth={1.5} />
              <Polygon
                points={`${x2 - 4},${y2 - 8} ${x2 + 4},${y2 - 8} ${x2},${y2}`}
                fill={Colors.borderStrong}
              />
              {edge.label ? (
                <SvgText x={x1 + 8} y={(y1 + y2) / 2} fill={Colors.textTertiary} fontSize={9}>
                  {edge.label}
                </SvgText>
              ) : null}
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}
