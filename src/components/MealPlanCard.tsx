import { Pressable, ScrollView, Text, View } from "react-native";
import { useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { DailyMealTemplate } from "../types/health";

type Props = { templates: DailyMealTemplate[] };

const TEMPLATE_COLORS: Record<string, string> = {
  "Regular Day": "#4F7BFF",
  "Workout Day": "#45D5A5",
  "Rest Day":    "#9A6CFF",
};

const MEAL_ICONS: Record<string, string> = {
  "8:00 AM": "weather-sunrise",
  "7:00 AM": "weather-sunrise",
  "7:30 AM": "weather-sunrise",
  "10:30 AM": "coffee-outline",
  "1:00 PM": "silverware-fork-knife",
  "1:30 PM": "silverware-fork-knife",
  "4:00 PM": "apple",
  "4:30 PM": "apple",
  "7:30 PM": "moon-waning-crescent",
  "8:00 PM": "moon-waning-crescent",
};

function getMealIcon(time: string): string {
  return MEAL_ICONS[time] ?? "food-outline";
}

function getColor(label: string): string {
  return TEMPLATE_COLORS[label] ?? "#FF8A65";
}

export function MealPlanCard({ templates }: Props): JSX.Element {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = templates[activeIndex];
  if (!active) return <></>;
  const color = getColor(active.label);

  return (
    <View className="mt-4 rounded-2xl overflow-hidden" style={{ borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: 20 }}>
      {/* Header */}
      <LinearGradient
        colors={[`${color}22`, `${color}08`]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={{ padding: 16, paddingBottom: 12 }}
      >
        <View className="flex-row items-center mb-3">
          <MaterialCommunityIcons name="food-apple-outline" size={15} color={color} />
          <Text style={{ color }} className="text-xs tracking-widest font-bold ml-2">AI MEAL PLAN</Text>
        </View>

        {/* Tab switcher */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row" style={{ gap: 8 }}>
            {templates.map((t, i) => {
              const tc = getColor(t.label);
              const isActive = i === activeIndex;
              return (
                <Pressable
                  key={t.label}
                  onPress={() => setActiveIndex(i)}
                  style={{
                    backgroundColor: isActive ? `${tc}30` : "rgba(255,255,255,0.05)",
                    borderColor: isActive ? `${tc}80` : "rgba(255,255,255,0.10)",
                    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8,
                  }}
                >
                  <Text style={{ color: isActive ? tc : "#A8A8BF" }} className="text-sm font-semibold">{t.label}</Text>
                  <Text style={{ color: isActive ? tc : "#666680" }} className="text-xs mt-0.5">{t.total_calories} kcal</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </LinearGradient>

      {/* Meal list */}
      <View style={{ backgroundColor: "#141420", padding: 14, gap: 10 }}>
        {active.meals.map((meal, index) => (
          <View
            key={`${meal.name}-${index}`}
            style={{
              backgroundColor: "rgba(255,255,255,0.04)",
              borderColor: "rgba(255,255,255,0.07)",
              borderWidth: 1, borderRadius: 14, padding: 12,
              flexDirection: "row", alignItems: "center",
            }}
          >
            {/* Icon circle */}
            <View
              style={{ backgroundColor: `${color}20`, borderColor: `${color}30`, borderWidth: 1, borderRadius: 24, height: 40, width: 40, alignItems: "center", justifyContent: "center", marginRight: 12 }}
            >
              <MaterialCommunityIcons name={getMealIcon(meal.time) as never} size={16} color={color} />
            </View>

            {/* Info */}
            <View className="flex-1">
              <Text className="text-white text-sm font-semibold">{meal.name}</Text>
              {meal.notes ? <Text className="text-textMuted text-xs mt-0.5">{meal.notes}</Text> : null}
              <Text style={{ color: "#666680" }} className="text-xs mt-0.5">{meal.time}</Text>
            </View>

            {/* Calories badge */}
            <View style={{ backgroundColor: `${color}18`, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ color }} className="text-xs font-bold">{meal.calories}</Text>
              <Text style={{ color: `${color}80` }} className="text-xs">kcal</Text>
            </View>
          </View>
        ))}

        {/* Total bar */}
        <LinearGradient
          colors={[`${color}22`, `${color}10`]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ borderRadius: 12, borderWidth: 1, borderColor: `${color}30`, padding: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
        >
          <View className="flex-row items-center">
            <MaterialCommunityIcons name="fire" size={16} color={color} />
            <Text className="text-textMuted text-sm ml-2">Daily Total</Text>
          </View>
          <Text style={{ color }} className="text-lg font-extrabold">{active.total_calories} kcal</Text>
        </LinearGradient>
      </View>
    </View>
  );
}
