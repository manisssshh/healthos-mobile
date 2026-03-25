import type {
  AiPersonalization,
  DailyHealthRecord,
  HealthMetricKey,
  MetricTargets,
  UserProfile
} from "../types/health";
import { SLEEP_GOAL_HOURS, STEP_GOAL, WATER_GOAL_ML } from "../types/health";
import { getCalorieTarget } from "./metricService";

function hasCondition(profile: UserProfile, condition: UserProfile["conditions"][number]): boolean {
  return profile.conditions.includes(condition);
}

function getTarget(
  metric: HealthMetricKey,
  profile: UserProfile,
  metricTargets: MetricTargets = {}
): number {
  const override = metricTargets[metric];
  if (typeof override === "number" && Number.isFinite(override) && override > 0) {
    return override;
  }
  if (metric === "sleep") {
    return SLEEP_GOAL_HOURS;
  }
  if (metric === "steps") {
    return STEP_GOAL;
  }
  if (metric === "water") {
    return WATER_GOAL_ML;
  }
  if (metric === "calories") {
    return getCalorieTarget(profile.goal);
  }
  return profile.weight;
}

export function getDoctorInsight(
  record: DailyHealthRecord,
  profile: UserProfile,
  activeMetrics: HealthMetricKey[],
  weeklyRecords: DailyHealthRecord[],
  aiPersonalization: AiPersonalization | null = null
): string {
  const metricTargets = aiPersonalization?.metric_targets ?? {};
  const sleepTarget = getTarget("sleep", profile, metricTargets);
  const stepsTarget = getTarget("steps", profile, metricTargets);
  const waterTarget = getTarget("water", profile, metricTargets);

  if (record.sleep_hours < sleepTarget * 0.75) {
    return "Low sleep is reducing your recovery.";
  }

  if (record.steps < stepsTarget * 0.5) {
    if (profile.goal === "fat_loss") {
      return "Your steps are below recommended level for fat loss.";
    }
    if (hasCondition(profile, "high_sugar")) {
      return "Your activity is low for blood sugar management.";
    }
    return "Your activity is low for your condition.";
  }

  if (record.water_ml < waterTarget * 0.66) {
    if (hasCondition(profile, "high_sugar") || hasCondition(profile, "thyroid_issues")) {
      return "Hydration is insufficient for your condition.";
    }
    return "Hydration is below your recommended daily range.";
  }

  if (activeMetrics.includes("calories")) {
    const targetCalories = getTarget("calories", profile, metricTargets);
    if (record.calories > targetCalories * 1.15) {
      if (profile.goal === "fat_loss") {
        return "Calorie intake is above your fat loss zone today.";
      }
      if (hasCondition(profile, "high_cholesterol")) {
        return "Calorie intake is high for cholesterol-focused monitoring.";
      }
      return "Calorie load is high for your active health target.";
    }
  }

  if (activeMetrics.includes("weight")) {
    if (record.weight_kg <= 0) {
      return "Log your weight to improve doctor-style tracking accuracy.";
    }

    const weightTarget = getTarget("weight", profile, metricTargets);
    if (profile.goal === "fat_loss" && record.weight_kg > weightTarget * 1.01) {
      return "Weight is trending above your baseline for fat loss.";
    }
  }

  const poorSleepDays = weeklyRecords.filter(
    (item) => item.sleep_hours > 0 && item.sleep_hours < sleepTarget * 0.75
  ).length;
  if (poorSleepDays >= 3) {
    return "Sleep consistency is poor this week and may slow recovery.";
  }

  if (aiPersonalization?.doctor_focus?.length) {
    return aiPersonalization.doctor_focus[0];
  }

  return "Good trend today. Keep consistency for better outcomes.";
}

export function getWeeklyRiskAreas(
  weeklyRecords: DailyHealthRecord[],
  activeMetrics: HealthMetricKey[],
  metricTargets: MetricTargets = {}
): string[] {
  if (!weeklyRecords.length) {
    return ["No weekly data yet. Start logging for risk analysis."];
  }

  const areas: string[] = [];
  const stepsTarget = typeof metricTargets.steps === "number" ? metricTargets.steps : STEP_GOAL;
  const sleepTarget = typeof metricTargets.sleep === "number" ? metricTargets.sleep : SLEEP_GOAL_HOURS;
  const waterTarget = typeof metricTargets.water === "number" ? metricTargets.water : WATER_GOAL_ML;
  const avgSteps =
    weeklyRecords.reduce((sum, item) => sum + item.steps, 0) / weeklyRecords.length;
  const avgSleep =
    weeklyRecords.reduce((sum, item) => sum + item.sleep_hours, 0) / weeklyRecords.length;
  const hydrationLowDays = weeklyRecords.filter(
    (item) => item.water_ml > 0 && item.water_ml < waterTarget * 0.66
  ).length;

  if (activeMetrics.includes("steps") && avgSteps < stepsTarget * 0.6) {
    areas.push("Low activity trend this week.");
  }

  if (activeMetrics.includes("sleep") && avgSleep < sleepTarget * 0.8) {
    areas.push("Poor sleep trend is affecting recovery.");
  }

  if (activeMetrics.includes("water") && hydrationLowDays >= 3) {
    if (waterTarget > WATER_GOAL_ML) {
      areas.push("Hydration is below your personalized clinical target.");
    } else {
      areas.push("Inconsistent hydration habits detected.");
    }
  }

  if (!areas.length) {
    return ["No major risk trend detected. Habits are stable this week."];
  }

  return areas;
}
