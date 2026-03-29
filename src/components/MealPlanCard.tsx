import { Pressable, ScrollView, Text, View } from "react-native";
import { useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { DailyMealTemplate } from "../types/health";
import { useTheme } from "../context/ThemeContext";

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
  const { colors } = useTheme();
  const [activeIndex, setActiveIndex] = useState(0);
  const active = templates[activeIndex];
  if (!active) return <></>;
  const color = getColor(active.label);

  return (
    <View style={{ marginTop: 16, borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
      {/* Header */}
      <LinearGradient
        colors={[`${color}22`, `${color}08`]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={{ padding: 16, paddingBottom: 12 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
          <MaterialCommunityIcons name="food-apple-outline" size={15} color={color} />
          <Text style={{ color, fontSize: 11, letterSpacing: 1.5, fontWeight: "700", marginLeft: 8 }}>AI MEAL PLAN</Text>
        </View>

        {/* Tab switcher */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {templates.map((t, i) => {
              const tc = getColor(t.label);
              const isActive = i === activeIndex;
              return (
                <Pressable
                  key={t.label}
                  onPress={() => setActiveIndex(i)}
                  style={{
                    backgroundColor: isActive ? `${tc}30` : colors.overlayLight,
                    borderColor: isActive ? `${tc}80` : colors.border,
                    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8,
                  }}
                >
                  <Text style={{ color: isActive ? tc : colors.textMuted, fontSize: 14, fontWeight: "600" }}>{t.label}</Text>
                  <Text style={{ color: isActive ? tc : colors.textMuted, fontSize: 12, marginTop: 2, opacity: 0.7 }}>{t.total_calories} kcal</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </LinearGradient>

      {/* Meal list */}
      <View style={{ backgroundColor: colors.surface, padding: 14, gap: 10 }}>
        {active.meals.map((meal, index) => (
          <View
            key={`${meal.name}-${index}`}
            style={{
              backgroundColor: colors.overlayLight,
              borderColor: colors.border,
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
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>{meal.name}</Text>
              {meal.notes ? <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{meal.notes}</Text> : null}
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{meal.time}</Text>
            </View>

            {/* Calories badge */}
            <View style={{ backgroundColor: `${color}18`, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ color, fontSize: 12, fontWeight: "700" }}>{meal.calories}</Text>
              <Text style={{ color: `${color}80`, fontSize: 11 }}>kcal</Text>
            </View>
          </View>
        ))}

        {/* Total bar */}
        <LinearGradient
          colors={[`${color}22`, `${color}10`]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ borderRadius: 12, borderWidth: 1, borderColor: `${color}30`, padding: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <MaterialCommunityIcons name="fire" size={16} color={color} />
            <Text style={{ color: colors.textMuted, fontSize: 14, marginLeft: 8 }}>Daily Total</Text>
          </View>
          <Text style={{ color, fontSize: 18, fontWeight: "800" }}>{active.total_calories} kcal</Text>
        </LinearGradient>
      </View>
    </View>
  );
}
