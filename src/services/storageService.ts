import * as SQLite from "expo-sqlite";
import type {
  AiPersonalization,
  DailyHealthRecord,
  DailyHealthUpdates,
  DoctorNote,
  DoctorNoteInput,
  HealthReport,
  HealthReportInput,
  Supplement,
  SupplementInput,
  SupplementLog,
  SupplementTiming,
  UserProfile,
  UserProfileInput
} from "../types/health";
import { getLastNDates } from "../utils/dateUtils";

const DB_NAME = "healthos_mobile.db";
const DAILY_TABLE = "daily_health";
const PROFILE_TABLE = "user_profile";
const REPORTS_TABLE = "health_reports";
const AI_TABLE = "ai_personalization";
const SETTINGS_TABLE = "app_settings";
const WATCH_TABLE = "watch_data";
const SUPPLEMENTS_TABLE = "supplements";
const SUPPLEMENT_LOGS_TABLE = "supplement_logs";
const DOCTOR_NOTES_TABLE = "doctor_notes";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function emptyRecord(date: string, defaultWeight: number = 0): DailyHealthRecord {
  return {
    date,
    water_ml: 0,
    steps: 0,
    sleep_hours: 0,
    calories: 0,
    weight_kg: defaultWeight > 0 ? Number(defaultWeight.toFixed(1)) : 0,
    food_intake: "",
    blood_pressure_sys: 0,
    blood_pressure_dia: 0,
    heart_rate: 0,
    blood_sugar: 0
  };
}

function normalizeRecord(row: Partial<DailyHealthRecord> & { date: string }): DailyHealthRecord {
  return {
    date: row.date,
    water_ml: Number(row.water_ml ?? 0),
    steps: Number(row.steps ?? 0),
    sleep_hours: Number(row.sleep_hours ?? 0),
    calories: Number(row.calories ?? 0),
    weight_kg: Number(row.weight_kg ?? 0),
    food_intake: String(row.food_intake ?? ""),
    blood_pressure_sys: Number(row.blood_pressure_sys ?? 0),
    blood_pressure_dia: Number(row.blood_pressure_dia ?? 0),
    heart_rate: Number(row.heart_rate ?? 0),
    blood_sugar: Number(row.blood_sugar ?? 0)
  };
}

function normalizeProfile(
  row: {
    age: number;
    weight: number;
    height: number;
    goal: UserProfile["goal"];
    conditions: string;
    created_at: string;
    updated_at: string;
  } | null
): UserProfile | null {
  if (!row) return null;
  return {
    age: Number(row.age),
    weight: Number(row.weight),
    height: Number(row.height),
    goal: row.goal,
    conditions: parseConditions(row.conditions),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function parseConditions(raw: string | null | undefined): UserProfile["conditions"] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((item) => typeof item === "string") as UserProfile["conditions"];
    }
  } catch { /* fallback */ }
  return [];
}

function parseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((item) => typeof item === "string") as string[];
    }
  } catch { /* fallback */ }
  return [];
}

function parseNumberArray(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map(Number).filter(Number.isFinite);
    }
  } catch { /* fallback */ }
  return [];
}

function parseObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch { /* fallback */ }
  return {};
}

function parseJsonField<T>(raw: string | null | undefined): T | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch { /* fallback */ }
  return undefined;
}

const VALID_METRICS = new Set([
  "sleep", "steps", "water", "calories", "weight",
  "blood_pressure_sys", "blood_pressure_dia", "heart_rate", "blood_sugar"
]);

function normalizeAiPersonalization(
  row: {
    active_metrics: string;
    metric_targets: string;
    weekly_targets?: string | null;
    monthly_targets?: string | null;
    doctor_focus: string;
    summary: string;
    source_report_ids: string;
    generated_at: string;
    meal_plan?: string | null;
    workout_plan?: string | null;
    health_tips?: string | null;
  } | null
): AiPersonalization | null {
  if (!row) return null;

  const metrics = parseStringArray(row.active_metrics);
  const doctorFocus = parseStringArray(row.doctor_focus);
  const sourceReportIds = parseNumberArray(row.source_report_ids);
  const rawTargets = parseObject(row.metric_targets);
  const metricTargets: AiPersonalization["metric_targets"] = {};

  for (const [key, value] of Object.entries(rawTargets)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
    metricTargets[key as keyof AiPersonalization["metric_targets"]] = Math.round(value * 10) / 10;
  }

  const result: AiPersonalization = {
    active_metrics: metrics.filter((m) => VALID_METRICS.has(m)) as AiPersonalization["active_metrics"],
    metric_targets: metricTargets,
    doctor_focus: doctorFocus,
    summary: row.summary || "",
    source_report_ids: sourceReportIds,
    generated_at: row.generated_at || new Date().toISOString()
  };

  // Restore extended plan fields from JSON columns
  const weekly_targets = parseJsonField<AiPersonalization["weekly_targets"]>(row.weekly_targets);
  if (weekly_targets) result.weekly_targets = weekly_targets;

  const monthly_targets = parseJsonField<AiPersonalization["monthly_targets"]>(row.monthly_targets);
  if (monthly_targets) result.monthly_targets = monthly_targets;

  const meal_plan = parseJsonField<AiPersonalization["meal_plan"]>(row.meal_plan);
  if (meal_plan) result.meal_plan = meal_plan;

  const workout_plan = parseJsonField<AiPersonalization["workout_plan"]>(row.workout_plan);
  if (workout_plan) result.workout_plan = workout_plan;

  const health_tips = parseJsonField<string[]>(row.health_tips);
  if (health_tips) result.health_tips = health_tips;

  return result;
}

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
      await db.execAsync("PRAGMA journal_mode = WAL;");
      await createTables(db);
      await ensureSchema(db);
      return db;
    });
  }
  return dbPromise;
}

async function createTables(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS ${DAILY_TABLE} (
      date TEXT PRIMARY KEY NOT NULL,
      water_ml INTEGER NOT NULL DEFAULT 0,
      steps INTEGER NOT NULL DEFAULT 0,
      sleep_hours REAL NOT NULL DEFAULT 0,
      calories INTEGER NOT NULL DEFAULT 0,
      weight_kg REAL NOT NULL DEFAULT 0,
      food_intake TEXT NOT NULL DEFAULT '',
      blood_pressure_sys INTEGER NOT NULL DEFAULT 0,
      blood_pressure_dia INTEGER NOT NULL DEFAULT 0,
      heart_rate INTEGER NOT NULL DEFAULT 0,
      blood_sugar INTEGER NOT NULL DEFAULT 0
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS ${PROFILE_TABLE} (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      age INTEGER NOT NULL,
      weight REAL NOT NULL,
      height REAL NOT NULL,
      goal TEXT NOT NULL,
      conditions TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS ${REPORTS_TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_url TEXT NOT NULL,
      type TEXT NOT NULL,
      date TEXT NOT NULL,
      file_name TEXT NOT NULL
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS ${AI_TABLE} (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      active_metrics TEXT NOT NULL DEFAULT '[]',
      metric_targets TEXT NOT NULL DEFAULT '{}',
      weekly_targets TEXT,
      monthly_targets TEXT,
      doctor_focus TEXT NOT NULL DEFAULT '[]',
      summary TEXT NOT NULL DEFAULT '',
      source_report_ids TEXT NOT NULL DEFAULT '[]',
      generated_at TEXT NOT NULL DEFAULT '',
      meal_plan TEXT,
      workout_plan TEXT,
      health_tips TEXT
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS ${SETTINGS_TABLE} (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      theme_mode TEXT NOT NULL DEFAULT 'dark',
      watch_connected INTEGER NOT NULL DEFAULT 0,
      weekly_report_enabled INTEGER NOT NULL DEFAULT 0,
      last_weekly_report TEXT,
      meal_reminders_enabled INTEGER NOT NULL DEFAULT 0
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS ${WATCH_TABLE} (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      steps INTEGER,
      heart_rate INTEGER,
      resting_hr INTEGER,
      spo2 REAL,
      sleep_hours REAL,
      calories_burned INTEGER,
      stress_level INTEGER,
      body_fat_pct REAL,
      skin_temp_c REAL,
      last_synced TEXT,
      is_connected INTEGER NOT NULL DEFAULT 0
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS ${SUPPLEMENTS_TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      dosage TEXT NOT NULL DEFAULT '',
      timing TEXT NOT NULL DEFAULT '["morning"]',
      frequency TEXT NOT NULL DEFAULT 'daily',
      notes TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS ${SUPPLEMENT_LOGS_TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplement_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      timing TEXT NOT NULL,
      taken_at TEXT,
      UNIQUE(supplement_id, date, timing)
    );
  `);

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS ${DOCTOR_NOTES_TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      diagnosis TEXT NOT NULL DEFAULT '',
      recommendations TEXT NOT NULL DEFAULT '',
      source_report_id INTEGER,
      created_at TEXT NOT NULL
    );
  `);
}

async function ensureSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  // Daily table columns
  const dailyInfo = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${DAILY_TABLE});`);
  const dailyCols = new Set(dailyInfo.map((r) => r.name));

  if (!dailyCols.has("calories"))
    await db.execAsync(`ALTER TABLE ${DAILY_TABLE} ADD COLUMN calories INTEGER NOT NULL DEFAULT 0;`);
  if (!dailyCols.has("food_intake"))
    await db.execAsync(`ALTER TABLE ${DAILY_TABLE} ADD COLUMN food_intake TEXT NOT NULL DEFAULT '';`);
  if (!dailyCols.has("weight_kg"))
    await db.execAsync(`ALTER TABLE ${DAILY_TABLE} ADD COLUMN weight_kg REAL NOT NULL DEFAULT 0;`);
  if (!dailyCols.has("blood_pressure_sys")) {
    await db.execAsync(`ALTER TABLE ${DAILY_TABLE} ADD COLUMN blood_pressure_sys INTEGER NOT NULL DEFAULT 0;`);
    await db.execAsync(`ALTER TABLE ${DAILY_TABLE} ADD COLUMN blood_pressure_dia INTEGER NOT NULL DEFAULT 0;`);
    await db.execAsync(`ALTER TABLE ${DAILY_TABLE} ADD COLUMN heart_rate INTEGER NOT NULL DEFAULT 0;`);
    await db.execAsync(`ALTER TABLE ${DAILY_TABLE} ADD COLUMN blood_sugar INTEGER NOT NULL DEFAULT 0;`);
  }

  // Profile table columns
  const profileInfo = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${PROFILE_TABLE});`);
  const profileCols = new Set(profileInfo.map((r) => r.name));

  if (profileCols.size === 0) { await createTables(db); return; }
  if (!profileCols.has("conditions"))
    await db.execAsync(`ALTER TABLE ${PROFILE_TABLE} ADD COLUMN conditions TEXT NOT NULL DEFAULT '[]';`);
  if (!profileCols.has("created_at"))
    await db.execAsync(`ALTER TABLE ${PROFILE_TABLE} ADD COLUMN created_at TEXT NOT NULL DEFAULT '';`);
  if (!profileCols.has("updated_at"))
    await db.execAsync(`ALTER TABLE ${PROFILE_TABLE} ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';`);

  // Reports table
  const reportsInfo = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${REPORTS_TABLE});`);
  if (!reportsInfo.length) { await createTables(db); return; }

  // AI table — add new extended plan columns if missing (handles existing installs)
  const aiInfo = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${AI_TABLE});`);
  if (!aiInfo.length) { await createTables(db); return; }

  const aiCols = new Set(aiInfo.map((r) => r.name));
  if (!aiCols.has("meal_plan"))
    await db.execAsync(`ALTER TABLE ${AI_TABLE} ADD COLUMN meal_plan TEXT;`);
  if (!aiCols.has("workout_plan"))
    await db.execAsync(`ALTER TABLE ${AI_TABLE} ADD COLUMN workout_plan TEXT;`);
  if (!aiCols.has("health_tips"))
    await db.execAsync(`ALTER TABLE ${AI_TABLE} ADD COLUMN health_tips TEXT;`);
  if (!aiCols.has("weekly_targets"))
    await db.execAsync(`ALTER TABLE ${AI_TABLE} ADD COLUMN weekly_targets TEXT;`);
  if (!aiCols.has("monthly_targets"))
    await db.execAsync(`ALTER TABLE ${AI_TABLE} ADD COLUMN monthly_targets TEXT;`);
}

export async function initDatabase(): Promise<void> {
  await getDb();
}

export async function getUserProfile(): Promise<UserProfile | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    age: number; weight: number; height: number;
    goal: UserProfile["goal"]; conditions: string;
    created_at: string; updated_at: string;
  }>(`SELECT age, weight, height, goal, conditions, created_at, updated_at FROM ${PROFILE_TABLE} WHERE id = 1`);
  return normalizeProfile(row ?? null);
}

export async function upsertUserProfile(input: UserProfileInput): Promise<UserProfile> {
  const db = await getDb();
  const timestamp = new Date().toISOString();
  const existing = await getUserProfile();
  const createdAt = existing?.created_at || timestamp;

  await db.runAsync(
    `INSERT OR REPLACE INTO ${PROFILE_TABLE} (id, age, weight, height, goal, conditions, created_at, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
    [Math.round(input.age), Number(input.weight.toFixed(1)), Number(input.height.toFixed(1)),
     input.goal, JSON.stringify(input.conditions), createdAt, timestamp]
  );

  const profile = await getUserProfile();
  if (!profile) throw new Error("Failed to save user profile.");
  return profile;
}

export async function getHealthReports(): Promise<HealthReport[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<HealthReport>(
    `SELECT id, file_url, type, date, file_name FROM ${REPORTS_TABLE} ORDER BY date DESC, id DESC`
  );
  return rows.map((row) => ({
    id: Number(row.id), file_url: row.file_url,
    type: row.type, date: row.date, file_name: row.file_name
  }));
}

export async function deleteHealthReport(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM ${REPORTS_TABLE} WHERE id = ?`, [id]);
}

export async function addHealthReport(report: HealthReportInput): Promise<HealthReport> {
  const db = await getDb();
  const result = await db.runAsync(
    `INSERT INTO ${REPORTS_TABLE} (file_url, type, date, file_name) VALUES (?, ?, ?, ?)`,
    [report.file_url, report.type, report.date, report.file_name]
  );
  const inserted = await db.getFirstAsync<HealthReport>(
    `SELECT id, file_url, type, date, file_name FROM ${REPORTS_TABLE} WHERE id = ?`,
    [result.lastInsertRowId]
  );
  if (!inserted) throw new Error("Failed to save report.");
  return { id: Number(inserted.id), file_url: inserted.file_url,
           type: inserted.type, date: inserted.date, file_name: inserted.file_name };
}

export async function getAiPersonalization(): Promise<AiPersonalization | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    active_metrics: string; metric_targets: string; doctor_focus: string;
    summary: string; source_report_ids: string; generated_at: string;
    meal_plan: string | null; workout_plan: string | null; health_tips: string | null;
  }>(
    `SELECT active_metrics, metric_targets, weekly_targets, monthly_targets,
            doctor_focus, summary, source_report_ids, generated_at,
            meal_plan, workout_plan, health_tips
     FROM ${AI_TABLE} WHERE id = 1`
  );
  return normalizeAiPersonalization(row ?? null);
}

export async function saveAiPersonalization(plan: AiPersonalization): Promise<AiPersonalization> {
  const db = await getDb();
  const generatedAt = plan.generated_at || new Date().toISOString();

  await db.runAsync(
    `INSERT OR REPLACE INTO ${AI_TABLE}
      (id, active_metrics, metric_targets, weekly_targets, monthly_targets,
       doctor_focus, summary, source_report_ids, generated_at,
       meal_plan, workout_plan, health_tips)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      JSON.stringify(plan.active_metrics),
      JSON.stringify(plan.metric_targets),
      plan.weekly_targets ? JSON.stringify(plan.weekly_targets) : null,
      plan.monthly_targets ? JSON.stringify(plan.monthly_targets) : null,
      JSON.stringify(plan.doctor_focus),
      plan.summary,
      JSON.stringify(plan.source_report_ids),
      generatedAt,
      plan.meal_plan ? JSON.stringify(plan.meal_plan) : null,
      plan.workout_plan ? JSON.stringify(plan.workout_plan) : null,
      plan.health_tips ? JSON.stringify(plan.health_tips) : null
    ]
  );

  const saved = await getAiPersonalization();
  if (!saved) throw new Error("Failed to save AI personalization.");
  return saved;
}

export async function getOrCreateDailyRecord(date: string, defaultWeight: number = 0): Promise<DailyHealthRecord> {
  const db = await getDb();
  const existing = await db.getFirstAsync<DailyHealthRecord>(
    `SELECT date, water_ml, steps, sleep_hours, calories, weight_kg, food_intake,
            blood_pressure_sys, blood_pressure_dia, heart_rate, blood_sugar
     FROM ${DAILY_TABLE} WHERE date = ?`,
    [date]
  );

  if (existing) return normalizeRecord(existing);

  const created = emptyRecord(date, defaultWeight);
  await db.runAsync(
    `INSERT INTO ${DAILY_TABLE}
      (date, water_ml, steps, sleep_hours, calories, weight_kg, food_intake,
       blood_pressure_sys, blood_pressure_dia, heart_rate, blood_sugar)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [created.date, created.water_ml, created.steps, created.sleep_hours, created.calories,
     created.weight_kg, created.food_intake, created.blood_pressure_sys,
     created.blood_pressure_dia, created.heart_rate, created.blood_sugar]
  );
  return created;
}

export async function updateDailyRecord(
  date: string, updates: DailyHealthUpdates, defaultWeight: number = 0
): Promise<DailyHealthRecord> {
  await getOrCreateDailyRecord(date, defaultWeight);
  const entries = Object.entries(updates).filter(([, v]) => v !== undefined);
  if (!entries.length) return getOrCreateDailyRecord(date, defaultWeight);

  const setClause = entries.map(([k]) => `${k} = ?`).join(", ");
  const values = entries.map(([, v]) => v as string | number);
  const db = await getDb();

  await db.runAsync(`UPDATE ${DAILY_TABLE} SET ${setClause} WHERE date = ?`, [...values, date]);
  return getOrCreateDailyRecord(date, defaultWeight);
}

export async function resetDailyRecord(date: string): Promise<DailyHealthRecord> {
  const db = await getDb();
  await getOrCreateDailyRecord(date);
  await db.runAsync(
    `UPDATE ${DAILY_TABLE} SET water_ml=0, steps=0, sleep_hours=0, calories=0, weight_kg=0,
     food_intake='', blood_pressure_sys=0, blood_pressure_dia=0, heart_rate=0, blood_sugar=0
     WHERE date = ?`,
    [date]
  );
  return getOrCreateDailyRecord(date);
}

export async function getWeeklyRecords(referenceDate: string): Promise<DailyHealthRecord[]> {
  const dateObj = toDate(referenceDate);
  const keys = getLastNDates(7, dateObj);
  const firstDate = keys[0];
  const lastDate = keys[keys.length - 1];

  const db = await getDb();
  const rows = await db.getAllAsync<DailyHealthRecord>(
    `SELECT date, water_ml, steps, sleep_hours, calories, weight_kg, food_intake,
            blood_pressure_sys, blood_pressure_dia, heart_rate, blood_sugar
     FROM ${DAILY_TABLE} WHERE date BETWEEN ? AND ? ORDER BY date ASC`,
    [firstDate, lastDate]
  );

  const rowMap = new Map(rows.map((row) => [row.date, normalizeRecord(row)]));
  return keys.map((key) => rowMap.get(key) ?? emptyRecord(key));
}

function toDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

// ─── Watch Data ───────────────────────────────────────────────────────────────

import type { WatchData } from "../types/health";

export async function getWatchData(): Promise<WatchData | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    steps: number | null; heart_rate: number | null; resting_hr: number | null;
    spo2: number | null; sleep_hours: number | null; calories_burned: number | null;
    stress_level: number | null; body_fat_pct: number | null; skin_temp_c: number | null;
    last_synced: string | null; is_connected: number;
  }>(`SELECT * FROM ${WATCH_TABLE} WHERE id = 1`);
  if (!row) return null;
  return {
    steps: row.steps ?? undefined,
    heart_rate: row.heart_rate ?? undefined,
    resting_hr: row.resting_hr ?? undefined,
    spo2: row.spo2 ?? undefined,
    sleep_hours: row.sleep_hours ?? undefined,
    calories_burned: row.calories_burned ?? undefined,
    stress_level: row.stress_level ?? undefined,
    body_fat_pct: row.body_fat_pct ?? undefined,
    skin_temp_c: row.skin_temp_c ?? undefined,
    last_synced: row.last_synced ?? undefined,
    is_connected: row.is_connected === 1
  };
}

export async function saveWatchData(data: WatchData): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO ${WATCH_TABLE}
      (id, steps, heart_rate, resting_hr, spo2, sleep_hours, calories_burned,
       stress_level, body_fat_pct, skin_temp_c, last_synced, is_connected)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.steps ?? null, data.heart_rate ?? null, data.resting_hr ?? null,
      data.spo2 ?? null, data.sleep_hours ?? null, data.calories_burned ?? null,
      data.stress_level ?? null, data.body_fat_pct ?? null, data.skin_temp_c ?? null,
      data.last_synced ?? null, data.is_connected ? 1 : 0
    ]
  );
}

// ─── App Settings ─────────────────────────────────────────────────────────────

export type AppSettings = {
  watch_connected: boolean;
  weekly_report_enabled: boolean;
  last_weekly_report: string | null;
  meal_reminders_enabled: boolean;
};

export async function getAppSettings(): Promise<AppSettings> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    watch_connected: number;
    weekly_report_enabled: number;
    last_weekly_report: string | null;
    meal_reminders_enabled: number;
  }>(`SELECT * FROM ${SETTINGS_TABLE} WHERE id = 1`);
  if (!row) {
    return { watch_connected: false, weekly_report_enabled: false,
             last_weekly_report: null, meal_reminders_enabled: false };
  }
  return {
    watch_connected: row.watch_connected === 1,
    weekly_report_enabled: row.weekly_report_enabled === 1,
    last_weekly_report: row.last_weekly_report,
    meal_reminders_enabled: row.meal_reminders_enabled === 1
  };
}

export async function saveAppSettings(settings: Partial<AppSettings>): Promise<void> {
  const db = await getDb();
  const current = await getAppSettings();
  const merged = { ...current, ...settings };
  await db.runAsync(
    `INSERT OR REPLACE INTO ${SETTINGS_TABLE}
      (id, watch_connected, weekly_report_enabled, last_weekly_report, meal_reminders_enabled)
     VALUES (1, ?, ?, ?, ?)`,
    [
      merged.watch_connected ? 1 : 0,
      merged.weekly_report_enabled ? 1 : 0,
      merged.last_weekly_report ?? null,
      merged.meal_reminders_enabled ? 1 : 0
    ]
  );
}

// ─── Extended AI Personalization (weekly/monthly targets) ─────────────────────

export async function saveWeeklyMonthlyTargets(
  weekly: import("../types/health").MetricTargets,
  monthly: import("../types/health").MetricTargets
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE ${AI_TABLE} SET weekly_targets = ?, monthly_targets = ? WHERE id = 1`,
    [JSON.stringify(weekly), JSON.stringify(monthly)]
  );
}

// ─── Supplements ──────────────────────────────────────────────────────────────

function normalizeSupplementRow(row: {
  id: number; name: string; dosage: string; timing: string;
  frequency: string; notes: string | null; is_active: number; created_at: string;
}): Supplement {
  let timing: SupplementTiming[] = ["morning"];
  try {
    const parsed = JSON.parse(row.timing);
    if (Array.isArray(parsed)) timing = parsed as SupplementTiming[];
  } catch { /* use default */ }
  return {
    id: Number(row.id),
    name: row.name,
    dosage: row.dosage,
    timing,
    frequency: row.frequency as Supplement["frequency"],
    notes: row.notes ?? undefined,
    is_active: row.is_active === 1,
    created_at: row.created_at,
  };
}

export async function getSupplements(): Promise<Supplement[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: number; name: string; dosage: string; timing: string;
    frequency: string; notes: string | null; is_active: number; created_at: string;
  }>(`SELECT * FROM ${SUPPLEMENTS_TABLE} ORDER BY created_at ASC`);
  return rows.map(normalizeSupplementRow);
}

export async function addSupplement(input: SupplementInput): Promise<Supplement> {
  const db = await getDb();
  const now = new Date().toISOString();
  const result = await db.runAsync(
    `INSERT INTO ${SUPPLEMENTS_TABLE} (name, dosage, timing, frequency, notes, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [input.name, input.dosage, JSON.stringify(input.timing), input.frequency,
     input.notes ?? null, input.is_active ? 1 : 0, now]
  );
  const row = await db.getFirstAsync<{
    id: number; name: string; dosage: string; timing: string;
    frequency: string; notes: string | null; is_active: number; created_at: string;
  }>(`SELECT * FROM ${SUPPLEMENTS_TABLE} WHERE id = ?`, [result.lastInsertRowId]);
  if (!row) throw new Error("Failed to save supplement.");
  return normalizeSupplementRow(row);
}

export async function deleteSupplement(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM ${SUPPLEMENTS_TABLE} WHERE id = ?`, [id]);
  await db.runAsync(`DELETE FROM ${SUPPLEMENT_LOGS_TABLE} WHERE supplement_id = ?`, [id]);
}

export async function clearAllSupplements(): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM ${SUPPLEMENTS_TABLE}`);
  await db.runAsync(`DELETE FROM ${SUPPLEMENT_LOGS_TABLE}`);
}

// ─── Supplement Logs ──────────────────────────────────────────────────────────

export async function getTodaySupplementLogs(date: string): Promise<SupplementLog[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: number; supplement_id: number; date: string; timing: string; taken_at: string | null;
  }>(`SELECT * FROM ${SUPPLEMENT_LOGS_TABLE} WHERE date = ?`, [date]);
  return rows.map((r) => ({
    id: Number(r.id),
    supplement_id: Number(r.supplement_id),
    date: r.date,
    timing: r.timing as SupplementTiming,
    taken_at: r.taken_at,
  }));
}

export async function markSupplementTaken(
  supplement_id: number, date: string, timing: SupplementTiming
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT OR REPLACE INTO ${SUPPLEMENT_LOGS_TABLE} (supplement_id, date, timing, taken_at)
     VALUES (?, ?, ?, ?)`,
    [supplement_id, date, timing, now]
  );
}

export async function unmarkSupplementTaken(
  supplement_id: number, date: string, timing: SupplementTiming
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `DELETE FROM ${SUPPLEMENT_LOGS_TABLE} WHERE supplement_id = ? AND date = ? AND timing = ?`,
    [supplement_id, date, timing]
  );
}

// ─── Doctor Notes ─────────────────────────────────────────────────────────────

export async function getDoctorNotes(): Promise<DoctorNote[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: number; title: string; diagnosis: string;
    recommendations: string; source_report_id: number | null; created_at: string;
  }>(`SELECT * FROM ${DOCTOR_NOTES_TABLE} ORDER BY created_at DESC`);
  return rows.map((r) => ({
    id: Number(r.id),
    title: r.title,
    diagnosis: r.diagnosis,
    recommendations: r.recommendations,
    source_report_id: r.source_report_id ? Number(r.source_report_id) : null,
    created_at: r.created_at,
  }));
}

export async function saveDoctorNote(input: DoctorNoteInput): Promise<DoctorNote> {
  const db = await getDb();
  const now = new Date().toISOString();
  const result = await db.runAsync(
    `INSERT INTO ${DOCTOR_NOTES_TABLE} (title, diagnosis, recommendations, source_report_id, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [input.title, input.diagnosis, input.recommendations, input.source_report_id ?? null, now]
  );
  const row = await db.getFirstAsync<{
    id: number; title: string; diagnosis: string;
    recommendations: string; source_report_id: number | null; created_at: string;
  }>(`SELECT * FROM ${DOCTOR_NOTES_TABLE} WHERE id = ?`, [result.lastInsertRowId]);
  if (!row) throw new Error("Failed to save doctor note.");
  return { id: Number(row.id), title: row.title, diagnosis: row.diagnosis,
           recommendations: row.recommendations,
           source_report_id: row.source_report_id ? Number(row.source_report_id) : null,
           created_at: row.created_at };
}

export async function clearDoctorNotes(): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM ${DOCTOR_NOTES_TABLE}`);
}
