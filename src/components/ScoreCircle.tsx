import { Text, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from "react-native-svg";
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from "react-native-reanimated";
import { useEffect } from "react";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type ScoreCircleProps = {
  score: number;
};

const CIRCLE_SIZE = 220;
const STROKE_WIDTH = 16;
const RADIUS = (CIRCLE_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ScoreCircle({ score }: ScoreCircleProps): JSX.Element {
  const normalizedScore = Math.max(0, Math.min(score, 100));
  const progress = useSharedValue(0);
  const scale = useSharedValue(0.95);

  useEffect(() => {
    progress.value = withTiming(normalizedScore / 100, {
      duration: 900,
      easing: Easing.out(Easing.cubic)
    });
    scale.value = withSpring(1, {
      damping: 13,
      stiffness: 180
    });
  }, [normalizedScore, progress, scale]);

  const animatedCircleProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - progress.value)
  }));

  const animatedContainerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  return (
    <Animated.View style={animatedContainerStyle} className="items-center justify-center">
      <View style={{ width: CIRCLE_SIZE, height: CIRCLE_SIZE }} className="items-center justify-center">
        <Svg width={CIRCLE_SIZE} height={CIRCLE_SIZE}>
          <Defs>
            <SvgGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#9A6CFF" />
              <Stop offset="100%" stopColor="#4F7BFF" />
            </SvgGradient>
          </Defs>

          <Circle
            cx={CIRCLE_SIZE / 2}
            cy={CIRCLE_SIZE / 2}
            r={RADIUS}
            stroke="rgba(255,255,255,0.10)"
            strokeWidth={STROKE_WIDTH}
            fill="none"
          />
          <AnimatedCircle
            animatedProps={animatedCircleProps}
            cx={CIRCLE_SIZE / 2}
            cy={CIRCLE_SIZE / 2}
            r={RADIUS}
            stroke="url(#scoreGradient)"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            fill="none"
          />
        </Svg>

        <View className="absolute items-center">
          <Text className="text-white text-6xl font-extrabold">{normalizedScore}</Text>
          <Text className="text-textMuted text-sm mt-1 tracking-widest">HEALTH SCORE</Text>
        </View>
      </View>
    </Animated.View>
  );
}
