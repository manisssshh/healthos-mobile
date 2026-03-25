export type HealthGoal = "fat_loss" | "muscle_gain" | "general_fitness" | "medical_monitoring";

export type HealthCondition =
  | "high_sugar"
  | "high_cholesterol"
  | "low_vitamin_d"
  | "thyroid_issues";

export type ReportType = "blood_test" | "prescription";

export type HealthMetricKey =
  | "sleep"
  | "steps"
  | "water"
  | "calories"
  | "weight"
  | "blood_pressure_sys"
  | "blood_pressure_dia"
  | "heart_rate"
  | "blood_sugar";

export type MetricTargets = Partial<Record<HealthMetricKey, number>>;

export type UserProfile = {
  age: number;
  weight: number;
  height: number;
  goal: HealthGoal;
  conditions: HealthCondition[];
  created_at: string;
  updated_at: string;
};

export type UserProfileInput = {
  age: number;
  weight: number;
  height: number;
  goal: HealthGoal;
  conditions: HealthCondition[];
};

export type HealthReport = {
  id: number;
  file_url: string;
  type: ReportType;
  date: string;
  file_name: string;
};

export type HealthReportInput = Omit<HealthReport, "id">;

// ─── Meal Plan Types ─────────────────────────────────────────────────────────

export type MealItem = {
  /** Display time string e.g. "8:00 AM" */
  time: string;
  /** Dish / food name */
  name: string;
  /** Approximate calories for this meal */
  calories: number;
  /** Optional clinical or dietary note */
  notes?: string;
};

export type DailyMealTemplate = {
  /** Template label e.g. "Regular Day", "Workout Day", "Rest Day" */
  label: string;
  meals: MealItem[];
  /** Sum of all meal calories */
  total_calories: number;
};

// ─── Workout Plan Types ──────────────────────────────────────────────────────

export type WorkoutType = "cardio" | "strength" | "flexibility" | "rest";

export type WorkoutDay = {
  type: WorkoutType;
  /** Session name e.g. "Brisk Walk", "Upper Body Strength" */
  name: string;
  /** Total minutes of the session (0 for rest days) */
  duration_minutes: number;
  /** List of exercise instructions e.g. "Push-ups 3x12" */
  exercises: string[];
};

export type WeeklyWorkoutPlan = {
  monday: WorkoutDay;
  tuesday: WorkoutDay;
  wednesday: WorkoutDay;
  thursday: WorkoutDay;
  friday: WorkoutDay;
  saturday: WorkoutDay;
  sunday: WorkoutDay;
};

// ─── AI Personalization ──────────────────────────────────────────────────────

export type AiPersonalization = {
  active_metrics: HealthMetricKey[];
  metric_targets: MetricTargets;
  doctor_focus: string[];
  summary: string;
  source_report_ids: number[];
  generated_at: string;
  /** AI-generated meal plan templates (optional, requires Gemini API) */
  meal_plan?: DailyMealTemplate[];
  /** AI-generated 7-day workout schedule (optional, requires Gemini API) */
  workout_plan?: WeeklyWorkoutPlan;
  /** Short actionable health tips from report analysis */
  health_tips?: string[];
};

export type DailyHealthRecord = {
  date: string;
  water_ml: number;
  steps: number;
  sleep_hours: number;
  calories: number;
  weight_kg: number;
  food_intake: string;
  blood_pressure_sys: number;
  blood_pressure_dia: number;
  heart_rate: number;
  blood_sugar: number;
};

export type DailyHealthUpdates = Partial<Omit<DailyHealthRecord, "date">>;

export const WATER_GOAL_ML = 3000;
export const STEP_GOAL = 10000;
export const SLEEP_GOAL_HOURS = 8;
export const CALORIES_REFERENCE = 2500;

export const AGE_MIN = 12;
export const AGE_MAX = 90;
export const WEIGHT_MIN = 30;
export const WEIGHT_MAX = 250;
export const HEIGHT_MIN = 120;
export const HEIGHT_MAX = 230;

export const MAX_WATER_ML_ENTRY = 10000;
export const MAX_STEPS_ENTRY = 100000;
export const MAX_SLEEP_HOURS_ENTRY = 16;
export const MAX_CALORIES_ENTRY = 10000;
export const MAX_WEIGHT_ENTRY = 250;
export const MAX_FOOD_INTAKE_LENGTH = 220;

export const BP_SYS_MIN = 70;
export const BP_SYS_MAX = 250;
export const BP_DIA_MIN = 40;
export const BP_DIA_MAX = 150;
export const HR_MIN = 30;
export const HR_MAX = 220;
export const SUGAR_MIN = 20;
export const SUGAR_MAX = 600;

export const GOAL_OPTIONS: Array<{ value: HealthGoal; label: string }> = [
  { value: "fat_loss", label: "Fat Loss" },
  { value: "muscle_gain", label: "Muscle Gain" },
  { value: "general_fitness", label: "General Fitness" },
  { value: "medical_monitoring", label: "Medical Monitoring" }
];

export const CONDITION_OPTIONS: Array<{ value: HealthCondition; label: string }> = [
  { value: "high_sugar", label: "High sugar" },
  { value: "high_cholesterol", label: "High cholesterol" },
  { value: "low_vitamin_d", label: "Low vitamin D" },
  { value: "thyroid_issues", label: "Thyroid issues" }
];
