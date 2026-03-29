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
  DoctorNote,
  HealthMetricKey,
  HealthReport,
  HealthReportInput,
  MetricTargets,
  Supplement,
  SupplementLog,
  SupplementTiming,
  UserProfile,
  UserProfileInput,
  WatchData
} from "../types/health";
import {
  addHealthReport,
  getAiPersonalization,
  getAppSettings,
  getHealthReports,
  getOrCreateDailyRecord,
  getUserProfile,
  getWatchData,
  getWeeklyRecords,
  initDatabase,
  resetDailyRecord,
  saveAppSettings,
  saveAiPersonalization,
  saveWatchData,
  updateDailyRecord,
  upsertUserProfile,
  deleteHealthReport,
  getSupplements,
  addSupplement,
  deleteSupplement,
  clearAllSupplements,
  getTodaySupplementLogs,
  markSupplementTaken,
  unmarkSupplementTaken,
  getDoctorNotes,
  saveDoctorNote,
  clearDoctorNotes,
} from "../services/storageService";
import type { AppSettings } from "../services/storageService";
import { analyzeReportsForPersonalization, RateLimitError } from "../services/aiPersonalizationService";
import { extractSupplementsFromPrescriptions } from "../services/supplementAiService";
import { rescheduleAllSupplementReminders, cancelSupplementReminders } from "../services/supplementReminderService";
import { resolveActiveMetrics } from "../services/metricService";
import { getTodayDateKey } from "../utils/dateUtils";
import { Alert } from "react-native";

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
  aiRateLimitSeconds: number | null;
  watchData: WatchData | null;
  appSettings: AppSettings;
  // Supplements
  supplements: Supplement[];
  doctorNotes: DoctorNote[];
  todaySupplementLogs: SupplementLog[];
  isAnalyzingSupplements: boolean;
  supplementError: string | null;
  supplementRateLimitSeconds: number | null;
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
  syncWatchData: (data: WatchData) => Promise<void>;
  updateAppSettings: (settings: Partial<AppSettings>) => Promise<void>;
  // Supplement actions
  analyzeDocPrescriptions: () => Promise<void>;
  markSupplementDose: (supplementId: number, timing: SupplementTiming, taken: boolean) => Promise<void>;
  removeSupplementEntry: (id: number) => Promise<void>;
  clearSupplementError: () => void;
  refreshSupplements: () => Promise<void>;
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

const DEFAULT_SETTINGS: AppSettings = {
  watch_connected: false,
  weekly_report_enabled: false,
  last_weekly_report: null,
  meal_reminders_enabled: false
};

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
  aiRateLimitSeconds: null,
  watchData: null,
  appSettings: DEFAULT_SETTINGS,
  supplements: [],
  doctorNotes: [],
  todaySupplementLogs: [],
  isAnalyzingSupplements: false,
  supplementError: null,
  supplementRateLimitSeconds: null,

  initialize: async () => {
    set({ isLoading: true });
    await initDatabase();

    const todayDate = getTodayDateKey();
    const [profile, reports, aiPersonalization, watchData, appSettings, supplements, doctorNotes, todaySupplementLogs] = await Promise.all([
      getUserProfile(),
      getHealthReports(),
      getAiPersonalization(),
      getWatchData(),
      getAppSettings(),
      getSupplements(),
      getDoctorNotes(),
      getTodaySupplementLogs(todayDate),
    ]);

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
        watchData,
        appSettings,
        supplements,
        doctorNotes,
        todaySupplementLogs,
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
      watchData,
      appSettings,
      supplements,
      doctorNotes,
      todaySupplementLogs,
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
    // Blood test → re-run AI health plan
    void get().runAiPersonalization();
    // Doctor's prescription → auto-extract supplements + doctor notes
    if (payload.type === "prescription") {
      void get().analyzeDocPrescriptions();
    }
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

      // Auto-derive weekly and monthly targets from the AI plan
      const weeklyTargets = deriveWeeklyTargets(plan.metric_targets, profile);
      const monthlyTargets = deriveMonthlyTargets(plan.metric_targets, profile);
      plan.weekly_targets = weeklyTargets;
      plan.monthly_targets = monthlyTargets;

      const savedPlan = await saveAiPersonalization(plan);
      set({
        aiPersonalization: savedPlan,
        activeMetrics: resolveActiveMetrics(profile, savedPlan),
        aiError: null,
        isAnalyzingAi: false
      });
    } catch (error) {
      set({ isAnalyzingAi: false });
      if (error instanceof RateLimitError) {
        Alert.alert("⏱ Rate Limit Reached", error.message, [{ text: "OK" }]);
        set({ aiError: "rate_limit", aiRateLimitSeconds: error.retryAfterSeconds });
        return;
      }
      const message = error instanceof Error ? error.message : "Could not analyze reports right now. Please retry.";
      set({ aiError: message });
    }
  },

  clearAiError: () => {
    set({ aiError: null, aiRateLimitSeconds: null });
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

    const nextSugar = Math.round(clampNumber(mgdl, SUGAR_MIN, SUGAR_MAX));
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
  },

  syncWatchData: async (data: WatchData) => {
    await saveWatchData(data);
    set({ watchData: data });

    // Auto-update today's record with watch data
    const { todayRecord, profile } = get();
    if (!todayRecord || !profile) return;

    const updates: Partial<DailyHealthRecord> = {};
    if (data.steps !== undefined) updates.steps = data.steps;
    if (data.heart_rate !== undefined) updates.heart_rate = data.heart_rate;
    if (data.sleep_hours !== undefined) updates.sleep_hours = Number(data.sleep_hours.toFixed(1));

    if (Object.keys(updates).length > 0) {
      const updatedRecord = { ...todayRecord, ...updates };
      set({ todayRecord: updatedRecord });
      await updateDailyRecord(todayRecord.date, updates, profile.weight);
      await get().refreshWeeklyRecords();
    }
  },

  updateAppSettings: async (settings: Partial<AppSettings>) => {
    await saveAppSettings(settings);
    const updated = await getAppSettings();
    set({ appSettings: updated });
  },

  // ── Supplements ──────────────────────────────────────────────────────────────

  refreshSupplements: async () => {
    const todayDate = get().currentDate;
    const [supplements, doctorNotes, todaySupplementLogs] = await Promise.all([
      getSupplements(),
      getDoctorNotes(),
      getTodaySupplementLogs(todayDate),
    ]);
    set({ supplements, doctorNotes, todaySupplementLogs });
  },

  analyzeDocPrescriptions: async () => {
    const reports = get().reports;
    const prescriptions = reports.filter((r) => r.type === "prescription");
    if (!prescriptions.length) {
      set({ supplementError: "Upload a doctor's prescription first." });
      return;
    }

    set({ isAnalyzingSupplements: true, supplementError: null });
    try {
      const result = await extractSupplementsFromPrescriptions(reports);

      // Clear existing AI-extracted supplements & doctor notes, then replace
      await clearAllSupplements();
      await clearDoctorNotes();

      // Save new doctor note
      await saveDoctorNote(result.doctorNote);

      // Save all extracted supplements
      for (const input of result.supplements) {
        await addSupplement(input);
      }

      // Reload from DB and reschedule notifications
      const [supplements, doctorNotes, todaySupplementLogs] = await Promise.all([
        getSupplements(),
        getDoctorNotes(),
        getTodaySupplementLogs(get().currentDate),
      ]);

      set({ supplements, doctorNotes, todaySupplementLogs, isAnalyzingSupplements: false });
      void rescheduleAllSupplementReminders(supplements);
    } catch (error) {
      set({ isAnalyzingSupplements: false });
      if (error instanceof RateLimitError) {
        Alert.alert("⏱ Rate Limit Reached", error.message, [{ text: "OK" }]);
        set({ supplementError: "rate_limit", supplementRateLimitSeconds: error.retryAfterSeconds });
        return;
      }
      const message = error instanceof Error ? error.message : "Could not extract supplements.";
      set({ supplementError: message });
    }
  },

  markSupplementDose: async (supplementId: number, timing: SupplementTiming, taken: boolean) => {
    const date = get().currentDate;
    if (taken) {
      await markSupplementTaken(supplementId, date, timing);
    } else {
      await unmarkSupplementTaken(supplementId, date, timing);
    }
    const logs = await getTodaySupplementLogs(date);
    set({ todaySupplementLogs: logs });
  },

  removeSupplementEntry: async (id: number) => {
    await deleteSupplement(id);
    await cancelSupplementReminders(id);
    const supplements = await getSupplements();
    set({ supplements });
  },

  clearSupplementError: () => {
    set({ supplementError: null, supplementRateLimitSeconds: null });
  },
}));

// ─── Auto-derive weekly / monthly targets ─────────────────────────────────────

function deriveWeeklyTargets(
  base: MetricTargets,
  _profile: UserProfile
): MetricTargets {
  const weekly: MetricTargets = { ...base };
  // For week 1, set slightly progressive targets (5–10% increase toward goal)
  if (weekly.steps) weekly.steps = Math.round(weekly.steps * 1.05);
  if (weekly.water) weekly.water = Math.round(weekly.water * 1.0);
  if (weekly.sleep) weekly.sleep = weekly.sleep; // sleep target stays
  return weekly;
}

function deriveMonthlyTargets(
  base: MetricTargets,
  _profile: UserProfile
): MetricTargets {
  const monthly: MetricTargets = { ...base };
  // Monthly targets are the full AI-recommended targets (not incremental)
  if (monthly.steps) monthly.steps = Math.round(monthly.steps * 1.15);
  if (monthly.water) monthly.water = Math.round(monthly.water * 1.1);
  return monthly;
}
