import { LayoutChangeEvent, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated";
import { useEffect, useState } from "react";

type ProgressBarProps = {
  label: string;
  value: number;
  goal: number;
};

export function ProgressBar({ label, value, goal }: ProgressBarProps): JSX.Element {
  const progressRatio = goal > 0 ? Math.max(0, Math.min(value / goal, 1)) : 0;
  const [trackWidth, setTrackWidth] = useState(0);
  const animatedWidth = useSharedValue(0);

  useEffect(() => {
    animatedWidth.value = withTiming(trackWidth * progressRatio, {
      duration: 400,
      easing: Easing.out(Easing.cubic)
    });
  }, [animatedWidth, progressRatio, trackWidth]);

  const fillStyle = useAnimatedStyle(() => ({
    width: animatedWidth.value
  }));

  function handleTrackLayout(event: LayoutChangeEvent): void {
    setTrackWidth(event.nativeEvent.layout.width);
  }

  return (
    <View className="rounded-2xl border border-white/10 bg-card/70 p-4">
      <View className="flex-row justify-between items-center">
        <Text className="text-textMuted text-xs tracking-widest">{label.toUpperCase()}</Text>
        <Text className="text-white text-sm font-semibold">
          {Math.round(value)} / {goal}
        </Text>
      </View>

      <View onLayout={handleTrackLayout} className="mt-3 h-3 rounded-full bg-cardMuted overflow-hidden">
        <Animated.View style={fillStyle} className="h-3 rounded-full bg-accentBlue" />
      </View>
    </View>
  );
}
