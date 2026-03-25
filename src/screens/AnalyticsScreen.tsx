import { ScrollView, Text, View } from "react-native";
import { useMemo } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useHealthStore } from "../store/useHealthStore";
import { getMetricPresentationList } from "../services/metricService";
import { formatShortDay } from "../utils/dateUtils";
import { TrendChart } from "../components/TrendChart";
import { getWeeklyRiskAreas } from "../services/insightService";
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

function averageMetric(metric: HealthMetricKey, records: DailyHealthRecord[]): number {
  if (!records.length) {
    return 0;
  }
  const total = records.reduce((sum, record) => sum + metricValue(metric, record), 0);
  return total / records.length;
}

function formatMetric(metric: HealthMetricKey, value: number): string {
  if (metric === "sleep" || metric === "weight") {
    return value.toFixed(1);
  }
  return String(Math.round(value));
}

export function AnalyticsScreen(): JSX.Element {
  const profile = useHealthStore((state) => state.profile);
  const activeMetrics = useHealthStore((state) => state.activeMetrics);
  const weeklyRecords = useHealthStore((state) => state.weeklyRecords);
  const aiPersonalization = useHealthStore((state) => state.aiPersonalization);

  const metricPresentation = useMemo(() => {
    if (!profile) {
      return [];
    }
    return getMetricPresentationList(activeMetrics, profile, aiPersonalization?.metric_targets);
  }, [activeMetrics, aiPersonalization?.metric_targets, profile]);

  const riskAreas = useMemo(
    () => getWeeklyRiskAreas(weeklyRecords, activeMetrics, aiPersonalization?.metric_targets),
    [activeMetrics, aiPersonalization?.metric_targets, weeklyRecords]
  );

  if (!profile) {
    return <View className="flex-1" />;
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingBottom: 122, gap: 14 }}
      showsVerticalScrollIndicator={false}
    >
      <Text className="text-white text-2xl font-bold mt-2">Weekly Analytics</Text>
      <Text className="text-textMuted text-sm">Trends for your active doctor-guided metrics.</Text>

      {aiPersonalization ? (
        <View className="rounded-2xl border border-white/10 bg-card/80 p-4">
          <Text className="text-textMuted text-xs tracking-widest">AI CLINICAL FOCUS</Text>
          <View className="mt-3" style={{ gap: 8 }}>
            {aiPersonalization.doctor_focus.slice(0, 3).map((focus) => (
              <View key={focus} className="flex-row items-start">
                <MaterialCommunityIcons name="stethoscope" size={16} color="#9A6CFF" />
                <Text className="text-white ml-2 flex-1 leading-6">{focus}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View className="rounded-2xl border border-white/10 bg-card/80 p-4">
        <Text className="text-textMuted text-xs tracking-widest">WEEKLY RISK AREAS</Text>
        <View className="mt-3" style={{ gap: 8 }}>
          {riskAreas.map((risk) => (
            <View key={risk} className="flex-row items-start">
              <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#FF8A65" />
              <Text className="text-white ml-2 flex-1 leading-6">{risk}</Text>
            </View>
          ))}
        </View>
      </View>

      {metricPresentation.map((metric) => {
        const values = weeklyRecords.map((record) => metricValue(metric.key, record));
        const average = averageMetric(metric.key, weeklyRecords);

        return (
          <View key={metric.key} className="rounded-2xl border border-white/10 bg-card/80 p-4">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <View
                  style={{ backgroundColor: `${metric.color}22` }}
                  className="h-8 w-8 rounded-full items-center justify-center border border-white/10"
                >
                  <MaterialCommunityIcons name={metric.icon as never} size={16} color={metric.color} />
                </View>
                <Text className="text-white text-lg font-semibold ml-2">{metric.label}</Text>
              </View>
              <Text className="text-textMuted text-sm">
                Avg {formatMetric(metric.key, average)} {metric.unit}
              </Text>
            </View>

            <View className="mt-3">
              <TrendChart values={values} color={metric.color} />
            </View>

            <View className="mt-3 flex-row justify-between">
              {weeklyRecords.map((record) => (
                <Text key={`${metric.key}-${record.date}`} className="text-textMuted text-xs">
                  {formatShortDay(record.date)}
                </Text>
              ))}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}
