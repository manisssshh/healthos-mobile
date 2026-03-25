import type { AiPersonalization, HealthMetricKey, MetricTargets, UserProfile } from "../types/health";
import { CALORIES_REFERENCE, SLEEP_GOAL_HOURS, STEP_GOAL, WATER_GOAL_ML } from "../types/health";

export type MetricPresentation = {
  key: HealthMetricKey;
  label: string;
  unit: string;
  goal: number;
  icon: string;
  color: string;
};

const BASE_METRICS: HealthMetricKey[] = ["sleep", "steps", "water"];
const METRIC_ORDER: HealthMetricKey[] = [
  "sleep",
  "steps",
  "water",
  "calories",
  "weight",
  "blood_pressure_sys",
  "blood_pressure_dia",
  "heart_rate",
  "blood_sugar"
];

const METRIC_PRESENTATION_MAP: Record<HealthMetricKey, MetricPresentation> = {
  sleep: {
    key: "sleep",
    label: "Sleep",
    unit: "hrs",
    goal: SLEEP_GOAL_HOURS,
    icon: "power-sleep",
    color: "#9A6CFF"
  },
  steps: {
    key: "steps",
    label: "Steps",
    unit: "",
    goal: STEP_GOAL,
    icon: "shoe-print",
    color: "#4F7BFF"
  },
  water: {
    key: "water",
    label: "Water",
    unit: "ml",
    goal: WATER_GOAL_ML,
    icon: "water",
    color: "#45D5A5"
  },
  calories: {
    key: "calories",
    label: "Calories",
    unit: "kcal",
    goal: CALORIES_REFERENCE,
    icon: "fire",
    color: "#FF8A65"
  },
  weight: {
    key: "weight",
    label: "Weight",
    unit: "kg",
    goal: 0,
    icon: "scale-bathroom",
    color: "#FFD166"
  },
  blood_pressure_sys: {
    key: "blood_pressure_sys",
    label: "BP Sys",
    unit: "mmHg",
    goal: 120,
    icon: "heart-pulse",
    color: "#EF476F"
  },
  blood_pressure_dia: {
    key: "blood_pressure_dia",
    label: "BP Dia",
    unit: "mmHg",
    goal: 80,
    icon: "heart-pulse",
    color: "#EF476F"
  },
  heart_rate: {
    key: "heart_rate",
    label: "Heart Rate",
    unit: "bpm",
    goal: 70,
    icon: "heart",
    color: "#EF476F"
  },
  blood_sugar: {
    key: "blood_sugar",
    label: "Blood Sugar",
    unit: "mg/dL",
    goal: 100,
    icon: "water-outline",
    color: "#06D6A0"
  }
};

export function getCalorieTarget(goal: UserProfile["goal"]): number {
  if (goal === "fat_loss") {
    return 2200;
  }
  if (goal === "muscle_gain") {
    return 2800;
  }
  if (goal === "medical_monitoring") {
    return 2300;
  }
  return 2500;
}

export function generateActiveMetrics(profile: UserProfile): HealthMetricKey[] {
  const metrics = new Set<HealthMetricKey>(BASE_METRICS);

  if (profile.goal === "fat_loss" || profile.goal === "muscle_gain") {
    metrics.add("calories");
    metrics.add("weight");
  }

  if (profile.goal === "medical_monitoring") {
    metrics.add("weight");
    metrics.add("blood_pressure_sys");
    metrics.add("blood_pressure_dia");
    metrics.add("heart_rate");
  }

  if (profile.conditions.includes("high_sugar")) {
    metrics.add("calories");
    metrics.add("blood_sugar");
  }

  if (profile.conditions.includes("high_cholesterol")) {
    metrics.add("calories");
    metrics.add("blood_pressure_sys");
    metrics.add("blood_pressure_dia");
  }

  if (profile.conditions.includes("thyroid_issues")) {
    metrics.add("weight");
    metrics.add("heart_rate");
  }

  return METRIC_ORDER.filter((metric) => metrics.has(metric));
}

export function resolveActiveMetrics(
  profile: UserProfile,
  aiPersonalization: AiPersonalization | null
): HealthMetricKey[] {
  const fallbackMetrics = generateActiveMetrics(profile);
  if (!aiPersonalization?.active_metrics?.length) {
    return fallbackMetrics;
  }

  const metrics = new Set<HealthMetricKey>(BASE_METRICS);
  aiPersonalization.active_metrics.forEach((metric) => metrics.add(metric));
  return METRIC_ORDER.filter((metric) => metrics.has(metric));
}

export function getMetricPresentation(
  metric: HealthMetricKey,
  profile: UserProfile,
  metricTargets: MetricTargets = {}
): MetricPresentation {
  const targetOverride = metricTargets[metric];
  if (targetOverride && targetOverride > 0) {
    return {
      ...METRIC_PRESENTATION_MAP[metric],
      goal: targetOverride
    };
  }

  if (metric !== "calories") {
    return METRIC_PRESENTATION_MAP[metric];
  }

  return {
    ...METRIC_PRESENTATION_MAP.calories,
    goal: getCalorieTarget(profile.goal)
  };
}

export function getMetricPresentationList(
  metrics: HealthMetricKey[],
  profile: UserProfile,
  metricTargets: MetricTargets = {}
): MetricPresentation[] {
  return metrics.map((metric) => getMetricPresentation(metric, profile, metricTargets));
}
