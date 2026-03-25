import type { DailyHealthRecord, HealthMetricKey, MetricTargets, UserProfile } from "../types/health";
import { SLEEP_GOAL_HOURS, STEP_GOAL, WATER_GOAL_ML } from "../types/health";
import { getCalorieTarget } from "../services/metricService";

type ScoreBreakdownItem = {
  metric: HealthMetricKey;
  ratio: number;
  contribution: number;
};

export type ScoreResult = {
  score: number;
  breakdown: ScoreBreakdownItem[];
};

const PRIORITY_WEIGHTS: Record<HealthMetricKey, number> = {
  sleep: 4,
  steps: 3,
  water: 3,
  calories: 2,
  weight: 2,
  blood_pressure_sys: 3,
  blood_pressure_dia: 3,
  heart_rate: 2,
  blood_sugar: 3
};

function clampRatio(value: number, target: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(target) || target <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(value / target, 1));
}

function resolveTarget(
  metric: HealthMetricKey,
  profile: UserProfile,
  metricTargets: MetricTargets
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
  if (metric === "blood_pressure_sys") return 120;
  if (metric === "blood_pressure_dia") return 80;
  if (metric === "heart_rate") return 70;
  if (metric === "blood_sugar") return 100;
  return profile.weight > 0 ? profile.weight : 1;
}

function getSleepRatio(record: DailyHealthRecord, target: number): number {
  return clampRatio(record.sleep_hours, target);
}

function getStepsRatio(record: DailyHealthRecord, target: number): number {
  return clampRatio(record.steps, target);
}

function getWaterRatio(record: DailyHealthRecord, target: number): number {
  return clampRatio(record.water_ml, target);
}

function getCaloriesRatio(record: DailyHealthRecord, profile: UserProfile, target: number): number {
  if (record.calories <= 0) {
    return 0;
  }

  const deviationRatio = Math.abs(record.calories - target) / (target * 0.35);
  const baseScore = Math.max(0, 1 - deviationRatio);

  if (profile.goal === "fat_loss" && record.calories > target * 1.2) {
    return baseScore * 0.7;
  }

  return baseScore;
}

function getWeightRatio(record: DailyHealthRecord, profile: UserProfile, target: number): number {
  const currentWeight = record.weight_kg;
  const baselineWeight = target > 0 ? target : profile.weight;

  if (currentWeight <= 0 || baselineWeight <= 0) {
    return 0;
  }

  if (profile.goal === "fat_loss") {
    if (currentWeight <= baselineWeight) {
      return 1;
    }
    const overRatio = (currentWeight - baselineWeight) / (baselineWeight * 0.04);
    return Math.max(0, 1 - overRatio);
  }

  if (profile.goal === "muscle_gain") {
    if (currentWeight >= baselineWeight) {
      return 1;
    }
    const underRatio = (baselineWeight - currentWeight) / (baselineWeight * 0.03);
    return Math.max(0, 1 - underRatio);
  }

  const driftRatio = Math.abs(currentWeight - baselineWeight) / (baselineWeight * 0.05);
  return Math.max(0, 1 - driftRatio);
}

function getMetricRatio(
  metric: HealthMetricKey,
  record: DailyHealthRecord,
  profile: UserProfile,
  metricTargets: MetricTargets
): number {
  const target = resolveTarget(metric, profile, metricTargets);

  if (metric === "sleep") {
    return getSleepRatio(record, target);
  }
  if (metric === "steps") {
    return getStepsRatio(record, target);
  }
  if (metric === "water") {
    return getWaterRatio(record, target);
  }
  if (metric === "calories") {
    return getCaloriesRatio(record, profile, target);
  }
  if (metric === "blood_pressure_sys") {
    // Optimal: 90–120. Penalise over 130 or under 90.
    const sys = record.blood_pressure_sys;
    if (sys <= 0) return 0;
    if (sys >= 90 && sys <= 120) return 1;
    const deviation = sys > 120 ? (sys - 120) / 30 : (90 - sys) / 20;
    return Math.max(0, 1 - deviation);
  }
  if (metric === "blood_pressure_dia") {
    const dia = record.blood_pressure_dia;
    if (dia <= 0) return 0;
    if (dia >= 60 && dia <= 80) return 1;
    const deviation = dia > 80 ? (dia - 80) / 20 : (60 - dia) / 15;
    return Math.max(0, 1 - deviation);
  }
  if (metric === "heart_rate") {
    const hr = record.heart_rate;
    if (hr <= 0) return 0;
    if (hr >= 60 && hr <= 80) return 1;
    const deviation = hr > 80 ? (hr - 80) / 40 : (60 - hr) / 20;
    return Math.max(0, 1 - deviation);
  }
  if (metric === "blood_sugar") {
    const sugar = record.blood_sugar;
    if (sugar <= 0) return 0;
    if (sugar >= 70 && sugar <= 100) return 1;
    const deviation = sugar > 100 ? (sugar - 100) / 60 : (70 - sugar) / 30;
    return Math.max(0, 1 - deviation);
  }
  return getWeightRatio(record, profile, target);
}

export function calculateDynamicHealthScore(
  record: DailyHealthRecord,
  profile: UserProfile,
  activeMetrics: HealthMetricKey[],
  metricTargets: MetricTargets = {}
): ScoreResult {
  if (!activeMetrics.length) {
    return { score: 0, breakdown: [] };
  }

  const totalPriority = activeMetrics.reduce(
    (sum, metric) => sum + PRIORITY_WEIGHTS[metric],
    0
  );

  let totalScore = 0;
  const breakdown: ScoreBreakdownItem[] = [];

  for (const metric of activeMetrics) {
    const ratio = getMetricRatio(metric, record, profile, metricTargets);
    const metricWeightShare = PRIORITY_WEIGHTS[metric] / totalPriority;
    const contribution = ratio * metricWeightShare * 100;
    totalScore += contribution;
    breakdown.push({
      metric,
      ratio,
      contribution
    });
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(totalScore))),
    breakdown
  };
}
