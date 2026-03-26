import { Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { WeeklyWorkoutPlan, WorkoutDay, WorkoutType } from "../types/health";

type Props = {
  plan: WeeklyWorkoutPlan;
  todayKey: keyof WeeklyWorkoutPlan;
};

type WorkoutMeta = { color: string; icon: string; bgColor: string };

const WORKOUT_META: Record<WorkoutType, WorkoutMeta> = {
  cardio:      { color: "#4F7BFF", icon: "run",          bgColor: "rgba(79,123,255,0.15)"  },
  strength:    { color: "#FF8A65", icon: "dumbbell",      bgColor: "rgba(255,138,101,0.15)" },
  flexibility: { color: "#9A6CFF", icon: "yoga",          bgColor: "rgba(154,108,255,0.15)" },
  rest:        { color: "#A8A8BF", icon: "sleep",         bgColor: "rgba(168,168,191,0.08)" },
};

const DAY_ORDER: Array<keyof WeeklyWorkoutPlan> = [
  "monday","tuesday","wednesday","thursday","friday","saturday","sunday"
];
const DAY_SHORT: Record<keyof WeeklyWorkoutPlan, string> = {
  monday:"M", tuesday:"T", wednesday:"W", thursday:"T", friday:"F", saturday:"S", sunday:"S"
};

function DayDot({ dayKey, day, isToday }: { dayKey: keyof WeeklyWorkoutPlan; day: WorkoutDay; isToday: boolean }): JSX.Element {
  const meta = WORKOUT_META[day.type];
  return (
    <View className="flex-1 items-center" style={{ gap: 4 }}>
      <View
        style={{
          height: 34, width: 34, borderRadius: 17,
          backgroundColor: isToday ? meta.color : "rgba(255,255,255,0.05)",
          borderWidth: 1,
          borderColor: isToday ? meta.color : "rgba(255,255,255,0.08)",
          alignItems: "center", justifyContent: "center",
        }}
      >
        <MaterialCommunityIcons
          name={meta.icon as never}
          size={14}
          color={isToday ? "#fff" : meta.color}
        />
      </View>
      <Text style={{ color: isToday ? "#fff" : "#555570", fontSize: 10, fontWeight: isToday ? "700" : "400" }}>
        {DAY_SHORT[dayKey]}
      </Text>
    </View>
  );
}

export function WorkoutPlanCard({ plan, todayKey }: Props): JSX.Element {
  const todayWorkout = plan[todayKey];
  const meta = WORKOUT_META[todayWorkout.type];

  return (
    <View className="mt-4 rounded-2xl overflow-hidden" style={{ borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: 20 }}>
      {/* Header */}
      <LinearGradient
        colors={[`${meta.color}22`, `${meta.color}06`]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={{ padding: 16, paddingBottom: 14 }}
      >
        <View className="flex-row items-center mb-4">
          <MaterialCommunityIcons name="dumbbell" size={15} color={meta.color} />
          <Text style={{ color: meta.color }} className="text-xs tracking-widest font-bold ml-2">7-DAY WORKOUT PLAN</Text>
        </View>

        {/* Day dots */}
        <View className="flex-row" style={{ gap: 4 }}>
          {DAY_ORDER.map((d) => (
            <DayDot key={d} dayKey={d} day={plan[d]} isToday={d === todayKey} />
          ))}
        </View>
      </LinearGradient>

      {/* Today's session */}
      <View style={{ backgroundColor: "#141420", padding: 14 }}>
        <Text className="text-textMuted text-xs tracking-widest mb-3">TODAY'S SESSION</Text>

        <LinearGradient
          colors={[meta.bgColor, "transparent"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ borderRadius: 16, borderWidth: 1, borderColor: `${meta.color}30`, padding: 14 }}
        >
          {/* Session header */}
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center">
              <View
                style={{ backgroundColor: `${meta.color}25`, borderRadius: 22, height: 44, width: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: `${meta.color}40` }}
              >
                <MaterialCommunityIcons name={meta.icon as never} size={20} color={meta.color} />
              </View>
              <View className="ml-3">
                <Text className="text-white font-bold text-base">{todayWorkout.name}</Text>
                <Text style={{ color: meta.color }} className="text-xs font-semibold capitalize mt-0.5">{todayWorkout.type}</Text>
              </View>
            </View>
            {todayWorkout.duration_minutes > 0 ? (
              <View style={{ backgroundColor: `${meta.color}20`, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 }}>
                <Text style={{ color: meta.color }} className="text-sm font-bold">{todayWorkout.duration_minutes} min</Text>
              </View>
            ) : null}
          </View>

          {/* Exercises */}
          {todayWorkout.exercises.length > 0 ? (
            <View style={{ gap: 8 }}>
              {todayWorkout.exercises.map((ex, i) => (
                <View key={`${ex}-${i}`} className="flex-row items-center">
                  <View style={{ height: 6, width: 6, borderRadius: 3, backgroundColor: meta.color, marginRight: 10 }} />
                  <Text className="text-white text-sm flex-1 leading-5">{ex}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View className="flex-row items-center" style={{ gap: 8 }}>
              <MaterialCommunityIcons name="sleep" size={16} color="#A8A8BF" />
              <Text className="text-textMuted text-sm">Rest & recover. No exercise today.</Text>
            </View>
          )}
        </LinearGradient>
      </View>
    </View>
  );
}
