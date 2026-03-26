import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolateColor
} from "react-native-reanimated";
import { useTheme } from "../context/ThemeContext";

type SkeletonProps = {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: object;
};

export function SkeletonBox({ width = "100%", height = 20, borderRadius = 8, style }: SkeletonProps): JSX.Element {
  const { colors } = useTheme();
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [shimmer]);

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      shimmer.value,
      [0, 1],
      [colors.cardMuted, colors.card]
    )
  }));

  return (
    <Animated.View
      style={[
        { width, height, borderRadius },
        animatedStyle,
        style
      ]}
    />
  );
}

export function SkeletonCard(): JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{
      backgroundColor: colors.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      flex: 1
    }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 14 }}>
        <SkeletonBox width="50%" height={12} />
        <SkeletonBox width={28} height={28} borderRadius={14} />
      </View>
      <SkeletonBox width="60%" height={32} borderRadius={6} style={{ marginBottom: 12 }} />
      <SkeletonBox width="100%" height={6} borderRadius={3} style={{ marginBottom: 6 }} />
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <SkeletonBox width="40%" height={10} />
        <SkeletonBox width="30%" height={10} />
      </View>
    </View>
  );
}

export function HomeScreenSkeleton(): JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, paddingTop: 8 }}>
      {/* Header */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <View>
          <SkeletonBox width={60} height={10} borderRadius={4} style={{ marginBottom: 8 }} />
          <SkeletonBox width={180} height={20} borderRadius={6} />
        </View>
        <SkeletonBox width={100} height={30} borderRadius={15} />
      </View>

      {/* Score Ring */}
      <View style={{ alignItems: "center", marginBottom: 28 }}>
        <SkeletonBox width={200} height={200} borderRadius={100} />
      </View>

      {/* Three mini rings */}
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
        <SkeletonBox width="31%" height={90} borderRadius={16} />
        <SkeletonBox width="31%" height={90} borderRadius={16} />
        <SkeletonBox width="31%" height={90} borderRadius={16} />
      </View>

      {/* Metric cards 2x2 */}
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </View>
    </View>
  );
}
