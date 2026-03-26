import { ScrollView, Text, View } from "react-native";
import { useEffect, useMemo, useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import { ScoreCircle } from "../components/ScoreCircle";
import { MetricCard } from "../components/MetricCard";
import { InsightCard } from "../components/InsightCard";
import { MealPlanCard } from "../components/MealPlanCard";
import { WorkoutPlanCard } from "../components/WorkoutPlanCard";
import { useHealthStore } from "../store/useHealthStore";
import { formatReadableDate } from "../utils/dateUtils";
import { calculateDynamicHealthScore } from "../utils/scoreCalculator";
import { generateDailyInsight } from "../services/aiInsightService";
import { getMetricPresentationList } from "../services/metricService";
import { subscribeToSteps } from "../services/pedometerService";
import type { DailyHealthRecord, HealthMetricKey, WeeklyWorkoutPlan } from "../types/health";

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

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ icon, label, color }: { icon: string; label: string; color: string }): JSX.Element {
  return (
    <View className="flex-row items-center mb-3" style={{ gap: 8 }}>
      <View style={{ backgroundColor: `${color}20`, borderRadius: 8, padding: 5 }}>
        <MaterialCommunityIcons name={icon as never} size={13} color={color} />
      </View>
      <Text style={{ color, letterSpacing: 1.5, fontSize: 10, fontWeight: "700" }}>{label}</Text>
    </View>
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
  const setSteps      = useHealthStore((s) => s.setSteps);

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

  if (!todayRecord || !profile) return <View className="flex-1" />;

  const rows = chunkArray(metricCards, 2);
  const hasMealPlan    = !!(aiPersonalization?.meal_plan?.length);
  const hasWorkoutPlan = !!aiPersonalization?.workout_plan;
  const hasHealthTips  = !!(aiPersonalization?.health_tips?.length);
  const hasAiPlan      = hasMealPlan || hasWorkoutPlan || hasHealthTips;

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingBottom: 130 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Top header ─────────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.duration(350)} className="mt-2 flex-row items-center justify-between">
        <View>
          <Text className="text-textMuted text-xs tracking-widest">TODAY</Text>
          <Text className="text-white text-xl font-bold mt-1">{formatReadableDate(todayRecord.date)}</Text>
        </View>
        <LinearGradient
          colors={["rgba(154,108,255,0.30)","rgba(79,123,255,0.20)"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", paddingHorizontal: 14, paddingVertical: 7 }}
        >
          <Text className="text-white text-xs font-semibold capitalize">{profile.goal.replace(/_/g, " ")}</Text>
        </LinearGradient>
      </Animated.View>

      {/* ── Health Score ────────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.delay(80).duration(400)} className="items-center mt-6">
        <ScoreCircle score={score} />
      </Animated.View>

      {/* ── Metrics ─────────────────────────────────────────────────── */}
      <View className="mt-6" style={{ gap: 10 }}>
        {rows.map((row, ri) => (
          <View key={`row-${ri}`} className="flex-row" style={{ gap: 10 }}>
            {row.map((metric, mi) => {
              const val = metricValue(metric.key, todayRecord);
              return (
                <MetricCard
                  key={metric.key}
                  label={metric.label}
                  value={metricDisplayValue(metric.key, val)}
                  unit={metric.unit}
                  goal={metric.goal}
                  icon={metric.icon}
                  accentColor={metric.color}
                  delay={100 + ri * 100 + mi * 50}
                />
              );
            })}
            {row.length === 1 ? <View className="flex-1" /> : null}
          </View>
        ))}
      </View>

      {/* ── Doctor Insight ───────────────────────────────────────────── */}
      <View className="mt-5">
        <InsightCard title="Doctor Insight" message={doctorInsight} />
      </View>

      {/* ── AI Plan section ─────────────────────────────────────────── */}
      {hasAiPlan ? (
        <Animated.View entering={FadeInDown.delay(200).duration(450)}>

          {/* AI Summary card */}
          {aiPersonalization?.summary ? (
            <View className="mt-4" style={{ borderRadius: 20, overflow: "hidden" }}>
              <LinearGradient
                colors={["rgba(154,108,255,0.18)","rgba(79,123,255,0.10)"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{ padding: 16, borderWidth: 1, borderColor: "rgba(154,108,255,0.30)", borderRadius: 20 }}
              >
                <SectionHeader icon="brain" label="AI CLINICAL PLAN" color="#9A6CFF" />
                <Text className="text-white text-sm leading-6">{aiPersonalization.summary}</Text>
                {aiPersonalization.doctor_focus?.length ? (
                  <View className="mt-3" style={{ gap: 8 }}>
                    {aiPersonalization.doctor_focus.slice(0, 3).map((focus, i) => (
                      <View key={i} className="flex-row items-start">
                        <View style={{ height: 6, width: 6, borderRadius: 3, backgroundColor: "#9A6CFF", marginTop: 7, marginRight: 10 }} />
                        <Text className="text-textMuted text-sm flex-1 leading-5">{focus}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </LinearGradient>
            </View>
          ) : null}

          {/* Health Tips */}
          {hasHealthTips ? (
            <View className="mt-4" style={{ borderRadius: 20, overflow: "hidden" }}>
              <LinearGradient
                colors={["rgba(255,209,102,0.12)","rgba(255,209,102,0.04)"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{ padding: 16, borderWidth: 1, borderColor: "rgba(255,209,102,0.25)", borderRadius: 20 }}
              >
                <SectionHeader icon="lightbulb-on-outline" label="REPORT HEALTH TIPS" color="#FFD166" />
                <View style={{ gap: 10 }}>
                  {aiPersonalization!.health_tips!.map((tip, i) => (
                    <View key={i} className="flex-row items-start">
                      <View style={{ backgroundColor: "rgba(255,209,102,0.20)", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, marginRight: 10, marginTop: 1 }}>
                        <Text style={{ color: "#FFD166", fontSize: 10, fontWeight: "700" }}>{i + 1}</Text>
                      </View>
                      <Text className="text-white text-sm flex-1 leading-5">{tip}</Text>
                    </View>
                  ))}
                </View>
              </LinearGradient>
            </View>
          ) : null}

          {/* Meal Plan */}
          {hasMealPlan ? <MealPlanCard templates={aiPersonalization!.meal_plan!} /> : null}

          {/* Workout Plan */}
          {hasWorkoutPlan ? <WorkoutPlanCard plan={aiPersonalization!.workout_plan!} todayKey={todayWorkoutKey} /> : null}

        </Animated.View>
      ) : (
        /* No AI plan yet — prompt card */
        <Animated.View entering={FadeInDown.delay(200).duration(400)} className="mt-4">
          <LinearGradient
            colors={["rgba(154,108,255,0.10)","rgba(79,123,255,0.06)"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ borderRadius: 20, borderWidth: 1, borderColor: "rgba(154,108,255,0.20)", padding: 16 }}
          >
            <SectionHeader icon="brain" label="AI PERSONALIZATION" color="#9A6CFF" />
            <Text className="text-textMuted text-sm leading-6">
              {isAnalyzingAi
                ? "⏳ AI is analyzing your medical reports and building your personalized meal plan, workout, and health targets..."
                : `Upload a blood test or prescription in the Log tab, then tap "Run AI Analysis" to get your personalized plan.`}
            </Text>
          </LinearGradient>
        </Animated.View>
      )}

      {/* ── Reports footer ───────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.delay(300).duration(400)} className="mt-4">
        <View style={{ backgroundColor: "rgba(79,123,255,0.08)", borderRadius: 20, borderWidth: 1, borderColor: "rgba(79,123,255,0.18)", padding: 16 }}>
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center" style={{ gap: 8 }}>
              <MaterialCommunityIcons name="file-document-multiple-outline" size={15} color="#4F7BFF" />
              <Text className="text-accentBlue text-xs font-bold tracking-widest">HEALTH REPORTS</Text>
            </View>
            <View style={{ backgroundColor: "#4F7BFF", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text className="text-white text-xs font-bold">{reports.length}</Text>
            </View>
          </View>
          <Text className="text-textMuted text-sm leading-5">
            {isAnalyzingAi
              ? "Analyzing reports — this takes 15-30 seconds..."
              : hasAiPlan
                ? `Personalized from ${reports.length} report${reports.length !== 1 ? "s" : ""}. Meal plan and workout are active.`
                : reports.length > 0
                  ? "Reports uploaded. Go to Log tab → run AI Analysis."
                  : "No reports yet. Upload in the Log tab to unlock your AI health plan."}
          </Text>
        </View>
      </Animated.View>
    </ScrollView>
  );
}
