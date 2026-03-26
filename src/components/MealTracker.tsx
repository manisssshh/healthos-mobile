/**
 * MealTracker.tsx
 * Displays today's AI meal plan as a checklist.
 * Replaces the free-form food log. Users follow the plan — no manual input needed.
 */
import { useState } from "react";
import { Pressable, Text, View, ScrollView } from "react-native";
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { DailyMealTemplate, MealItem } from "../types/health";
import { useTheme } from "../context/ThemeContext";

type MealTrackerProps = {
  template: DailyMealTemplate;
};

function MealRow({ meal, index, onToggle, checked }: {
  meal: MealItem;
  index: number;
  checked: boolean;
  onToggle: () => void;
}): JSX.Element {
  const { colors } = useTheme();
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  function handlePress(): void {
    opacity.value = withTiming(0.6, { duration: 80 }, () => {
      opacity.value = withTiming(1, { duration: 120 });
    });
    onToggle();
  }

  const mealColors = [
    "#4F7BFF", "#9A6CFF", "#1AE5A7", "#FFB238", "#FF4158", "#06D6A0"
  ];
  const accentColor = mealColors[index % mealColors.length];

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 80).duration(350)}
      style={animatedStyle}
    >
      <Pressable onPress={handlePress}>
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 14,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          opacity: checked ? 0.55 : 1
        }}>
          {/* Time badge */}
          <View style={{
            backgroundColor: `${accentColor}18`,
            borderRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 4,
            minWidth: 70,
            alignItems: "center",
            marginRight: 12
          }}>
            <Text style={{ color: accentColor, fontSize: 11, fontWeight: "700" }}>{meal.time}</Text>
          </View>

          {/* Info */}
          <View style={{ flex: 1 }}>
            <Text style={{
              color: checked ? colors.textMuted : colors.text,
              fontSize: 14,
              fontWeight: "600",
              textDecorationLine: checked ? "line-through" : "none"
            }}>
              {meal.name}
            </Text>
            {meal.notes ? (
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{meal.notes}</Text>
            ) : null}
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
              ~{meal.calories} kcal
            </Text>
          </View>

          {/* Checkmark */}
          <View style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            backgroundColor: checked ? accentColor : "transparent",
            borderWidth: 2,
            borderColor: checked ? accentColor : colors.border,
            alignItems: "center",
            justifyContent: "center"
          }}>
            {checked ? (
              <MaterialCommunityIcons name="check" size={14} color="#000" />
            ) : null}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function MealTracker({ template }: MealTrackerProps): JSX.Element {
  const { colors } = useTheme();
  const [checkedMeals, setCheckedMeals] = useState<Set<number>>(new Set());

  function toggleMeal(index: number): void {
    setCheckedMeals((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  const completed = checkedMeals.size;
  const total = template.meals.length;
  const adherencePct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <LinearGradient
      colors={["rgba(26,229,167,0.10)", "rgba(26,229,167,0.03)"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "rgba(26,229,167,0.20)",
        overflow: "hidden",
        marginTop: 16
      }}
    >
      {/* Header */}
      <View style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.border
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ backgroundColor: "rgba(26,229,167,0.20)", borderRadius: 8, padding: 6 }}>
            <MaterialCommunityIcons name="food-apple-outline" size={14} color="#1AE5A7" />
          </View>
          <Text style={{ color: "#1AE5A7", fontSize: 10, fontWeight: "700", letterSpacing: 1.5 }}>
            TODAY&apos;S MEAL PLAN
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>
            {completed}/{total}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 10 }}>{adherencePct}% adherence</Text>
        </View>
      </View>

      {/* Adherence bar */}
      <View style={{ height: 3, backgroundColor: colors.cardMuted }}>
        <View style={{
          height: "100%",
          width: `${adherencePct}%`,
          backgroundColor: "#1AE5A7"
        }} />
      </View>

      {/* Meals */}
      {template.meals.map((meal, i) => (
        <MealRow
          key={i}
          meal={meal}
          index={i}
          checked={checkedMeals.has(i)}
          onToggle={() => toggleMeal(i)}
        />
      ))}

      {/* Footer totals */}
      <View style={{
        flexDirection: "row",
        justifyContent: "space-between",
        padding: 14,
        borderTopWidth: 1,
        borderTopColor: colors.border
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <MaterialCommunityIcons name="fire" size={13} color="#FFB238" />
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            Total: <Text style={{ color: colors.text, fontWeight: "700" }}>{template.total_calories} kcal</Text>
          </Text>
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 11 }}>{template.label}</Text>
      </View>
    </LinearGradient>
  );
}
