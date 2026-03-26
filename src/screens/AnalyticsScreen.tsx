import { ScrollView, Text, View, Pressable } from "react-native";
import { useMemo, useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useHealthStore } from "../store/useHealthStore";
import { useTheme } from "../context/ThemeContext";
import { getMetricPresentationList } from "../services/metricService";
import { formatShortDay } from "../utils/dateUtils";
import { TrendChart } from "../components/TrendChart";
import { BarChart } from "../components/BarChart";
import { RingChart } from "../components/RingChart";
import { getWeeklyRiskAreas } from "../services/insightService";
import { calculateDynamicHealthScore } from "../utils/scoreCalculator";
import { generateAndShareWeeklyReport } from "../services/weeklyReportService";
import type { DailyHealthRecord, HealthMetricKey } from "../types/health";
import { getZoneColor, getPerformanceZone } from "../types/health";

function metricValue(metric: HealthMetricKey, record: DailyHealthRecord): number {
  if (metric === "sleep") return record.sleep_hours;
  if (metric === "steps") return record.steps;
  if (metric === "water") return record.water_ml;
  if (metric === "calories") return record.calories;
  if (metric === "blood_pressure_sys") return record.blood_pressure_sys;
  if (metric === "blood_pressure_dia") return record.blood_pressure_dia;
  if (metric === "heart_rate") return record.heart_rate;
  if (metric === "blood_sugar") return record.blood_sugar;
  return record.weight_kg;
}

function averageMetric(metric: HealthMetricKey, records: DailyHealthRecord[]): number {
  if (!records.length) return 0;
  const total = records.reduce((sum, r) => sum + metricValue(metric, r), 0);
  return total / records.length;
}

function formatMetric(metric: HealthMetricKey, value: number): string {
  if (metric === "sleep" || metric === "weight") return value.toFixed(1);
  return String(Math.round(value));
}

// ─── Score History Graph ──────────────────────────────────────────────────────

function ScoreHistorySection({ records, profile, activeMetrics, targets, colors }: {
  records: DailyHealthRecord[];
  profile: NonNullable<import("../types/health").UserProfile>;
  activeMetrics: HealthMetricKey[];
  targets: Record<string, number>;
  colors: ReturnType<typeof useTheme>["colors"];
}): JSX.Element {
  const scores = useMemo(() =>
    records.map((r) => calculateDynamicHealthScore(r, profile, activeMetrics, targets).score),
    [records, profile, activeMetrics, targets]
  );

  const avgScore = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;

  const zone = getPerformanceZone(avgScore);
  const zoneColor = getZoneColor(zone);

  const days = records.map((r) => formatShortDay(r.date));

  return (
    <Animated.View entering={FadeInDown.delay(80).duration(400)}>
      <LinearGradient
        colors={[`${zoneColor}15`, `${zoneColor}04`]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{
          borderRadius: 20, borderWidth: 1,
          borderColor: `${zoneColor}30`, padding: 16
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <View>
            <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 1.5 }}>WEEKLY HEALTH SCORE</Text>
            <View style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 4, gap: 6 }}>
              <Text style={{ color: zoneColor, fontSize: 40, fontWeight: "900", lineHeight: 44 }}>{avgScore}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 6 }}>avg</Text>
            </View>
          </View>
          <RingChart value={avgScore} label="Score" showZone size={80} strokeWidth={7} />
        </View>

        {/* Score bars */}
        <BarChart values={scores} labels={days} color={zoneColor} height={80} />
      </LinearGradient>
    </Animated.View>
  );
}

// ─── Achievement Rings Row ────────────────────────────────────────────────────

function AchievementRings({ records, targets, colors }: {
  records: DailyHealthRecord[];
  targets: Record<string, number>;
  colors: ReturnType<typeof useTheme>["colors"];
}): JSX.Element {
  const stepGoal  = targets.steps  ?? 10000;
  const waterGoal = targets.water  ?? 3000;
  const sleepGoal = targets.sleep  ?? 8;

  const avgSteps  = records.length ? Math.round(records.reduce((a, r) => a + r.steps, 0) / records.length) : 0;
  const avgWater  = records.length ? Math.round(records.reduce((a, r) => a + r.water_ml, 0) / records.length) : 0;
  const avgSleep  = records.length ? records.reduce((a, r) => a + r.sleep_hours, 0) / records.length : 0;

  const daysHit = (metric: keyof DailyHealthRecord, goal: number): number =>
    records.filter((r) => (r[metric] as number) >= goal * 0.85).length;

  return (
    <Animated.View entering={FadeInDown.delay(120).duration(400)}>
      <View style={{
        backgroundColor: colors.card, borderRadius: 20,
        borderWidth: 1, borderColor: colors.border, padding: 16
      }}>
        <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 1.5, marginBottom: 16 }}>
          WEEKLY ACHIEVEMENTS
        </Text>
        <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
          <View style={{ alignItems: "center" }}>
            <RingChart
              value={avgSteps} maxValue={stepGoal}
              label="Steps" icon="shoe-print" color="#4F7BFF"
              size={80} strokeWidth={7}
            />
            <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 6 }}>
              {daysHit("steps", stepGoal)}/7 days
            </Text>
          </View>
          <View style={{ alignItems: "center" }}>
            <RingChart
              value={avgSleep} maxValue={sleepGoal}
              label="Sleep" icon="power-sleep" color="#9A6CFF"
              size={80} strokeWidth={7}
            />
            <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 6 }}>
              {daysHit("sleep_hours", sleepGoal)}/7 days
            </Text>
          </View>
          <View style={{ alignItems: "center" }}>
            <RingChart
              value={avgWater} maxValue={waterGoal}
              label="Hydration" icon="water" color="#1AE5A7"
              size={80} strokeWidth={7}
            />
            <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 6 }}>
              {daysHit("water_ml", waterGoal)}/7 days
            </Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Metric Chart Card ────────────────────────────────────────────────────────

type ChartType = "line" | "bar";

function MetricChartCard({ metric, values, labels, average, color, icon, label, unit, goal, delay }: {
  metric: HealthMetricKey;
  values: number[];
  labels: string[];
  average: number;
  color: string;
  icon: string;
  label: string;
  unit: string;
  goal: number;
  delay: number;
}): JSX.Element {
  const { colors } = useTheme();
  const [chartType, setChartType] = useState<ChartType>("bar");
  const formattedAvg = formatMetric(metric, average);
  const zone = getPerformanceZone(goal > 0 ? Math.round(Math.min(100, (average / goal) * 100)) : 50);
  const zoneColor = getZoneColor(zone);

  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(380)}>
      <View style={{
        backgroundColor: colors.card, borderRadius: 20,
        borderWidth: 1, borderColor: colors.border, padding: 16
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ backgroundColor: `${color}20`, borderRadius: 10, width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
              <MaterialCommunityIcons name={icon as never} size={16} color={color} />
            </View>
            <View>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{label}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                Avg: <Text style={{ color: zoneColor, fontWeight: "700" }}>{formattedAvg}</Text>
                {unit ? ` ${unit}` : ""}
              </Text>
            </View>
          </View>
          {/* Chart type toggle */}
          <View style={{ flexDirection: "row", backgroundColor: colors.cardMuted, borderRadius: 10, padding: 3 }}>
            <Pressable
              onPress={() => setChartType("bar")}
              style={{
                paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
                backgroundColor: chartType === "bar" ? color : "transparent"
              }}
            >
              <MaterialCommunityIcons name="chart-bar" size={14} color={chartType === "bar" ? "#fff" : colors.textMuted} />
            </Pressable>
            <Pressable
              onPress={() => setChartType("line")}
              style={{
                paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
                backgroundColor: chartType === "line" ? color : "transparent"
              }}
            >
              <MaterialCommunityIcons name="chart-line" size={14} color={chartType === "line" ? "#fff" : colors.textMuted} />
            </Pressable>
          </View>
        </View>

        {chartType === "bar"
          ? <BarChart values={values} labels={labels} color={color} height={72} />
          : <TrendChart values={values} color={color} height={72} />}

        {/* Goal progress */}
        {goal > 0 && (
          <View style={{ marginTop: 10 }}>
            <View style={{ height: 3, borderRadius: 2, backgroundColor: colors.cardMuted, overflow: "hidden" }}>
              <View style={{
                height: "100%",
                width: `${Math.min(100, Math.round((average / goal) * 100))}%`,
                backgroundColor: zoneColor,
                borderRadius: 2
              }} />
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 4 }}>
              {Math.min(100, Math.round((average / goal) * 100))}% of goal ({goal}{unit ? ` ${unit}` : ""})
            </Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

// ─── Weekly Report Button ─────────────────────────────────────────────────────

function WeeklyReportButton({ onPress, isGenerating, colors }: {
  onPress: () => void; isGenerating: boolean;
  colors: ReturnType<typeof useTheme>["colors"];
}): JSX.Element {
  return (
    <Animated.View entering={FadeInDown.delay(40).duration(350)}>
      <Pressable
        onPress={onPress}
        disabled={isGenerating}
        style={{ opacity: isGenerating ? 0.7 : 1 }}
      >
        <LinearGradient
          colors={["rgba(79,123,255,0.25)", "rgba(154,108,255,0.15)"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 16, borderWidth: 1,
            borderColor: "rgba(79,123,255,0.40)",
            padding: 14,
            flexDirection: "row", alignItems: "center", gap: 12
          }}
        >
          <View style={{
            backgroundColor: "rgba(79,123,255,0.20)", borderRadius: 10,
            width: 40, height: 40, alignItems: "center", justifyContent: "center"
          }}>
            <MaterialCommunityIcons name="file-chart-outline" size={20} color="#4F7BFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>
              {isGenerating ? "Generating PDF..." : "Download Weekly Report"}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
              7-day progress summary · PDF
            </Text>
          </View>
          <MaterialCommunityIcons name="download" size={20} color="#4F7BFF" />
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function AnalyticsScreen(): JSX.Element {
  const profile           = useHealthStore((s) => s.profile);
  const activeMetrics     = useHealthStore((s) => s.activeMetrics);
  const weeklyRecords     = useHealthStore((s) => s.weeklyRecords);
  const aiPersonalization = useHealthStore((s) => s.aiPersonalization);
  const { colors } = useTheme();
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  const metricPresentation = useMemo(() => {
    if (!profile) return [];
    return getMetricPresentationList(activeMetrics, profile, aiPersonalization?.metric_targets);
  }, [activeMetrics, aiPersonalization?.metric_targets, profile]);

  const riskAreas = useMemo(
    () => getWeeklyRiskAreas(weeklyRecords, activeMetrics, aiPersonalization?.metric_targets),
    [activeMetrics, aiPersonalization?.metric_targets, weeklyRecords]
  );

  const targets = (aiPersonalization?.metric_targets ?? {}) as Record<string, number>;
  const days = weeklyRecords.map((r) => formatShortDay(r.date));

  // Build week label string for PDF
  const weekLabel = weeklyRecords.length >= 2
    ? `${weeklyRecords[0].date} – ${weeklyRecords[weeklyRecords.length - 1].date}`
    : new Date().toLocaleDateString();

  async function onGenerateReport(): Promise<void> {
    if (!profile) return;
    setIsGeneratingReport(true);
    try {
      await generateAndShareWeeklyReport(weeklyRecords, profile, aiPersonalization, weekLabel);
    } finally {
      setIsGeneratingReport(false);
    }
  }

  if (!profile) return <View style={{ flex: 1 }} />;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 130, gap: 12 }}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View entering={FadeInDown.duration(300)}>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: "900", marginTop: 4 }}>Analytics</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }}>
          7-day trends and progress insights.
        </Text>
      </Animated.View>

      {/* Download weekly PDF report */}
      <WeeklyReportButton onPress={onGenerateReport} isGenerating={isGeneratingReport} colors={colors} />

      {/* Score history */}
      {weeklyRecords.length > 0 && profile && (
        <ScoreHistorySection
          records={weeklyRecords}
          profile={profile}
          activeMetrics={activeMetrics}
          targets={targets}
          colors={colors}
        />
      )}

      {/* Achievement rings */}
      <AchievementRings records={weeklyRecords} targets={targets} colors={colors} />

      {/* Risk Areas */}
      {riskAreas.length > 0 && (
        <Animated.View entering={FadeInDown.delay(160).duration(380)}>
          <View style={{
            backgroundColor: colors.card, borderRadius: 20,
            borderWidth: 1, borderColor: "rgba(255,65,88,0.25)", padding: 16
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <MaterialCommunityIcons name="alert-circle-outline" size={14} color="#FF4158" />
              <Text style={{ color: "#FF4158", fontSize: 10, fontWeight: "700", letterSpacing: 1.5 }}>
                RISK AREAS THIS WEEK
              </Text>
            </View>
            <View style={{ gap: 8 }}>
              {riskAreas.map((risk, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                  <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: "#FF4158", marginTop: 7 }} />
                  <Text style={{ color: colors.text, fontSize: 12, flex: 1, lineHeight: 18 }}>{risk}</Text>
                </View>
              ))}
            </View>
          </View>
        </Animated.View>
      )}

      {/* AI Clinical Focus */}
      {aiPersonalization?.doctor_focus?.length ? (
        <Animated.View entering={FadeInDown.delay(180).duration(380)}>
          <View style={{
            backgroundColor: colors.card, borderRadius: 20,
            borderWidth: 1, borderColor: "rgba(154,108,255,0.25)", padding: 16
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <MaterialCommunityIcons name="stethoscope" size={14} color="#9A6CFF" />
              <Text style={{ color: "#9A6CFF", fontSize: 10, fontWeight: "700", letterSpacing: 1.5 }}>
                AI CLINICAL FOCUS
              </Text>
            </View>
            <View style={{ gap: 8 }}>
              {aiPersonalization.doctor_focus.slice(0, 4).map((focus, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                  <MaterialCommunityIcons name="stethoscope" size={14} color="#9A6CFF" />
                  <Text style={{ color: colors.text, fontSize: 12, flex: 1, lineHeight: 18 }}>{focus}</Text>
                </View>
              ))}
            </View>
          </View>
        </Animated.View>
      ) : null}

      {/* Weekly / Monthly Targets */}
      {aiPersonalization?.weekly_targets && (
        <Animated.View entering={FadeInDown.delay(200).duration(380)}>
          <View style={{
            backgroundColor: colors.card, borderRadius: 20,
            borderWidth: 1, borderColor: colors.border, padding: 16
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <MaterialCommunityIcons name="target" size={14} color="#FFB238" />
              <Text style={{ color: "#FFB238", fontSize: 10, fontWeight: "700", letterSpacing: 1.5 }}>
                AI-SET TARGETS
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "600", marginBottom: 8 }}>WEEKLY</Text>
                {Object.entries(aiPersonalization.weekly_targets).map(([k, v]) => (
                  <Text key={k} style={{ color: colors.text, fontSize: 11, marginBottom: 4 }}>
                    <Text style={{ color: colors.textMuted }}>{k.replace(/_/g, " ")}: </Text>
                    {typeof v === "number" && v > 1000 ? v.toLocaleString() : v}
                  </Text>
                ))}
              </View>
              {aiPersonalization.monthly_targets && (
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "600", marginBottom: 8 }}>MONTHLY</Text>
                  {Object.entries(aiPersonalization.monthly_targets).map(([k, v]) => (
                    <Text key={k} style={{ color: colors.text, fontSize: 11, marginBottom: 4 }}>
                      <Text style={{ color: colors.textMuted }}>{k.replace(/_/g, " ")}: </Text>
                      {typeof v === "number" && v > 1000 ? v.toLocaleString() : v}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          </View>
        </Animated.View>
      )}

      {/* Per-Metric Charts */}
      {metricPresentation.map((metric, idx) => {
        const values = weeklyRecords.map((r) => metricValue(metric.key, r));
        const average = averageMetric(metric.key, weeklyRecords);
        return (
          <MetricChartCard
            key={metric.key}
            metric={metric.key}
            values={values}
            labels={days}
            average={average}
            color={metric.color}
            icon={metric.icon}
            label={metric.label}
            unit={metric.unit}
            goal={metric.goal}
            delay={220 + idx * 50}
          />
        );
      })}
    </ScrollView>
  );
}
