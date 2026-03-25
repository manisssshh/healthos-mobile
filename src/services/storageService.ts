import * as SQLite from "expo-sqlite";
import type {
  AiPersonalization,
  DailyHealthRecord,
  DailyHealthUpdates,
  HealthReport,
  HealthReportInput,
  UserProfile,
  UserProfileInput
} from "../types/health";
import { getLastNDates } from "../utils/dateUtils";

const DB_NAME = "healthos_mobile.db";
const DAILY_TABLE = "daily_health";
const PROFILE_TABLE = "user_profile";
const REPORTS_TABLE = "health_reports";
const AI_TABLE = "ai_personalization";

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
  if (!row) {
    return null;
  }

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
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((item) => typeof item === "string") as UserProfile["conditions"];
    }
  } catch (_error) {
    // Fallback to empty conditions.
  }

  return [];
}

function parseStringArray(raw: string | null | undefined): string[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((item) => typeof item === "string") as string[];
    }
  } catch (_error) {
    // Fallback to empty array.
  }
  return [];
}

function parseNumberArray(raw: string | null | undefined): number[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item));
    }
  } catch (_error) {
    // Fallback to empty array.
  }
  return [];
}

function parseObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch (_error) {
    // Fallback to empty object.
  }
  return {};
}

function normalizeAiPersonalization(
  row: {
    active_metrics: string;
    metric_targets: string;
    doctor_focus: string;
    summary: string;
    source_report_ids: string;
    generated_at: string;
  } | null
): AiPersonalization | null {
  if (!row) {
    return null;
  }

  const metrics = parseStringArray(row.active_metrics);
  const doctorFocus = parseStringArray(row.doctor_focus);
  const sourceReportIds = parseNumberArray(row.source_report_ids);
  const rawTargets = parseObject(row.metric_targets);
  const metricTargets: AiPersonalization["metric_targets"] = {};

  for (const [key, value] of Object.entries(rawTargets)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      continue;
    }
    metricTargets[key as keyof AiPersonalization["metric_targets"]] = Math.round(value * 10) / 10;
  }

  return {
    active_metrics: metrics.filter((metric) =>
      ["sleep", "steps", "water", "calories", "weight", "blood_pressure_sys", "blood_pressure_dia", "heart_rate", "blood_sugar"].includes(metric)
    ) as AiPersonalization["active_metrics"],
    metric_targets: metricTargets,
    doctor_focus: doctorFocus,
    summary: row.summary || "",
    source_report_ids: sourceReportIds,
    generated_at: row.generated_at || new Date().toISOString()
  };
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
      doctor_focus TEXT NOT NULL DEFAULT '[]',
      summary TEXT NOT NULL DEFAULT '',
      source_report_ids TEXT NOT NULL DEFAULT '[]',
      generated_at TEXT NOT NULL DEFAULT ''
    );
  `);
}

async function ensureSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  const dailyTableInfo = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${DAILY_TABLE});`);
  const dailyColumns = new Set(dailyTableInfo.map((item) => item.name));

  if (!dailyColumns.has("calories")) {
    await db.execAsync(`ALTER TABLE ${DAILY_TABLE} ADD COLUMN calories INTEGER NOT NULL DEFAULT 0;`);
  }
  if (!dailyColumns.has("food_intake")) {
    await db.execAsync(`ALTER TABLE ${DAILY_TABLE} ADD COLUMN food_intake TEXT NOT NULL DEFAULT '';`);
  }
  if (!dailyColumns.has("weight_kg")) {
    await db.execAsync(`ALTER TABLE ${DAILY_TABLE} ADD COLUMN weight_kg REAL NOT NULL DEFAULT 0;`);
  }
  if (!dailyColumns.has("blood_pressure_sys")) {
    await db.execAsync(`ALTER TABLE ${DAILY_TABLE} ADD COLUMN blood_pressure_sys INTEGER NOT NULL DEFAULT 0;`);
    await db.execAsync(`ALTER TABLE ${DAILY_TABLE} ADD COLUMN blood_pressure_dia INTEGER NOT NULL DEFAULT 0;`);
    await db.execAsync(`ALTER TABLE ${DAILY_TABLE} ADD COLUMN heart_rate INTEGER NOT NULL DEFAULT 0;`);
    await db.execAsync(`ALTER TABLE ${DAILY_TABLE} ADD COLUMN blood_sugar INTEGER NOT NULL DEFAULT 0;`);
  }

  const profileTableInfo = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${PROFILE_TABLE});`);
  const profileColumns = new Set(profileTableInfo.map((item) => item.name));
  if (!profileColumns.size) {
    await createTables(db);
    return;
  }

  if (!profileColumns.has("conditions")) {
    await db.execAsync(`ALTER TABLE ${PROFILE_TABLE} ADD COLUMN conditions TEXT NOT NULL DEFAULT '[]';`);
  }
  if (!profileColumns.has("created_at")) {
    await db.execAsync(`ALTER TABLE ${PROFILE_TABLE} ADD COLUMN created_at TEXT NOT NULL DEFAULT '';`);
  }
  if (!profileColumns.has("updated_at")) {
    await db.execAsync(`ALTER TABLE ${PROFILE_TABLE} ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';`);
  }

  const reportsTableInfo = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${REPORTS_TABLE});`);
  if (!reportsTableInfo.length) {
    await createTables(db);
  }

  const aiTableInfo = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${AI_TABLE});`);
  if (!aiTableInfo.length) {
    await createTables(db);
  }
}

export async function initDatabase(): Promise<void> {
  await getDb();
}

export async function getUserProfile(): Promise<UserProfile | null> {
  const db = await getDb();
  const profileRow = await db.getFirstAsync<{
    age: number;
    weight: number;
    height: number;
    goal: UserProfile["goal"];
    conditions: string;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT age, weight, height, goal, conditions, created_at, updated_at
     FROM ${PROFILE_TABLE}
     WHERE id = 1`
  );

  return normalizeProfile(profileRow ?? null);
}

export async function upsertUserProfile(input: UserProfileInput): Promise<UserProfile> {
  const db = await getDb();
  const timestamp = new Date().toISOString();
  const existing = await getUserProfile();
  const createdAt = existing?.created_at || timestamp;

  await db.runAsync(
    `INSERT OR REPLACE INTO ${PROFILE_TABLE}
      (id, age, weight, height, goal, conditions, created_at, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Math.round(input.age),
      Number(input.weight.toFixed(1)),
      Number(input.height.toFixed(1)),
      input.goal,
      JSON.stringify(input.conditions),
      createdAt,
      timestamp
    ]
  );

  const profile = await getUserProfile();
  if (!profile) {
    throw new Error("Failed to save user profile.");
  }
  return profile;
}

export async function getHealthReports(): Promise<HealthReport[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<HealthReport>(
    `SELECT id, file_url, type, date, file_name
     FROM ${REPORTS_TABLE}
     ORDER BY date DESC, id DESC`
  );
  return rows.map((row) => ({
    id: Number(row.id),
    file_url: row.file_url,
    type: row.type,
    date: row.date,
    file_name: row.file_name
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

  if (!inserted) {
    throw new Error("Failed to save report.");
  }

  return {
    id: Number(inserted.id),
    file_url: inserted.file_url,
    type: inserted.type,
    date: inserted.date,
    file_name: inserted.file_name
  };
}

export async function getAiPersonalization(): Promise<AiPersonalization | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    active_metrics: string;
    metric_targets: string;
    doctor_focus: string;
    summary: string;
    source_report_ids: string;
    generated_at: string;
  }>(
    `SELECT active_metrics, metric_targets, doctor_focus, summary, source_report_ids, generated_at
     FROM ${AI_TABLE}
     WHERE id = 1`
  );

  return normalizeAiPersonalization(row ?? null);
}

export async function saveAiPersonalization(plan: AiPersonalization): Promise<AiPersonalization> {
  const db = await getDb();
  const generatedAt = plan.generated_at || new Date().toISOString();

  await db.runAsync(
    `INSERT OR REPLACE INTO ${AI_TABLE}
      (id, active_metrics, metric_targets, doctor_focus, summary, source_report_ids, generated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?)`,
    [
      JSON.stringify(plan.active_metrics),
      JSON.stringify(plan.metric_targets),
      JSON.stringify(plan.doctor_focus),
      plan.summary,
      JSON.stringify(plan.source_report_ids),
      generatedAt
    ]
  );

  const saved = await getAiPersonalization();
  if (!saved) {
    throw new Error("Failed to save AI personalization.");
  }
  return saved;
}

export async function getOrCreateDailyRecord(
  date: string,
  defaultWeight: number = 0
): Promise<DailyHealthRecord> {
  const db = await getDb();
  const existing = await db.getFirstAsync<DailyHealthRecord>(
    `SELECT date, water_ml, steps, sleep_hours, calories, weight_kg, food_intake, blood_pressure_sys, blood_pressure_dia, heart_rate, blood_sugar
     FROM ${DAILY_TABLE}
     WHERE date = ?`,
    [date]
  );

  if (existing) {
    return normalizeRecord(existing);
  }

  const created = emptyRecord(date, defaultWeight);
  await db.runAsync(
    `INSERT INTO ${DAILY_TABLE}
      (date, water_ml, steps, sleep_hours, calories, weight_kg, food_intake, blood_pressure_sys, blood_pressure_dia, heart_rate, blood_sugar)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      created.date,
      created.water_ml,
      created.steps,
      created.sleep_hours,
      created.calories,
      created.weight_kg,
      created.food_intake,
      created.blood_pressure_sys,
      created.blood_pressure_dia,
      created.heart_rate,
      created.blood_sugar
    ]
  );

  return created;
}

export async function updateDailyRecord(
  date: string,
  updates: DailyHealthUpdates,
  defaultWeight: number = 0
): Promise<DailyHealthRecord> {
  await getOrCreateDailyRecord(date, defaultWeight);

  const updateEntries = Object.entries(updates).filter(([, value]) => value !== undefined);
  if (!updateEntries.length) {
    return getOrCreateDailyRecord(date, defaultWeight);
  }

  const setClause = updateEntries.map(([key]) => `${key} = ?`).join(", ");
  const values = updateEntries.map(([, value]) => value as string | number);
  const db = await getDb();

  await db.runAsync(`UPDATE ${DAILY_TABLE} SET ${setClause} WHERE date = ?`, [...values, date]);
  return getOrCreateDailyRecord(date, defaultWeight);
}

export async function resetDailyRecord(date: string): Promise<DailyHealthRecord> {
  const db = await getDb();
  await getOrCreateDailyRecord(date);
  await db.runAsync(
    `UPDATE ${DAILY_TABLE}
     SET water_ml = 0, steps = 0, sleep_hours = 0, calories = 0, weight_kg = 0, food_intake = '', blood_pressure_sys = 0, blood_pressure_dia = 0, heart_rate = 0, blood_sugar = 0
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
    `SELECT date, water_ml, steps, sleep_hours, calories, weight_kg, food_intake, blood_pressure_sys, blood_pressure_dia, heart_rate, blood_sugar
     FROM ${DAILY_TABLE}
     WHERE date BETWEEN ? AND ?
     ORDER BY date ASC`,
    [firstDate, lastDate]
  );

  const rowMap = new Map(rows.map((row) => [row.date, normalizeRecord(row)]));
  return keys.map((key) => rowMap.get(key) ?? emptyRecord(key));
}

function toDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}
