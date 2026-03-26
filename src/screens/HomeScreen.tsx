import { ScrollView, Text, View, Pressable } from "react-native";
import { useEffect, useMemo, useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { HeroRing, RingChart } from "../components/RingChart";
import { InsightCard } from "../components/InsightCard";
import { MealTracker } from "../components/MealTracker";
import { SupplementTracker } from "../components/SupplementTracker";
import { useHealthStore } from "../store/useHealthStore";
import { useTheme } from "../context/ThemeContext";
import { formatReadableDate } from "../utils/dateUtils";
import { calculateDynamicHealthScore } from "../utils/scoreCalculator";
import { generateDailyInsight } from "../services/aiInsightService";
import { getMetricPresentationList } from "../services/metricService";
import { subscribeToSteps } from "../services/pedometerService";
import { WATCH_DATA_LABELS } from "../services/samsungHealthService";
import type { DailyHealthRecord, HealthMetricKey, WatchData, WeeklyWorkoutPlan } from "../types/health";
import { getPerformanceZone, getZoneColor, WATER_GOAL_ML, SLEEP_GOAL_HOURS, STEP_GOAL } from "../types/health";

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

function metricDisplayValue(metric: HealthMetricKey, value: number): string | number {
  if (metric === "sleep" || metric === "weight") return value > 0 ? value.toFixed(1) : "0.0";
  return Math.round(value);
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

function getTodayWorkoutKey(): keyof WeeklyWorkoutPlan {
  const days: Array<keyof WeeklyWorkoutPlan> = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  return days[new Date().getDay()];
}

// ─── Watch Data Banner ─────────────────────────────────────────────────────────

function WatchDataSection({ watchData }: { watchData: WatchData }): JSX.Element {
  const { colors } = useTheme();
  const visibleKeys: Array<keyof WatchData> = ["spo2", "resting_hr", "stress_level", "body_fat_pct", "calories_burned"];

  const items = WATCH_DATA_LABELS.filter(
    (item) => visibleKeys.includes(item.key) && watchData[item.key] !== undefined
  );

  if (!items.length) return <View />;

  return (
    <Animated.View entering={FadeInDown.delay(300).duration(400)}>
      <LinearGradient
        colors={["rgba(26,229,167,0.12)", "rgba(26,229,167,0.04)"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{
          borderRadius: 20,
          borderWidth: 1,
          borderColor: "rgba(26,229,167,0.25)",
          padding: 16,
          marginTop: 16
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 8 }}>
          <MaterialCommunityIcons name="watch" size={14} color="#1AE5A7" />
          <Text style={{ color: "#1AE5A7", fontSize: 10, fontWeight: "700", letterSpacing: 1.5 }}>
            GALAXY WATCH 4
          </Text>
          {watchData.last_synced ? (
            <View style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 4 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#1AE5A7" }} />
              <Text style={{ color: colors.textMuted, fontSize: 9 }}>Synced</Text>
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {items.map(({ key, label, unit, icon }) => {
            const val = watchData[key] as number;
            return (
              <View
                key={key}
                style={{
                  backgroundColor: colors.cardMuted,
                  borderRadius: 12,
                  padding: 10,
                  alignItems: "center",
                  minWidth: 80,
                  flex: 1
                }}
              >
                <MaterialCommunityIcons name={icon as never} size={16} color="#1AE5A7" />
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800", marginTop: 4 }}>
                  {typeof val === "number" && !Number.isInteger(val) ? val.toFixed(1) : val}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 9, marginTop: 1 }}>{unit || ""}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 9 }}>{label}</Text>
              </View>
            );
          })}
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

// ─── Weekly Targets Section ───────────────────────────────────────────────────

function WeeklyTargetsSection({ weekly, monthly }: {
  weekly: Record<string, number>;
  monthly: Record<string, number>;
}): JSX.Element {
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState<"weekly" | "monthly">("weekly");
  const targets = activeTab === "weekly" ? weekly : monthly;

  const targetLabels: Record<string, { label: string; unit: string; icon: string; color: string }> = {
    steps: { label: "Steps", unit: "steps/day", icon: "shoe-print", color: "#4F7BFF" },
    water: { label: "Water", unit: "ml/day", icon: "water", color: "#1AE5A7" },
    sleep: { label: "Sleep", unit: "hrs/night", icon: "power-sleep", color: "#9A6CFF" },
    calories: { label: "Calories", unit: "kcal/day", icon: "fire", color: "#FFB238" },
    heart_rate: { label: "Heart Rate", unit: "bpm", icon: "heart-pulse", color: "#EF476F" },
    blood_sugar: { label: "Blood Sugar", unit: "mg/dL", icon: "water-outline", color: "#06D6A0" }
  };

  return (
    <Animated.View entering={FadeInDown.delay(280).duration(400)} style={{ marginTop: 16 }}>
      <View style={{
        backgroundColor: colors.card,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: "hidden"
      }}>
        {/* Tab headers */}
        <View style={{ flexDirection: "row", padding: 4, backgroundColor: colors.cardMuted, margin: 12, borderRadius: 12, gap: 4 }}>
          {(["weekly", "monthly"] as const).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={{
                flex: 1,
                paddingVertical: 8,
                alignItems: "center",
                borderRadius: 10,
                backgroundColor: activeTab === tab ? colors.accentBlue : "transparent"
              }}
            >
              <Text style={{
                color: activeTab === tab ? "#fff" : colors.textMuted,
                fontSize: 11,
                fontWeight: "700",
                letterSpacing: 0.5
              }}>
                {tab === "weekly" ? "WEEKLY" : "MONTHLY"}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>
          {Object.entries(targets).map(([key, value]) => {
            const meta = targetLabels[key];
            if (!meta) return null;
            return (
              <View key={key} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{
                  backgroundColor: `${meta.color}18`,
                  borderRadius: 8,
                  width: 32,
                  height: 32,
                  alignItems: "center",
                  justifyContent: "center"
                }}>
                  <MaterialCommunityIcons name={meta.icon as never} size={14} color={meta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>{meta.label}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>{meta.unit}</Text>
                </View>
                <Text style={{ color: meta.color, fontSize: 16, fontWeight: "800" }}>
                  {typeof value === "number" && value > 1000 ? value.toLocaleString() : value}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Metric Card (WHOOP style) ────────────────────────────────────────────────

function StatCard({ label, value, unit, icon, color, delay = 0 }: {
  label: string; value: string | number; unit: string;
  icon: string; color: string; delay?: number;
}): JSX.Element {
  const { colors } = useTheme();
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(380)}
      style={{
        flex: 1,
        backgroundColor: colors.card,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 14
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <Text style={{ color: colors.textMuted, fontSize: 9, fontWeight: "700", letterSpacing: 1.3 }}>
          {label.toUpperCase()}
        </Text>
        <View style={{ backgroundColor: `${color}18`, borderRadius: 7, padding: 5 }}>
          <MaterialCommunityIcons name={icon as never} size={12} color={color} />
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
        <Text style={{ color: "#FFFFFF", fontSize: 26, fontWeight: "900", lineHeight: 30 }}>{value}</Text>
        {unit ? <Text style={{ color: colors.textMuted, fontSize: 11, marginLeft: 3, marginBottom: 2 }}>{unit}</Text> : null}
      </View>
    </Animated.View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function HomeScreen(): JSX.Element {
  const profile       = useHealthStore((s) => s.profile);
  const todayRecord   = useHealthStore((s) => s.todayRecord);
  const weeklyRecords = useHealthStore((s) => s.weeklyRecords);
  const activeMetrics = useHealthStore((s) => s.activeMetrics);
  const reports       = useHealthStore((s) => s.reports);
  const aiPersonalization = useHealthStore((s) => s.aiPersonalization);
  const isAnalyzingAi = useHealthStore((s) => s.isAnalyzingAi);
  const watchData     = useHealthStore((s) => s.watchData);
  const supplements   = useHealthStore((s) => s.supplements);
  const setSteps      = useHealthStore((s) => s.setSteps);

  const { colors, isDark } = useTheme();
  const [doctorInsight, setDoctorInsight] = useState("Loading your personalized insight...");
  const todayWorkoutKey = useMemo(() => getTodayWorkoutKey(), []);

  useEffect(() => {
    const unsub = subscribeToSteps((liveSteps) => { void setSteps(liveSteps); });
    return unsub;
  }, [setSteps]);

  useEffect(() => {
    if (!profile || !todayRecord) return;
    generateDailyInsight({ profile, todayRecord, weeklyRecords, activeMetrics, aiPersonalization })
      .then(setDoctorInsight)
      .catch(() => setDoctorInsight("Keep tracking consistently for better doctor-style insights."));
  }, [profile, todayRecord, weeklyRecords, activeMetrics, aiPersonalization]);

  const metricCards = useMemo(() => {
    if (!profile) return [];
    return getMetricPresentationList(activeMetrics, profile, aiPersonalization?.metric_targets);
  }, [activeMetrics, aiPersonalization?.metric_targets, profile]);

  const score = useMemo(() => {
    if (!profile || !todayRecord) return 0;
    return calculateDynamicHealthScore(todayRecord, profile, activeMetrics, aiPersonalization?.metric_targets).score;
  }, [activeMetrics, aiPersonalization?.metric_targets, profile, todayRecord]);

  // Three sub-ring metrics: Sleep %, Steps %, Hydration %
  const sleepGoal = aiPersonalization?.metric_targets?.sleep ?? SLEEP_GOAL_HOURS;
  const stepGoal  = aiPersonalization?.metric_targets?.steps ?? STEP_GOAL;
  const waterGoal = aiPersonalization?.metric_targets?.water ?? WATER_GOAL_ML;

  const sleepPct  = todayRecord ? Math.round(Math.min(100, (todayRecord.sleep_hours / sleepGoal) * 100)) : 0;
  const stepsPct  = todayRecord ? Math.round(Math.min(100, (todayRecord.steps / stepGoal) * 100)) : 0;
  const waterPct  = todayRecord ? Math.round(Math.min(100, (todayRecord.water_ml / waterGoal) * 100)) : 0;

  const hasMealPlan    = !!(aiPersonalization?.meal_plan?.length);
  const hasWorkout     = !!aiPersonalization?.workout_plan;
  const hasWeeklyTargets = !!(aiPersonalization?.weekly_targets && Object.keys(aiPersonalization.weekly_targets).length);

  const todayMealTemplate = useMemo(() => {
    if (!hasMealPlan) return null;
    return aiPersonalization!.meal_plan!.find(
      (t) => t.label.toLowerCase().includes("regular")
    ) ?? aiPersonalization!.meal_plan![0];
  }, [hasMealPlan, aiPersonalization?.meal_plan]);

  const todayWorkout = aiPersonalization?.workout_plan?.[todayWorkoutKey];

  const rows = chunkArray(metricCards, 2);

  if (!todayRecord || !profile) return <View style={{ flex: 1 }} />;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 130 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <Animated.View entering={FadeIn.duration(400)} style={{ marginTop: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View>
          <Text style={{ color: colors.textMuted, fontSize: 10, letterSpacing: 2.5, fontWeight: "700" }}>TODAY</Text>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "900", marginTop: 2 }}>
            {formatReadableDate(todayRecord.date)}
          </Text>
        </View>
        <LinearGradient
          colors={isDark ? ["rgba(154,108,255,0.30)", "rgba(79,123,255,0.20)"] : ["rgba(154,108,255,0.15)", "rgba(79,123,255,0.10)"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 20, borderWidth: 1,
            borderColor: "rgba(255,255,255,0.15)",
            paddingHorizontal: 14, paddingVertical: 7
          }}
        >
          <Text style={{ color: colors.text, fontSize: 11, fontWeight: "700" }}>
            {profile.goal.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          </Text>
        </LinearGradient>
      </Animated.View>

      {/* ── Hero Score Ring ──────────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.delay(80).duration(500)} style={{ alignItems: "center", marginTop: 24, marginBottom: 4 }}>
        <HeroRing score={score} />
      </Animated.View>

      {/* ── Three Sub-Rings (Sleep / Steps / Water) ──────────────────────── */}
      <Animated.View
        entering={FadeInDown.delay(160).duration(400)}
        style={{
          flexDirection: "row",
          justifyContent: "space-around",
          marginTop: 16,
          backgroundColor: colors.card,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 16
        }}
      >
        <RingChart
          value={sleepPct}
          label="Sleep"
          icon="power-sleep"
          size={90}
          strokeWidth={8}
          showZone
        />
        <View style={{ width: 1, backgroundColor: colors.border }} />
        <RingChart
          value={stepsPct}
          label="Strain"
          icon="shoe-print"
          color="#4F7BFF"
          size={90}
          strokeWidth={8}
          showZone
        />
        <View style={{ width: 1, backgroundColor: colors.border }} />
        <RingChart
          value={waterPct}
          label="Hydration"
          icon="water"
          color="#1AE5A7"
          size={90}
          strokeWidth={8}
          showZone
        />
      </Animated.View>

      {/* ── Quick Stats Row ──────────────────────────────────────────────── */}
      <Animated.View
        entering={FadeInDown.delay(200).duration(380)}
        style={{ flexDirection: "row", marginTop: 10, gap: 8 }}
      >
        <StatCard
          label="Steps"
          value={todayRecord.steps.toLocaleString()}
          unit=""
          icon="shoe-print"
          color="#4F7BFF"
          delay={210}
        />
        <StatCard
          label="Sleep"
          value={todayRecord.sleep_hours > 0 ? todayRecord.sleep_hours.toFixed(1) : "—"}
          unit="hrs"
          icon="power-sleep"
          color="#9A6CFF"
          delay={250}
        />
        <StatCard
          label="Water"
          value={todayRecord.water_ml > 0 ? `${(todayRecord.water_ml / 1000).toFixed(1)}L` : "—"}
          unit=""
          icon="water"
          color="#1AE5A7"
          delay={290}
        />
      </Animated.View>

      {/* ── Clinical Metrics Grid ─────────────────────────────────────────── */}
      {rows.length > 0 && (
        <View style={{ marginTop: 10, gap: 8 }}>
          {rows.map((row, ri) => (
            <View key={`row-${ri}`} style={{ flexDirection: "row", gap: 8 }}>
              {row.map((metric, mi) => {
                const val = metricValue(metric.key, todayRecord);
                const displayVal = metricDisplayValue(metric.key, val);
                const zone = getPerformanceZone(
                  metric.goal > 0 ? Math.round(Math.min(100, (val / metric.goal) * 100)) : 0
                );
                const borderColor = val > 0 ? `${metric.color}40` : colors.border;
                return (
                  <Animated.View
                    key={metric.key}
                    entering={FadeInDown.delay(100 + ri * 80 + mi * 40).duration(380)}
                    style={{ flex: 1 }}
                  >
                    <LinearGradient
                      colors={[`${metric.color}14`, `${metric.color}05`]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                      style={{
                        borderRadius: 18,
                        borderWidth: 1,
                        borderColor,
                        paddingVertical: 14,
                        paddingHorizontal: 12
                      }}
                    >
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <Text style={{ color: colors.textMuted, fontSize: 9, fontWeight: "700", letterSpacing: 1.3 }}>
                          {metric.label.toUpperCase()}
                        </Text>
                        <View style={{ backgroundColor: `${metric.color}20`, borderRadius: 7, padding: 5 }}>
                          <MaterialCommunityIcons name={metric.icon as never} size={12} color={metric.color} />
                        </View>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "flex-end", marginBottom: 8 }}>
                        <Text style={{ color: val > 0 ? metric.color : colors.textMuted, fontSize: 26, fontWeight: "900" }}>
                          {displayVal}
                        </Text>
                        {metric.unit ? (
                          <Text style={{ color: colors.textMuted, fontSize: 10, marginLeft: 3, marginBottom: 3 }}>
                            {metric.unit}
                          </Text>
                        ) : null}
                      </View>
                      {metric.goal > 0 && (
                        <View>
                          <View style={{ height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                            <View style={{
                              height: "100%",
                              width: `${Math.min(100, Math.round((val / metric.goal) * 100))}%`,
                              backgroundColor: metric.color,
                              borderRadius: 2
                            }} />
                          </View>
                          <Text style={{ color: colors.textMuted, fontSize: 9, marginTop: 4 }}>
                            {Math.min(100, Math.round((val / metric.goal) * 100))}% of {Math.round(metric.goal)}{metric.unit ? ` ${metric.unit}` : ""}
                          </Text>
                        </View>
                      )}
                    </LinearGradient>
                  </Animated.View>
                );
              })}
              {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
            </View>
          ))}
        </View>
      )}

      {/* ── Samsung Watch Data ──────────────────────────────────────────── */}
      {watchData?.is_connected && <WatchDataSection watchData={watchData} />}

      {/* ── Doctor Insight ─────────────────────────────────────────────── */}
      <View style={{ marginTop: 16 }}>
        <InsightCard title="Doctor Insight" message={doctorInsight} />
      </View>

      {/* ── AI Clinical Plan Summary ───────────────────────────────────── */}
      {aiPersonalization?.summary ? (
        <Animated.View entering={FadeInDown.delay(200).duration(400)} style={{ marginTop: 12 }}>
          <LinearGradient
            colors={["rgba(154,108,255,0.18)", "rgba(79,123,255,0.08)"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{
              borderRadius: 20, borderWidth: 1,
              borderColor: "rgba(154,108,255,0.30)", padding: 16
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 8 }}>
              <View style={{ backgroundColor: "rgba(154,108,255,0.20)", borderRadius: 8, padding: 5 }}>
                <MaterialCommunityIcons name="brain" size={12} color="#9A6CFF" />
              </View>
              <Text style={{ color: "#9A6CFF", fontSize: 10, fontWeight: "700", letterSpacing: 1.5 }}>
                AI CLINICAL PLAN
              </Text>
            </View>
            <Text style={{ color: colors.text, fontSize: 13, lineHeight: 20 }}>
              {aiPersonalization.summary}
            </Text>
            {aiPersonalization.doctor_focus?.slice(0, 3).map((focus, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 8 }}>
                <View style={{ height: 5, width: 5, borderRadius: 2.5, backgroundColor: "#9A6CFF", marginTop: 7, marginRight: 10 }} />
                <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1, lineHeight: 18 }}>{focus}</Text>
              </View>
            ))}
          </LinearGradient>
        </Animated.View>
      ) : null}

      {/* ── Weekly / Monthly Targets ──────────────────────────────────── */}
      {hasWeeklyTargets ? (
        <WeeklyTargetsSection
          weekly={aiPersonalization!.weekly_targets as Record<string, number>}
          monthly={(aiPersonalization!.monthly_targets ?? aiPersonalization!.metric_targets) as Record<string, number>}
        />
      ) : null}

      {/* ── Today's Meal Plan ─────────────────────────────────────────── */}
      {todayMealTemplate ? (
        <Animated.View entering={FadeInDown.delay(260).duration(400)}>
          <MealTracker template={todayMealTemplate} />
        </Animated.View>
      ) : isAnalyzingAi ? (
        <View style={{
          marginTop: 16, backgroundColor: colors.card, borderRadius: 20,
          borderWidth: 1, borderColor: colors.border, padding: 16
        }}>
          <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: "center" }}>
            ⏳ Building your personalized meal plan...
          </Text>
        </View>
      ) : null}

      {/* ── Today's Workout ───────────────────────────────────────────── */}
      {todayWorkout && todayWorkout.type !== "rest" ? (
        <Animated.View entering={FadeInDown.delay(300).duration(400)} style={{ marginTop: 12 }}>
          <LinearGradient
            colors={["rgba(255,178,56,0.15)", "rgba(255,178,56,0.04)"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{
              borderRadius: 20, borderWidth: 1,
              borderColor: "rgba(255,178,56,0.25)", padding: 16
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 8 }}>
              <View style={{ backgroundColor: "rgba(255,178,56,0.20)", borderRadius: 8, padding: 5 }}>
                <MaterialCommunityIcons name="dumbbell" size={12} color="#FFB238" />
              </View>
              <Text style={{ color: "#FFB238", fontSize: 10, fontWeight: "700", letterSpacing: 1.5 }}>
                TODAY&apos;S WORKOUT
              </Text>
              <Text style={{ color: colors.textMuted, marginLeft: "auto", fontSize: 11 }}>
                {todayWorkout.duration_minutes} min
              </Text>
            </View>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>{todayWorkout.name}</Text>
            <View style={{ marginTop: 8, gap: 6 }}>
              {todayWorkout.exercises.slice(0, 3).map((ex, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: "#FFB238" }} />
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>{ex}</Text>
                </View>
              ))}
            </View>
          </LinearGradient>
        </Animated.View>
      ) : null}

      {/* ── Health Tips ───────────────────────────────────────────────── */}
      {aiPersonalization?.health_tips?.length ? (
        <Animated.View entering={FadeInDown.delay(340).duration(400)} style={{ marginTop: 12 }}>
          <LinearGradient
            colors={["rgba(255,209,102,0.12)", "rgba(255,209,102,0.04)"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{
              borderRadius: 20, borderWidth: 1,
              borderColor: "rgba(255,209,102,0.25)", padding: 16
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 8 }}>
              <View style={{ backgroundColor: "rgba(255,209,102,0.20)", borderRadius: 8, padding: 5 }}>
                <MaterialCommunityIcons name="lightbulb-on-outline" size={12} color="#FFD166" />
              </View>
              <Text style={{ color: "#FFD166", fontSize: 10, fontWeight: "700", letterSpacing: 1.5 }}>
                HEALTH TIPS
              </Text>
            </View>
            <View style={{ gap: 8 }}>
              {aiPersonalization.health_tips.slice(0, 4).map((tip, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "flex-start" }}>
                  <View style={{
                    backgroundColor: "rgba(255,209,102,0.20)", borderRadius: 6,
                    paddingHorizontal: 5, paddingVertical: 2, marginRight: 10, marginTop: 1
                  }}>
                    <Text style={{ color: "#FFD166", fontSize: 9, fontWeight: "700" }}>{i + 1}</Text>
                  </View>
                  <Text style={{ color: colors.text, fontSize: 12, flex: 1, lineHeight: 18 }}>{tip}</Text>
                </View>
              ))}
            </View>
          </LinearGradient>
        </Animated.View>
      ) : null}

      {/* ── Supplement Adherence ──────────────────────────────────────── */}
      {supplements.filter((s) => s.is_active).length > 0 ? (
        <Animated.View entering={FadeInDown.delay(350).duration(400)} style={{ marginTop: 12 }}>
          <LinearGradient
            colors={["rgba(26,229,167,0.12)", "rgba(26,229,167,0.04)"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{
              borderRadius: 20, borderWidth: 1,
              borderColor: "rgba(26,229,167,0.25)", padding: 16
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 8 }}>
              <View style={{ backgroundColor: "rgba(26,229,167,0.20)", borderRadius: 8, padding: 5 }}>
                <MaterialCommunityIcons name="pill" size={12} color="#1AE5A7" />
              </View>
              <Text style={{ color: "#1AE5A7", fontSize: 10, fontWeight: "700", letterSpacing: 1.5 }}>
                SUPPLEMENT ADHERENCE
              </Text>
            </View>
            <SupplementTracker compact={true} />
          </LinearGradient>
        </Animated.View>
      ) : null}

      {/* ── Reports Footer ────────────────────────────────────────────── */}
      {!aiPersonalization && !isAnalyzingAi && (
        <Animated.View entering={FadeInDown.delay(360).duration(400)} style={{ marginTop: 12 }}>
          <View style={{
            backgroundColor: colors.card, borderRadius: 20,
            borderWidth: 1, borderColor: colors.border, padding: 16
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <MaterialCommunityIcons name="brain" size={14} color="#9A6CFF" />
              <Text style={{ color: "#9A6CFF", fontSize: 10, fontWeight: "700", letterSpacing: 1.5 }}>
                AI PERSONALIZATION
              </Text>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18 }}>
              Upload a blood test or prescription in the Log tab to unlock your personalized meal plan, workout schedule, and health targets.
            </Text>
          </View>
        </Animated.View>
      )}
    </ScrollView>
  );
}
