import { Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withTiming, withDelay } from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect } from "react";

type MetricCardProps = {
  label: string;
  value: number | string;
  unit: string;
  goal?: number;
  icon: string;
  accentColor: string;
  delay?: number;
};

export function MetricCard({
  label, value, unit, goal, icon, accentColor, delay = 0
}: MetricCardProps): JSX.Element {
  const progress = useSharedValue(0);

  const numericValue = typeof value === "string" ? parseFloat(value) : value;
  const progressPercent = goal && goal > 0 ? Math.min(numericValue / goal, 1) : 0;

  useEffect(() => {
    progress.value = withDelay(delay + 200, withTiming(progressPercent, { duration: 800 }));
  }, [progressPercent, delay, progress]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${Math.round(progress.value * 100)}%` as `${number}%`,
  }));

  const isComplete = progressPercent >= 1;

  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(400)} className="flex-1">
      <LinearGradient
        colors={[`${accentColor}18`, `${accentColor}06`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: 20,
          borderWidth: 1,
          borderColor: isComplete ? `${accentColor}60` : "rgba(255,255,255,0.07)",
          paddingVertical: 16,
          paddingHorizontal: 14,
        }}
      >
        {/* Header row */}
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-textMuted text-xs tracking-widest font-semibold">{label.toUpperCase()}</Text>
          <View
            style={{ backgroundColor: isComplete ? `${accentColor}35` : `${accentColor}18`, borderColor: `${accentColor}30` }}
            className="h-8 w-8 items-center justify-center rounded-full border"
          >
            <MaterialCommunityIcons name={icon as never} size={15} color={isComplete ? accentColor : "#A8A8BF"} />
          </View>
        </View>

        {/* Value */}
        <View className="flex-row items-end mb-3">
          <Text style={{ color: isComplete ? accentColor : "#ffffff" }} className="text-3xl font-extrabold">
            {value}
          </Text>
          {unit ? <Text className="text-textMuted text-sm ml-1 mb-1">{unit}</Text> : null}
        </View>

        {/* Progress bar */}
        {goal && goal > 0 ? (
          <View>
            <View className="h-1.5 rounded-full bg-white/8 overflow-hidden">
              <Animated.View
                style={[progressStyle, { backgroundColor: accentColor, borderRadius: 999 }]}
                className="h-full"
              />
            </View>
            <View className="flex-row justify-between mt-1.5">
              <Text className="text-textMuted text-xs">
                {isComplete ? "✓ Goal reached" : `${Math.round(progressPercent * 100)}% of goal`}
              </Text>
              <Text className="text-textMuted text-xs">{Math.round(goal * 10) / 10}{unit ? ` ${unit}` : ""}</Text>
            </View>
          </View>
        ) : null}
      </LinearGradient>
    </Animated.View>
  );
}
