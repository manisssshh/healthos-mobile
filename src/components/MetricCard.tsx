import { Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";

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
  label,
  value,
  unit,
  goal,
  icon,
  accentColor,
  delay = 0
}: MetricCardProps): JSX.Element {
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(450)} className="flex-1">
      <LinearGradient
        colors={["rgba(154,108,255,0.22)", "rgba(79,123,255,0.08)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: 20,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
          paddingVertical: 16,
          paddingHorizontal: 14
        }}
      >
        <View className="flex-row items-center justify-between">
          <Text className="text-textMuted text-xs tracking-widest">{label.toUpperCase()}</Text>
          <View
            style={{ backgroundColor: `${accentColor}22` }}
            className="h-8 w-8 items-center justify-center rounded-full border border-white/10"
          >
            <MaterialCommunityIcons name={icon as never} size={16} color={accentColor} />
          </View>
        </View>
        <View className="mt-3 flex-row items-end">
          <Text className="text-white text-3xl font-extrabold">{value}</Text>
          <Text className="text-textMuted ml-1 mb-1">{unit}</Text>
        </View>
        {typeof goal === "number" && goal > 0 ? (
          <Text className="text-textMuted mt-2 text-xs">
            Target {Math.round(goal * 10) / 10}
            {unit ? ` ${unit}` : ""}
          </Text>
        ) : null}
      </LinearGradient>
    </Animated.View>
  );
}
