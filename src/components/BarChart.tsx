/**
 * BarChart.tsx
 * A clean animated bar chart for analytics trends.
 */
import { Text, View } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withTiming } from "react-native-reanimated";
import { useEffect } from "react";
import { useTheme } from "../context/ThemeContext";

type BarChartProps = {
  values: number[];
  labels?: string[];
  color: string;
  height?: number;
  goalLine?: number;
};

export function BarChart({ values, labels, color, height = 100, goalLine }: BarChartProps): JSX.Element {
  const { colors } = useTheme();
  const maxVal = Math.max(...values, goalLine ?? 0, 1);

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height, gap: 4, paddingHorizontal: 2 }}>
        {values.map((v, i) => (
          <AnimatedBar
            key={i}
            value={v}
            maxValue={maxVal}
            color={color}
            index={i}
            height={height}
            colors={colors}
          />
        ))}
      </View>
      {labels && labels.length > 0 && (
        <View style={{ flexDirection: "row", marginTop: 6, gap: 4, paddingHorizontal: 2 }}>
          {labels.map((l, i) => (
            <Text
              key={i}
              style={{ flex: 1, textAlign: "center", fontSize: 9, color: colors.textMuted, fontWeight: "600" }}
              numberOfLines={1}
            >
              {l}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

type AnimatedBarProps = {
  value: number;
  maxValue: number;
  color: string;
  index: number;
  height: number;
  colors: ReturnType<typeof useTheme>["colors"];
};

function AnimatedBar({ value, maxValue, color, index, height, colors }: AnimatedBarProps): JSX.Element {
  const barHeight = useSharedValue(0);
  const targetHeight = value > 0 ? Math.max(4, (value / maxValue) * height) : 4;

  useEffect(() => {
    barHeight.value = withDelay(
      index * 60,
      withTiming(targetHeight, { duration: 600 })
    );
  }, [targetHeight, index, barHeight]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: barHeight.value
  }));

  const isEmpty = value <= 0;

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", height }}>
      <Animated.View
        style={[
          {
            width: "100%",
            borderRadius: 5,
            backgroundColor: isEmpty ? colors.cardMuted : color,
            opacity: isEmpty ? 0.3 : 1
          },
          animatedStyle
        ]}
      />
    </View>
  );
}

// ─── Mini inline bar chart (horizontal) ──────────────────────────────────────

type MiniBarProps = {
  value: number;
  goal: number;
  color: string;
};

export function MiniProgressBar({ value, goal, color }: MiniBarProps): JSX.Element {
  const { colors } = useTheme();
  const pct = goal > 0 ? Math.min(1, value / goal) : 0;
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(pct, { duration: 800 });
  }, [pct]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${Math.round(progress.value * 100)}%` as `${number}%`
  }));

  return (
    <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.cardMuted, overflow: "hidden" }}>
      <Animated.View style={[{ height: "100%", borderRadius: 2, backgroundColor: color }, progressStyle]} />
    </View>
  );
}
