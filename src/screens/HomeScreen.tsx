import { ScrollView, Text, View } from "react-native";
import { useEffect, useMemo, useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ScoreCircle } from "../components/ScoreCircle";
import { MetricCard } from "../components/MetricCard";
import { InsightCard } from "../components/InsightCard";
import { useHealthStore } from "../store/useHealthStore";
import { formatReadableDate } from "../utils/dateUtils";
import { calculateDynamicHealthScore } from "../utils/scoreCalculator";
import { generateDailyInsight } from "../services/aiInsightService";
import { getMetricPresentationList } from "../services/metricService";
import { subscribeToSteps } from "../services/pedometerService";
import type { DailyHealthRecord, HealthMetricKey } from "../types/health";

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
  if (metric === "sleep" || metric === "weight") {
    return value > 0 ? value.toFixed(1) : "0.0";
  }
  return Math.round(value);
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export function HomeScreen(): JSX.Element {
  const profile = useHealthStore((state) => state.profile);
  const todayRecord = useHealthStore((state) => state.todayRecord);
  const weeklyRecords = useHealthStore((state) => state.weeklyRecords);
  const activeMetrics = useHealthStore((state) => state.activeMetrics);
  const reports = useHealthStore((state) => state.reports);
  const aiPersonalization = useHealthStore((state) => state.aiPersonalization);
  const isAnalyzingAi = useHealthStore((state) => state.isAnalyzingAi);
  const setSteps = useHealthStore((state) => state.setSteps);
  const [doctorInsight, setDoctorInsight] = useState("Loading your personalized insight...");

  // Auto-sync steps from pedometer in real-time.
  useEffect(() => {
    const unsubscribe = subscribeToSteps((liveSteps) => {
      void setSteps(liveSteps);
    });
    return unsubscribe;
  }, [setSteps]);

  // Fetch AI-backed daily insight whenever key data changes.
  useEffect(() => {
    if (!profile || !todayRecord) return;
    generateDailyInsight({
      profile,
      todayRecord,
      weeklyRecords,
      activeMetrics,
      aiPersonalization
    }).then(setDoctorInsight).catch(() => {
      setDoctorInsight("Keep tracking consistently for better doctor-style insights.");
    });
  }, [profile, todayRecord, weeklyRecords, activeMetrics, aiPersonalization]);

  const metricCards = useMemo(() => {
    if (!profile) {
      return [];
    }
    return getMetricPresentationList(activeMetrics, profile, aiPersonalization?.metric_targets);
  }, [activeMetrics, aiPersonalization?.metric_targets, profile]);

  const score = useMemo(() => {
    if (!profile || !todayRecord) {
      return 0;
    }
    return calculateDynamicHealthScore(
      todayRecord,
      profile,
      activeMetrics,
      aiPersonalization?.metric_targets
    ).score;
  }, [activeMetrics, aiPersonalization?.metric_targets, profile, todayRecord]);

  if (!todayRecord || !profile) {
    return <View className="flex-1" />;
  }

  const rows = chunkArray(metricCards, 2);

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingBottom: 122 }}
      showsVerticalScrollIndicator={false}
    >
      <View className="mt-2 flex-row items-center justify-between">
        <View>
          <Text className="text-textMuted text-xs tracking-widest">TODAY</Text>
          <Text className="text-white text-lg font-semibold mt-1">{formatReadableDate(todayRecord.date)}</Text>
        </View>
        <View className="rounded-full border border-white/10 bg-cardMuted px-3 py-2">
          <Text className="text-textMuted text-xs">{profile.goal.replace("_", " ")}</Text>
        </View>
      </View>

      <View className="items-center mt-6">
        <ScoreCircle score={score} />
      </View>

      <View className="mt-7" style={{ gap: 10 }}>
        {rows.map((row, rowIndex) => (
          <View key={`metric-row-${rowIndex}`} className="flex-row" style={{ gap: 10 }}>
            {row.map((metric, metricIndex) => {
              const value = metricValue(metric.key, todayRecord);
              return (
                <MetricCard
                  key={metric.key}
                  label={metric.label}
                  value={metricDisplayValue(metric.key, value)}
                  unit={metric.unit}
                  goal={metric.goal}
                  icon={metric.icon}
                  accentColor={metric.color}
                  delay={80 + rowIndex * 120 + metricIndex * 60}
                />
              );
            })}
            {row.length === 1 ? <View className="flex-1" /> : null}
          </View>
        ))}
      </View>

      <View className="mt-5">
        <InsightCard title="Doctor Insight" message={doctorInsight} />
      </View>

      {aiPersonalization ? (
        <View className="mt-4 rounded-2xl border border-white/10 bg-card/80 p-4">
          <View className="flex-row items-center">
            <MaterialCommunityIcons name="brain" size={16} color="#9A6CFF" />
            <Text className="text-textMuted text-xs tracking-widest ml-2">AI PERSONALIZATION</Text>
          </View>
          <Text className="text-white mt-3 leading-6">{aiPersonalization.summary}</Text>
          <View className="mt-3" style={{ gap: 8 }}>
            {aiPersonalization.doctor_focus.slice(0, 3).map((focus) => (
              <View key={focus} className="flex-row items-start">
                <View className="h-2 w-2 rounded-full bg-accentPurple mt-2" />
                <Text className="text-textMuted ml-3 flex-1 leading-6">{focus}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View className="mt-4 rounded-2xl border border-white/10 bg-card/80 p-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <MaterialCommunityIcons name="file-document-multiple-outline" size={16} color="#4F7BFF" />
            <Text className="text-textMuted text-xs tracking-widest ml-2">HEALTH REPORTS</Text>
          </View>
          <Text className="text-white text-sm font-semibold">{reports.length}</Text>
        </View>
        <Text className="text-textMuted mt-3 leading-6">
          {isAnalyzingAi
            ? "AI is currently analyzing your reports and refreshing daily metric targets."
            : aiPersonalization
              ? "Your dashboard is actively personalized from uploaded reports and profile context."
              : "Upload reports and run AI analysis to personalize what gets tracked."}
        </Text>
      </View>
    </ScrollView>
  );
}
