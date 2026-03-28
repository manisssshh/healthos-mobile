/**
 * RingChart.tsx
 * WHOOP-style animated ring chart. Shows a circular progress arc
 * with gradient fill and performance zone coloring.
 */
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
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { PerformanceZone } from "../types/health";
import { getPerformanceZone, getZoneColor, getZoneLabel } from "../types/health";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type RingChartProps = {
  /** 0–100 */
  value: number;
  /** Max value (used to compute percentage). Defaults to 100. */
  maxValue?: number;
  /** Label shown below the value */
  label: string;
  /** Icon name for MaterialCommunityIcons */
  icon?: string;
  /** Override the zone color */
  color?: string;
  /** Ring diameter in points */
  size?: number;
  /** Stroke width */
  strokeWidth?: number;
  /** Show performance zone label */
  showZone?: boolean;
  /** Sub-text shown below number (e.g. unit) */
  unit?: string;
};

export function RingChart({
  value,
  maxValue = 100,
  label,
  icon,
  color,
  size = 110,
  strokeWidth = 10,
  showZone = false,
  unit = ""
}: RingChartProps): JSX.Element {
  const percent = Math.min(1, Math.max(0, value / maxValue));
  const zone: PerformanceZone = getPerformanceZone(Math.round(percent * 100));
  const zoneColor = color ?? getZoneColor(zone);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const progress = useSharedValue(0);
  const scale = useSharedValue(0.92);

  useEffect(() => {
    progress.value = withTiming(percent, { duration: 1000, easing: Easing.out(Easing.cubic) });
    scale.value = withSpring(1, { damping: 14, stiffness: 160 });
  }, [percent, progress, scale]);

  const animatedCircleProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value)
  }));

  const animatedContainerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  const displayValue = maxValue === 100
    ? Math.round(value)
    : value > 0 ? (Number.isInteger(value) ? value : value.toFixed(1)) : "—";

  const gradId = `ringGrad_${label.replace(/\s/g, "")}`;

  return (
    <Animated.View style={[{ alignItems: "center" }, animatedContainerStyle]}>
      <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <Svg width={size} height={size}>
          <Defs>
            <SvgGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={zoneColor} stopOpacity={0.9} />
              <Stop offset="100%" stopColor={zoneColor} stopOpacity={0.6} />
            </SvgGradient>
          </Defs>
          {/* Track */}
          <Circle
            cx={size / 2} cy={size / 2} r={radius}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={strokeWidth}
            fill="none"
          />
          {/* Progress arc */}
          <AnimatedCircle
            animatedProps={animatedCircleProps}
            cx={size / 2} cy={size / 2} r={radius}
            stroke={`url(#${gradId})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            fill="none"
            // Rotate so arc starts at top
            transform={`rotate(-90, ${size / 2}, ${size / 2})`}
          />
        </Svg>

        {/* Center content */}
        <View style={{ position: "absolute", alignItems: "center" }}>
          {icon ? (
            <MaterialCommunityIcons name={icon as never} size={12} color={zoneColor} style={{ marginBottom: 2 }} />
          ) : null}
          <Text style={{ color: zoneColor, fontSize: size > 90 ? 22 : 16, fontWeight: "900", lineHeight: size > 90 ? 26 : 20 }}>
            {displayValue}
          </Text>
          {unit ? (
            <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 9, marginTop: 1 }}>{unit}</Text>
          ) : null}
        </View>
      </View>

      {/* Label */}
      <Text style={{
        color: "rgba(255,255,255,0.55)",
        fontSize: 10,
        fontWeight: "700",
        letterSpacing: 1.2,
        marginTop: 6,
        textTransform: "uppercase"
      }}>
        {label}
      </Text>

      {showZone ? (
        <View style={{
          backgroundColor: `${zoneColor}22`,
          borderRadius: 10,
          paddingHorizontal: 8,
          paddingVertical: 2,
          marginTop: 4
        }}>
          <Text style={{ color: zoneColor, fontSize: 9, fontWeight: "700" }}>
            {getZoneLabel(zone)}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

// ─── Large hero ring (main health score) ─────────────────────────────────────

type HeroRingProps = {
  score: number;
};

const HERO_SIZE = 210;
const HERO_STROKE = 14;
const HERO_RADIUS = (HERO_SIZE - HERO_STROKE) / 2;
const HERO_CIRCUMFERENCE = 2 * Math.PI * HERO_RADIUS;

export function HeroRing({ score }: HeroRingProps): JSX.Element {
  const zone = getPerformanceZone(score);
  const zoneColor = getZoneColor(zone);
  const zoneLabel = getZoneLabel(zone);

  const progress = useSharedValue(0);
  const scale = useSharedValue(0.93);

  useEffect(() => {
    progress.value = withTiming(score / 100, { duration: 1100, easing: Easing.out(Easing.cubic) });
    scale.value = withSpring(1, { damping: 12, stiffness: 160 });
  }, [score, progress, scale]);

  const animatedCircleProps = useAnimatedProps(() => ({
    strokeDashoffset: HERO_CIRCUMFERENCE * (1 - progress.value)
  }));

  const animatedContainerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  return (
    <Animated.View style={[{ alignItems: "center", justifyContent: "center" }, animatedContainerStyle]}>
      <View style={{ width: HERO_SIZE, height: HERO_SIZE, alignItems: "center", justifyContent: "center" }}>
        <Svg width={HERO_SIZE} height={HERO_SIZE}>
          <Defs>
            <SvgGradient id="heroGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={zoneColor} stopOpacity={1} />
              <Stop offset="100%" stopColor={zoneColor} stopOpacity={0.55} />
            </SvgGradient>
          </Defs>
          {/* Outer decorative track */}
          <Circle
            cx={HERO_SIZE / 2} cy={HERO_SIZE / 2} r={HERO_RADIUS + 10}
            stroke="rgba(255,255,255,0.04)"
            strokeWidth={1}
            fill="none"
          />
          {/* Main track */}
          <Circle
            cx={HERO_SIZE / 2} cy={HERO_SIZE / 2} r={HERO_RADIUS}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={HERO_STROKE}
            fill="none"
          />
          {/* Progress */}
          <AnimatedCircle
            animatedProps={animatedCircleProps}
            cx={HERO_SIZE / 2} cy={HERO_SIZE / 2} r={HERO_RADIUS}
            stroke={`url(#heroGrad)`}
            strokeWidth={HERO_STROKE}
            strokeLinecap="round"
            strokeDasharray={`${HERO_CIRCUMFERENCE} ${HERO_CIRCUMFERENCE}`}
            fill="none"
            transform={`rotate(-90, ${HERO_SIZE / 2}, ${HERO_SIZE / 2})`}
          />
        </Svg>

        {/* Center */}
        <View style={{ position: "absolute", alignItems: "center" }}>
          <Text style={{ color: "#FFFFFF", fontSize: 64, fontWeight: "900", lineHeight: 70 }}>
            {score}
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.40)", fontSize: 10, letterSpacing: 3, marginTop: 2 }}>
            HEALTH SCORE
          </Text>
          <View style={{
            backgroundColor: `${zoneColor}25`,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 3,
            borderWidth: 1,
            borderColor: `${zoneColor}50`,
            marginTop: 8
          }}>
            <Text style={{ color: zoneColor, fontSize: 10, fontWeight: "800", letterSpacing: 1 }}>
              {zoneLabel.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}
