import { create } from "zustand";
import {
  AGE_MAX,
  AGE_MIN,
  HEIGHT_MAX,
  HEIGHT_MIN,
  MAX_CALORIES_ENTRY,
  MAX_FOOD_INTAKE_LENGTH,
  MAX_SLEEP_HOURS_ENTRY,
  MAX_STEPS_ENTRY,
  MAX_WATER_ML_ENTRY,
  MAX_WEIGHT_ENTRY,
  SUGAR_MAX,
  SUGAR_MIN,
  WEIGHT_MAX,
  WEIGHT_MIN
} from "../types/health";
import type {
  AiPersonalization,
  DailyHealthRecord,
  HealthMetricKey,
  HealthReport,
  HealthReportInput,
  UserProfile,
  UserProfileInput
} from "../types/health";
import {
  addHealthReport,
  getAiPersonalization,
  getHealthReports,
  getOrCreateDailyRecord,
  getUserProfile,
  getWeeklyRecords,
  initDatabase,
  resetDailyRecord,
  saveAiPersonalization,
  updateDailyRecord,
  upsertUserProfile,
  deleteHealthReport
} from "../services/storageService";
import { analyzeReportsForPersonalization } from "../services/aiPersonalizationService";
import { resolveActiveMetrics } from "../services/metricService";
import { getTodayDateKey } from "../utils/dateUtils";

type HealthStore = {
  profile: UserProfile | null;
  reports: HealthReport[];
  aiPersonalization: AiPersonalization | null;
  activeMetrics: HealthMetricKey[];
  todayRecord: DailyHealthRecord | null;
  weeklyRecords: DailyHealthRecord[];
  currentDate: string;
  isLoading: boolean;
  isAnalyzingAi: boolean;
  aiError: string | null;
  initialize: () => Promise<void>;
  ensureTodayRecord: () => Promise<void>;
  saveProfile: (profile: UserProfileInput) => Promise<void>;
  refreshReports: () => Promise<void>;
  addReport: (payload: Omit<HealthReport, "id">) => Promise<void>;
  removeReport: (id: number) => Promise<void>;
  runAiPersonalization: () => Promise<void>;
  clearAiError: () => void;
  addWater: (amount: number) => Promise<void>;
  setSteps: (steps: number) => Promise<void>;
  setSleep: (hours: number) => Promise<void>;
  setCalories: (calories: number) => Promise<void>;
  setWeight: (weight: number) => Promise<void>;
  setFoodIntake: (foodIntake: string) => Promise<void>;
  setBloodPressure: (sys: number, dia: number) => Promise<void>;
  setHeartRate: (bpm: number) => Promise<void>;
  setBloodSugar: (mgdl: number) => Promise<void>;
  resetToday: () => Promise<void>;
  refreshWeeklyRecords: () => Promise<void>;
};

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(value, max));
}

function clampText(value: string, maxLength: number): string {
  return (value || "").trim().slice(0, maxLength);
}

function normalizeProfileInput(input: UserProfileInput): UserProfileInput {
  return {
    age: Math.round(clampNumber(input.age, AGE_MIN, AGE_MAX)),
    weight: Number(clampNumber(input.weight, WEIGHT_MIN, WEIGHT_MAX).toFixed(1)),
    height: Number(clampNumber(input.height, HEIGHT_MIN, HEIGHT_MAX).toFixed(1)),
    goal: input.goal,
    conditions: input.conditions
  };
}

export const useHealthStore = create<HealthStore>((set, get) => ({
  profile: null,
  reports: [],
  aiPersonalization: null,
  activeMetrics: [],
  todayRecord: null,
  weeklyRecords: [],
  currentDate: getTodayDateKey(),
  isLoading: true,
  isAnalyzingAi: false,
  aiError: null,

  initialize: async () => {
    set({ isLoading: true });
    await initDatabase();

    const [profile, reports, aiPersonalization] = await Promise.all([
      getUserProfile(),
      getHealthReports(),
      getAiPersonalization()
    ]);
    const todayDate = getTodayDateKey();

    if (!profile) {
      set({
        profile: null,
        reports,
        aiPersonalization: null,
        activeMetrics: [],
        todayRecord: null,
        weeklyRecords: [],
        currentDate: todayDate,
        aiError: null,
        isLoading: false
      });
      return;
    }

    const [todayRecord, weeklyRecords] = await Promise.all([
      getOrCreateDailyRecord(todayDate, profile.weight),
      getWeeklyRecords(todayDate)
    ]);

    set({
      profile,
      reports,
      aiPersonalization,
      activeMetrics: resolveActiveMetrics(profile, aiPersonalization),
      todayRecord,
      weeklyRecords,
      currentDate: todayDate,
      aiError: null,
      isLoading: false
    });
  },

  ensureTodayRecord: async () => {
    const profile = get().profile;
    if (!profile) {
      return;
    }

    const liveDate = getTodayDateKey();
    if (liveDate === get().currentDate) {
      return;
    }

    const [todayRecord, weeklyRecords] = await Promise.all([
      getOrCreateDailyRecord(liveDate, profile.weight),
      getWeeklyRecords(liveDate)
    ]);

    set({
      todayRecord,
      weeklyRecords,
      currentDate: liveDate
    });
  },

  saveProfile: async (profileInput: UserProfileInput) => {
    const normalizedInput = normalizeProfileInput(profileInput);
    const profile = await upsertUserProfile(normalizedInput);
    const todayDate = getTodayDateKey();
    const [todayRecord, weeklyRecords] = await Promise.all([
      getOrCreateDailyRecord(todayDate, profile.weight),
      getWeeklyRecords(todayDate)
    ]);
    const aiPersonalization = get().aiPersonalization;

    set({
      profile,
      activeMetrics: resolveActiveMetrics(profile, aiPersonalization),
      todayRecord,
      weeklyRecords,
      currentDate: todayDate
    });
  },

  refreshReports: async () => {
    const reports = await getHealthReports();
    set({ reports });
  },

  addReport: async (payload: Omit<HealthReport, "id">) => {
    await addHealthReport(payload);
    const updated = await getHealthReports();
    set({ reports: updated });
    void get().runAiPersonalization();
  },

  removeReport: async (id: number) => {
    await deleteHealthReport(id);
    const updated = await getHealthReports();
    set({ reports: updated });
    void get().runAiPersonalization();
  },

  runAiPersonalization: async () => {
    const profile = get().profile;
    const reports = get().reports;
    if (!profile) {
      return;
    }

    if (!reports.length) {
      set({
        aiError: "Add at least one blood test or prescription report to personalize tracking."
      });
      return;
    }

    set({ isAnalyzingAi: true, aiError: null });
    try {
      const plan = await analyzeReportsForPersonalization(profile, reports);
      const savedPlan = await saveAiPersonalization(plan);
      set({
        aiPersonalization: savedPlan,
        activeMetrics: resolveActiveMetrics(profile, savedPlan),
        aiError: null,
        isAnalyzingAi: false
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not analyze reports right now. Please retry.";
      set({
        isAnalyzingAi: false,
        aiError: message
      });
    }
  },

  clearAiError: () => {
    set({ aiError: null });
  },

  refreshWeeklyRecords: async () => {
    const currentDate = get().currentDate;
    const weeklyRecords = await getWeeklyRecords(currentDate);
    set({ weeklyRecords });
  },

  addWater: async (amount: number) => {
    const { todayRecord, profile } = get();
    if (!todayRecord || !profile) {
      return;
    }

    const nextWater = clampNumber(todayRecord.water_ml + amount, 0, MAX_WATER_ML_ENTRY);
    const optimistic = { ...todayRecord, water_ml: Math.round(nextWater) };
    set({ todayRecord: optimistic });

    await updateDailyRecord(todayRecord.date, { water_ml: optimistic.water_ml }, profile.weight);
    await get().refreshWeeklyRecords();
  },

  setSteps: async (steps: number) => {
    const { todayRecord, profile } = get();
    if (!todayRecord || !profile) {
      return;
    }

    const nextSteps = Math.round(clampNumber(steps, 0, MAX_STEPS_ENTRY));
    const optimistic = { ...todayRecord, steps: nextSteps };
    set({ todayRecord: optimistic });

    await updateDailyRecord(todayRecord.date, { steps: nextSteps }, profile.weight);
    await get().refreshWeeklyRecords();
  },

  setSleep: async (hours: number) => {
    const { todayRecord, profile } = get();
    if (!todayRecord || !profile) {
      return;
    }

    const nextSleep = Number(clampNumber(hours, 0, MAX_SLEEP_HOURS_ENTRY).toFixed(1));
    const optimistic = { ...todayRecord, sleep_hours: nextSleep };
    set({ todayRecord: optimistic });

    await updateDailyRecord(todayRecord.date, { sleep_hours: nextSleep }, profile.weight);
    await get().refreshWeeklyRecords();
  },

  setCalories: async (calories: number) => {
    const { todayRecord, profile } = get();
    if (!todayRecord || !profile) {
      return;
    }

    const nextCalories = Math.round(clampNumber(calories, 0, MAX_CALORIES_ENTRY));
    const optimistic = { ...todayRecord, calories: nextCalories };
    set({ todayRecord: optimistic });

    await updateDailyRecord(todayRecord.date, { calories: nextCalories }, profile.weight);
    await get().refreshWeeklyRecords();
  },

  setWeight: async (weight: number) => {
    const { todayRecord, profile } = get();
    if (!todayRecord || !profile) {
      return;
    }

    const nextWeight = Number(clampNumber(weight, WEIGHT_MIN, MAX_WEIGHT_ENTRY).toFixed(1));
    const optimistic = { ...todayRecord, weight_kg: nextWeight };
    set({ todayRecord: optimistic });

    await updateDailyRecord(todayRecord.date, { weight_kg: nextWeight }, profile.weight);
    await get().refreshWeeklyRecords();
  },

  setFoodIntake: async (foodIntake: string) => {
    const { todayRecord, profile } = get();
    if (!todayRecord || !profile) {
      return;
    }

    const nextFoodIntake = clampText(foodIntake, MAX_FOOD_INTAKE_LENGTH);
    const optimistic = { ...todayRecord, food_intake: nextFoodIntake };
    set({ todayRecord: optimistic });

    await updateDailyRecord(todayRecord.date, { food_intake: nextFoodIntake }, profile.weight);
    await get().refreshWeeklyRecords();
  },

  setBloodPressure: async (sys: number, dia: number) => {
    const { todayRecord, profile } = get();
    if (!todayRecord || !profile) return;

    const nextSys = Math.round(clampNumber(sys, 0, 300));
    const nextDia = Math.round(clampNumber(dia, 0, 200));
    const optimistic = { ...todayRecord, blood_pressure_sys: nextSys, blood_pressure_dia: nextDia };
    set({ todayRecord: optimistic });

    await updateDailyRecord(todayRecord.date, { blood_pressure_sys: nextSys, blood_pressure_dia: nextDia }, profile.weight);
    await get().refreshWeeklyRecords();
  },

  setHeartRate: async (bpm: number) => {
    const { todayRecord, profile } = get();
    if (!todayRecord || !profile) return;

    const nextHr = Math.round(clampNumber(bpm, 0, 300));
    const optimistic = { ...todayRecord, heart_rate: nextHr };
    set({ todayRecord: optimistic });

    await updateDailyRecord(todayRecord.date, { heart_rate: nextHr }, profile.weight);
    await get().refreshWeeklyRecords();
  },

  setBloodSugar: async (mgdl: number) => {
    const { todayRecord, profile } = get();
    if (!todayRecord || !profile) return;

    const nextSugar = Math.round(clampNumber(mgdl, 0, SUGAR_MAX));
    const optimistic = { ...todayRecord, blood_sugar: nextSugar };
    set({ todayRecord: optimistic });

    await updateDailyRecord(todayRecord.date, { blood_sugar: nextSugar }, profile.weight);
    await get().refreshWeeklyRecords();
  },

  resetToday: async () => {
    const today = get().todayRecord;
    if (!today) {
      return;
    }

    const resetRecord = await resetDailyRecord(today.date);
    set({ todayRecord: resetRecord });
    await get().refreshWeeklyRecords();
  }
}));
