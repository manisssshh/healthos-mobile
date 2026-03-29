import { Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { WeeklyWorkoutPlan, WorkoutDay, WorkoutType } from "../types/health";
import { useTheme } from "../context/ThemeContext";

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
  const { colors } = useTheme();
  const meta = WORKOUT_META[day.type];
  return (
    <View style={{ flex: 1, alignItems: "center", gap: 4 }}>
      <View
        style={{
          height: 34, width: 34, borderRadius: 17,
          backgroundColor: isToday ? meta.color : colors.overlayLight,
          borderWidth: 1,
          borderColor: isToday ? meta.color : colors.border,
          alignItems: "center", justifyContent: "center",
        }}
      >
        <MaterialCommunityIcons
          name={meta.icon as never}
          size={14}
          color={isToday ? "#fff" : meta.color}
        />
      </View>
      <Text style={{ color: isToday ? colors.text : colors.textMuted, fontSize: 10, fontWeight: isToday ? "700" : "400" }}>
        {DAY_SHORT[dayKey]}
      </Text>
    </View>
  );
}

export function WorkoutPlanCard({ plan, todayKey }: Props): JSX.Element {
  const { colors } = useTheme();
  const todayWorkout = plan[todayKey];
  const meta = WORKOUT_META[todayWorkout.type];

  return (
    <View style={{ marginTop: 16, borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
      {/* Header */}
      <LinearGradient
        colors={[`${meta.color}22`, `${meta.color}06`]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={{ padding: 16, paddingBottom: 14 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
          <MaterialCommunityIcons name="dumbbell" size={15} color={meta.color} />
          <Text style={{ color: meta.color, fontSize: 11, letterSpacing: 1.5, fontWeight: "700", marginLeft: 8 }}>7-DAY WORKOUT PLAN</Text>
        </View>

        {/* Day dots */}
        <View style={{ flexDirection: "row", gap: 4 }}>
          {DAY_ORDER.map((d) => (
            <DayDot key={d} dayKey={d} day={plan[d]} isToday={d === todayKey} />
          ))}
        </View>
      </LinearGradient>

      {/* Today's session */}
      <View style={{ backgroundColor: colors.surface, padding: 14 }}>
        <Text style={{ color: colors.textMuted, fontSize: 11, letterSpacing: 1.5, marginBottom: 12 }}>TODAY'S SESSION</Text>

        <LinearGradient
          colors={[meta.bgColor, "transparent"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ borderRadius: 16, borderWidth: 1, borderColor: `${meta.color}30`, padding: 14 }}
        >
          {/* Session header */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View
                style={{ backgroundColor: `${meta.color}25`, borderRadius: 22, height: 44, width: 44, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: `${meta.color}40` }}
              >
                <MaterialCommunityIcons name={meta.icon as never} size={20} color={meta.color} />
              </View>
              <View style={{ marginLeft: 12 }}>
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>{todayWorkout.name}</Text>
                <Text style={{ color: meta.color, fontSize: 12, fontWeight: "600", textTransform: "capitalize", marginTop: 2 }}>{todayWorkout.type}</Text>
              </View>
            </View>
            {todayWorkout.duration_minutes > 0 ? (
              <View style={{ backgroundColor: `${meta.color}20`, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 }}>
                <Text style={{ color: meta.color, fontSize: 14, fontWeight: "700" }}>{todayWorkout.duration_minutes} min</Text>
              </View>
            ) : null}
          </View>

          {/* Exercises */}
          {todayWorkout.exercises.length > 0 ? (
            <View style={{ gap: 8 }}>
              {todayWorkout.exercises.map((ex, i) => (
                <View key={`${ex}-${i}`} style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={{ height: 6, width: 6, borderRadius: 3, backgroundColor: meta.color, marginRight: 10 }} />
                  <Text style={{ color: colors.text, fontSize: 14, flex: 1, lineHeight: 20 }}>{ex}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <MaterialCommunityIcons name="sleep" size={16} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, fontSize: 14 }}>Rest & recover. No exercise today.</Text>
            </View>
          )}
        </LinearGradient>
      </View>
    </View>
  );
}
