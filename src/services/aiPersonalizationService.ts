/**
 * aiPersonalizationService.ts
 *
 * Analyzes uploaded medical reports (PDFs + images) via Gemini and generates:
 *   - Active health metrics & daily targets
 *   - Meal plan templates
 *   - 7-day workout schedule
 *   - Health tips from report findings
 *
 * Key fixes:
 *   - Uses responseMimeType: "application/json" → Gemini returns clean JSON, no markdown wrapping
 *   - maxOutputTokens bumped to 8192 → prevents truncated / invalid JSON
 *   - PDFs uploaded via Gemini Files API (resumable upload) instead of broken base64 inline
 *   - Robust JSON extraction with markdown fence stripping as a fallback
 */
import * as FileSystem from "expo-file-system";
import { extractMedicalTextFromImages, convertPdfToBase64Image, getGroqApiKey } from "./groqService";
import { RateLimitError, parseRetryDelay } from "./rateLimitError";
import type {
  AiPersonalization,
  DailyMealTemplate,
  HealthMetricKey,
  HealthReport,
  MealItem,
  MetricTargets,
  UserProfile,
  WeeklyWorkoutPlan,
  WorkoutDay,
  WorkoutType,
} from "../types/health";
import { SLEEP_GOAL_HOURS, STEP_GOAL, WATER_GOAL_ML } from "../types/health";
import { generateActiveMetrics, getCalorieTarget } from "./metricService";

export { RateLimitError, parseRetryDelay } from "./rateLimitError";

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportAttachment = {
  id: number;
  type: HealthReport["type"];
  name: string;
  mediaType: string;
  base64?: string;
  localUri?: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPPORTED_METRICS: HealthMetricKey[] = [
  "sleep", "steps", "water", "calories", "weight",
  "blood_pressure_sys", "blood_pressure_dia", "heart_rate", "blood_sugar",
];
const BASE_METRICS: HealthMetricKey[] = ["sleep", "steps", "water"];
const MAX_REPORTS_FOR_AI = 4;
const WORKOUT_DAYS = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"] as const;
const VALID_WORKOUT_TYPES: WorkoutType[] = ["cardio", "strength", "flexibility", "rest"];

export const AI_ANALYSIS_PROGRESS_STEPS = [
  "Reading report files",
  "Extracting clinical signals",
  "Building meal & workout plan",
  "Tuning daily targets",
] as const;

// ─── Prompt ───────────────────────────────────────────────────────────────────

const AI_SYSTEM_PROMPT = `You are a doctor-guided health planning AI. Analyze the user's medical reports and return a JSON health plan.

CRITICAL: Return ONLY raw JSON. No markdown. No explanation. No code fences. Start with { and end with }.

JSON schema (follow exactly):
{
  "active_metrics": ["sleep","steps","water"],
  "metric_targets": { "sleep": 8, "steps": 10000, "water": 3000, "calories": 1800 },
  "doctor_focus": ["Clinical insight 1", "Clinical insight 2"],
  "summary": "2-3 sentence clinical summary based on actual report values.",
  "meal_plan": [
    {
      "label": "Regular Day",
      "meals": [
        { "time": "8:00 AM", "name": "Oatmeal with fruits", "calories": 350, "notes": "High fiber" },
        { "time": "1:00 PM", "name": "Dal rice with sabzi", "calories": 500, "notes": "Balanced lunch" },
        { "time": "4:00 PM", "name": "Nuts and green tea", "calories": 150, "notes": "Light snack" },
        { "time": "7:30 PM", "name": "Roti with chicken curry", "calories": 550, "notes": "Protein-rich dinner" }
      ],
      "total_calories": 1550
    },
    {
      "label": "Workout Day",
      "meals": [
        { "time": "7:00 AM", "name": "Banana peanut butter toast", "calories": 400, "notes": "Pre-workout" },
        { "time": "10:30 AM", "name": "Protein shake with milk", "calories": 280, "notes": "Post-workout" },
        { "time": "1:30 PM", "name": "Chicken rice bowl", "calories": 600, "notes": "High protein" },
        { "time": "4:30 PM", "name": "Greek yogurt with berries", "calories": 180, "notes": "Recovery snack" },
        { "time": "8:00 PM", "name": "Lentil soup with roti", "calories": 450, "notes": "Light dinner" }
      ],
      "total_calories": 1910
    }
  ],
  "workout_plan": {
    "monday": { "type": "cardio", "name": "Brisk Walk", "duration_minutes": 35, "exercises": ["35 min brisk walk at moderate pace"] },
    "tuesday": { "type": "strength", "name": "Upper Body", "duration_minutes": 40, "exercises": ["Push-ups 3x12", "Dumbbell rows 3x10", "Plank 3x30s"] },
    "wednesday": { "type": "flexibility", "name": "Yoga", "duration_minutes": 30, "exercises": ["Sun salutation x5", "Child pose 2 min", "Hip flexor stretch"] },
    "thursday": { "type": "cardio", "name": "Cycling", "duration_minutes": 35, "exercises": ["35 min moderate cycling"] },
    "friday": { "type": "strength", "name": "Lower Body", "duration_minutes": 40, "exercises": ["Squats 3x15", "Lunges 3x12", "Glute bridges 3x15"] },
    "saturday": { "type": "flexibility", "name": "Active Recovery", "duration_minutes": 25, "exercises": ["Light yoga", "Full body stretch"] },
    "sunday": { "type": "rest", "name": "Rest Day", "duration_minutes": 0, "exercises": [] }
  },
  "health_tips": ["Tip 1 from report findings", "Tip 2", "Tip 3"]
}

Rules:
- active_metrics: only from [sleep,steps,water,calories,weight,blood_pressure_sys,blood_pressure_dia,heart_rate,blood_sugar]. Always include sleep,steps,water.
- metric_targets: realistic daily targets for each active metric only.
- meal_plan: 2 templates. Adapt food to user conditions. Prefer Indian diet. Calorie totals must match metric_targets.calories.
- workout_plan: all 7 days. Be gentle for high_sugar/thyroid. No intense cardio for medical_monitoring.
- health_tips: 3-5 specific tips based on actual values found in the report.
- summary: mention specific lab values if visible in the report (e.g. HbA1c 7.2%, cholesterol 210 mg/dL).`;

// ─── Env helper ───────────────────────────────────────────────────────────────

function readEnv(name: string): string {
  // Metro statically replaces process.env.EXPO_PUBLIC_* at bundle time.
  // Dynamic bracket access (process.env[name]) does NOT work in React Native.
  if (name === "EXPO_PUBLIC_GEMINI_API_KEY") {
    return (process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? "").trim();
  }
  if (name === "EXPO_PUBLIC_HEALTHOS_AI_ENDPOINT") {
    return (process.env.EXPO_PUBLIC_HEALTHOS_AI_ENDPOINT ?? "").trim();
  }
  return "";
}

// ─── JSON Parsing — robust with markdown fence stripping ──────────────────────

function extractJsonFromText(raw: string): unknown {
  const text = raw.trim();
  if (!text) throw new Error("Empty AI response.");

  // 1. Direct parse
  try { return JSON.parse(text); } catch { /* continue */ }

  // 2. Strip markdown fences: ```json ... ``` or ``` ... ```
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch?.[1]) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch { /* continue */ }
  }

  // 3. Extract first { ... } block
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try { return JSON.parse(text.slice(firstBrace, lastBrace + 1)); } catch { /* continue */ }
  }

  throw new Error("AI response did not contain valid JSON.");
}

// ─── Media type detection ─────────────────────────────────────────────────────

function detectMediaType(fileName: string): string | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  return null;
}

// ─── Gemini Files API — PDF Upload ───────────────────────────────────────────

async function uploadPdfToGeminiFiles(
  apiKey: string,
  localUri: string,
  fileName: string
): Promise<string> {
  const fileInfo = await FileSystem.getInfoAsync(localUri, { size: true });
  if (!fileInfo.exists) throw new Error(`PDF not found: ${localUri}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fileSize: number = (fileInfo as any).size ?? 0;
  if (fileSize === 0) throw new Error("PDF file is empty.");

  const startResponse = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(fileSize),
        "X-Goog-Upload-Header-Content-Type": "application/pdf",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: fileName } }),
    }
  );

  if (!startResponse.ok) {
    throw new Error(`Gemini Files API init failed (${startResponse.status}).`);
  }

  const uploadUrl = startResponse.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) throw new Error("No upload URL returned from Gemini Files API.");

  const uploadResult = await FileSystem.uploadAsync(uploadUrl, localUri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      "Content-Length": String(fileSize),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
  });

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error(`PDF upload to Gemini failed (${uploadResult.status}).`);
  }

  const responseData = JSON.parse(uploadResult.body) as { file?: { uri?: string } };
  const geminiUri = responseData?.file?.uri;
  if (!geminiUri) throw new Error("No file URI from Gemini Files API.");
  return geminiUri;
}

// ─── Load attachments ─────────────────────────────────────────────────────────

async function loadReportAttachments(reports: HealthReport[]): Promise<ReportAttachment[]> {
  const attachments: ReportAttachment[] = [];

  for (const report of reports.slice(0, MAX_REPORTS_FOR_AI)) {
    const mediaType = detectMediaType(report.file_name);
    if (!mediaType) continue;

    try {
      const fileInfo = await FileSystem.getInfoAsync(report.file_url);
      if (!fileInfo.exists) continue;

      if (mediaType === "application/pdf") {
        attachments.push({ id: report.id, type: report.type, name: report.file_name, mediaType, localUri: report.file_url });
      } else {
        const base64 = await FileSystem.readAsStringAsync(report.file_url, { encoding: FileSystem.EncodingType.Base64 });
        if (base64) attachments.push({ id: report.id, type: report.type, name: report.file_name, mediaType, base64 });
      }
    } catch { /* skip unreadable files */ }
  }

  return attachments;
}

// ─── Context prompt ───────────────────────────────────────────────────────────

function buildContextPrompt(profile: UserProfile, reports: HealthReport[]): string {
  return [
    "Analyze the attached medical reports and create a personalized health plan for this user.",
    `Profile: ${JSON.stringify(profile)}`,
    `Reports: ${JSON.stringify(reports.slice(0, MAX_REPORTS_FOR_AI).map((r) => ({ id: r.id, type: r.type, date: r.date, name: r.file_name })))}`,
    "Extract actual lab values from the reports and use them to personalize the plan.",
  ].join("\n");
}

// ─── Gemini analysis — text-only prompt (fast, low quota) ────────────────────

async function callGeminiWithText(
  apiKey: string,
  textPrompt: string
): Promise<unknown> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: AI_SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: textPrompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    if (response.status === 429) throw new RateLimitError(parseRetryDelay(errText));
    throw new Error(`Gemini request failed (${response.status}): ${errText.slice(0, 200)}`);
  }

  const data = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini response.");
  return text;
}

// ─── Gemini full pipeline — PDFs via Files API ────────────────────────────────

async function callGeminiWithFiles(
  apiKey: string,
  profile: UserProfile,
  reports: HealthReport[],
  attachments: ReportAttachment[]
): Promise<unknown> {
  const parts: Array<Record<string, unknown>> = [
    { text: buildContextPrompt(profile, reports) },
  ];

  for (const attachment of attachments) {
    if (attachment.mediaType === "application/pdf" && attachment.localUri) {
      try {
        const geminiUri = await uploadPdfToGeminiFiles(apiKey, attachment.localUri, attachment.name);
        parts.push({ fileData: { mimeType: "application/pdf", fileUri: geminiUri } });
      } catch (err) {
        console.warn(`[HealthOS] PDF upload skipped (${attachment.name}):`, err);
      }
    } else if (attachment.base64) {
      parts.push({ inlineData: { mimeType: attachment.mediaType, data: attachment.base64 } });
    }
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: AI_SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    if (response.status === 429) throw new RateLimitError(parseRetryDelay(errText));
    throw new Error(`Gemini request failed (${response.status}): ${errText.slice(0, 200)}`);
  }

  const data = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini response.");
  return text;
}

async function callCustomEndpoint(
  endpoint: string,
  profile: UserProfile,
  reports: HealthReport[],
  attachments: ReportAttachment[]
): Promise<unknown> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profile,
      reports: reports.slice(0, MAX_REPORTS_FOR_AI),
      files: attachments.map((a) => ({
        id: a.id, name: a.name, type: a.type,
        media_type: a.mediaType,
        data_base64: a.base64 ?? null,
        local_uri: a.localUri ?? null,
      })),
    }),
  });
  if (!response.ok) throw new Error(`AI endpoint failed (${response.status}).`);
  return response.json();
}

// ─── Output coercion ──────────────────────────────────────────────────────────

function coerceModelOutput(raw: unknown): unknown {
  if (typeof raw === "string") return extractJsonFromText(raw);
  if (!raw || typeof raw !== "object") return raw;

  const value = raw as Record<string, unknown>;
  if (value.plan && typeof value.plan === "object") return value.plan;
  if (typeof value.output === "string") return extractJsonFromText(value.output);
  if (typeof value.text === "string") return extractJsonFromText(value.text);

  if (Array.isArray(value.content)) {
    const combined = value.content
      .map((b) => (b && typeof b === "object" && "text" in b && typeof (b as { text?: unknown }).text === "string" ? (b as { text: string }).text : ""))
      .join("\n").trim();
    if (combined) return extractJsonFromText(combined);
  }

  return raw;
}

// ─── Defaults & Fallbacks ─────────────────────────────────────────────────────

function defaultTargets(profile: UserProfile): MetricTargets {
  return {
    sleep: SLEEP_GOAL_HOURS,
    steps: profile.goal === "fat_loss" ? 11000 : profile.goal === "medical_monitoring" ? 8500 : STEP_GOAL,
    water: profile.conditions.includes("high_sugar") ? 3500 : WATER_GOAL_ML,
    calories: getCalorieTarget(profile.goal),
    weight: profile.goal === "fat_loss"
      ? Number((profile.weight * 0.99).toFixed(1))
      : profile.goal === "muscle_gain"
        ? Number((profile.weight * 1.01).toFixed(1))
        : Number(profile.weight.toFixed(1)),
  };
}

function inferSignalsFromReportNames(reports: HealthReport[]): string[] {
  const blob = reports.map((r) => `${r.file_name} ${r.type}`).join(" ").toLowerCase();
  const signals: string[] = [];
  if (blob.includes("hba1c") || blob.includes("glucose") || blob.includes("sugar")) signals.push("glucose");
  if (blob.includes("cholesterol") || blob.includes("lipid") || blob.includes("ldl")) signals.push("lipids");
  if (blob.includes("thyroid") || blob.includes("tsh")) signals.push("thyroid");
  if (blob.includes("vitamin d") || blob.includes("vitd")) signals.push("vitamin_d");
  return signals;
}

function fallbackPersonalization(profile: UserProfile, reports: HealthReport[], reason: string): AiPersonalization {
  const signals = inferSignalsFromReportNames(reports);
  const metricSet = new Set<HealthMetricKey>(generateActiveMetrics(profile));
  if (signals.includes("glucose") || signals.includes("lipids")) metricSet.add("calories");
  if (signals.includes("thyroid")) metricSet.add("weight");
  BASE_METRICS.forEach((m) => metricSet.add(m));

  const activeMetrics = SUPPORTED_METRICS.filter((m) => metricSet.has(m));
  const targets = defaultTargets(profile);
  const focus = normalizeDoctorFocus([], profile);

  return {
    active_metrics: activeMetrics,
    metric_targets: normalizeMetricTargets(targets, activeMetrics, profile),
    doctor_focus: focus.slice(0, 5),
    summary: `Smart local rules are active. ${reason}`,
    source_report_ids: reports.map((r) => r.id),
    generated_at: new Date().toISOString(),
  };
}

// ─── Normalization ────────────────────────────────────────────────────────────

function normalizeMetricList(raw: unknown, fallback: HealthMetricKey[]): HealthMetricKey[] {
  if (!Array.isArray(raw)) return fallback;
  const s = new Set<HealthMetricKey>();
  for (const item of raw) {
    if (typeof item === "string" && SUPPORTED_METRICS.includes(item as HealthMetricKey))
      s.add(item as HealthMetricKey);
  }
  BASE_METRICS.forEach((m) => s.add(m));
  const result = SUPPORTED_METRICS.filter((m) => s.has(m));
  return result.length ? result : fallback;
}

function normalizeMetricTargets(raw: unknown, activeMetrics: HealthMetricKey[], profile: UserProfile): MetricTargets {
  const defaults = defaultTargets(profile);
  const rawTargets = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: MetricTargets = {};
  for (const metric of activeMetrics) {
    const candidate = rawTargets[metric];
    out[metric] = typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0
      ? Math.round(candidate * 10) / 10
      : defaults[metric];
  }
  return out;
}

function normalizeDoctorFocus(raw: unknown, profile: UserProfile): string[] {
  if (Array.isArray(raw)) {
    const sanitized = raw.filter((i) => typeof i === "string").map((i) => (i as string).trim()).filter(Boolean).slice(0, 5);
    if (sanitized.length) return sanitized;
  }
  const focus: string[] = [];
  if (profile.goal === "fat_loss") focus.push("Maintain a calorie deficit with high daily movement.");
  if (profile.goal === "muscle_gain") focus.push("Support training recovery with sleep and calorie sufficiency.");
  if (profile.conditions.includes("high_sugar")) focus.push("Steady hydration and walking to support glycemic control.");
  if (profile.conditions.includes("high_cholesterol")) focus.push("Monitor calorie quality and activity for lipid management.");
  if (!focus.length) focus.push("Build consistent sleep, hydration, and activity habits.");
  return focus;
}

function normalizeSummary(raw: unknown, fallback: string): string {
  return typeof raw === "string" && raw.trim() ? raw.trim() : fallback;
}

function normalizeMealPlan(raw: unknown): DailyMealTemplate[] | undefined {
  if (!Array.isArray(raw) || !raw.length) return undefined;
  const plans: DailyMealTemplate[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const label = typeof obj.label === "string" && obj.label.trim() ? obj.label.trim() : "Regular Day";
    const meals: MealItem[] = [];
    if (Array.isArray(obj.meals)) {
      for (const meal of obj.meals) {
        if (!meal || typeof meal !== "object") continue;
        const m = meal as Record<string, unknown>;
        if (typeof m.name !== "string" || !m.name.trim()) continue;
        meals.push({
          time: typeof m.time === "string" ? m.time.trim() : "",
          name: m.name.trim(),
          calories: typeof m.calories === "number" && m.calories > 0 ? Math.round(m.calories) : 0,
          notes: typeof m.notes === "string" && m.notes.trim() ? m.notes.trim() : undefined,
        });
      }
    }
    if (!meals.length) continue;
    const computed = meals.reduce((s, m) => s + m.calories, 0);
    plans.push({
      label,
      meals,
      total_calories: typeof obj.total_calories === "number" && obj.total_calories > 0 ? Math.round(obj.total_calories) : computed,
    });
  }
  return plans.length ? plans : undefined;
}

function normalizeWorkoutDay(raw: unknown): WorkoutDay {
  const fallback: WorkoutDay = { type: "rest", name: "Rest Day", duration_minutes: 0, exercises: [] };
  if (!raw || typeof raw !== "object") return fallback;
  const obj = raw as Record<string, unknown>;
  const type: WorkoutType = VALID_WORKOUT_TYPES.includes(obj.type as WorkoutType) ? (obj.type as WorkoutType) : "rest";
  const name = typeof obj.name === "string" && obj.name.trim() ? obj.name.trim() : type === "rest" ? "Rest Day" : "Workout";
  const duration_minutes = typeof obj.duration_minutes === "number" && obj.duration_minutes >= 0 ? Math.round(obj.duration_minutes) : 0;
  const exercises = Array.isArray(obj.exercises) ? obj.exercises.filter((e) => typeof e === "string" && (e as string).trim()).map((e) => (e as string).trim()) : [];
  return { type, name, duration_minutes, exercises };
}

function normalizeWorkoutPlan(raw: unknown): WeeklyWorkoutPlan | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  if (!WORKOUT_DAYS.some((d) => d in obj)) return undefined;
  return {
    monday: normalizeWorkoutDay(obj.monday),
    tuesday: normalizeWorkoutDay(obj.tuesday),
    wednesday: normalizeWorkoutDay(obj.wednesday),
    thursday: normalizeWorkoutDay(obj.thursday),
    friday: normalizeWorkoutDay(obj.friday),
    saturday: normalizeWorkoutDay(obj.saturday),
    sunday: normalizeWorkoutDay(obj.sunday),
  };
}

function normalizeHealthTips(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const tips = raw.filter((t) => typeof t === "string" && (t as string).trim()).map((t) => (t as string).trim()).slice(0, 5);
  return tips.length ? tips : undefined;
}

function sanitizePersonalization(raw: unknown, profile: UserProfile, sourceReportIds: number[], fallbackSummary: string): AiPersonalization {
  const baseMetrics = generateActiveMetrics(profile);
  const payload = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const activeMetrics = normalizeMetricList(payload.active_metrics, baseMetrics);
  const metricTargets = normalizeMetricTargets(payload.metric_targets, activeMetrics, profile);
  const doctorFocus = normalizeDoctorFocus(payload.doctor_focus, profile);
  const summary = normalizeSummary(payload.summary, fallbackSummary);
  const meal_plan = normalizeMealPlan(payload.meal_plan);
  const workout_plan = normalizeWorkoutPlan(payload.workout_plan);
  const health_tips = normalizeHealthTips(payload.health_tips);

  return {
    active_metrics: activeMetrics,
    metric_targets: metricTargets,
    doctor_focus: doctorFocus,
    summary,
    source_report_ids: sourceReportIds,
    generated_at: new Date().toISOString(),
    ...(meal_plan && { meal_plan }),
    ...(workout_plan && { workout_plan }),
    ...(health_tips && { health_tips }),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function analyzeReportsForPersonalization(
  profile: UserProfile,
  reports: HealthReport[]
): Promise<AiPersonalization> {
  if (!reports.length) {
    return fallbackPersonalization(profile, reports, "No reports uploaded yet.");
  }

  const sourceReportIds = reports.map((r) => r.id);
  const attachments = await loadReportAttachments(reports);
  const endpoint = readEnv("EXPO_PUBLIC_HEALTHOS_AI_ENDPOINT");
  const apiKey = readEnv("EXPO_PUBLIC_GEMINI_API_KEY");

  try {
    let rawOutput: unknown;
    if (endpoint) {
      rawOutput = await callCustomEndpoint(endpoint, profile, reports, attachments);
    } else {
      const groqKey = getGroqApiKey();

      if (groqKey && apiKey) {
        // ── Two-step pipeline: Groq reads ALL files → Gemini analyses text ──
        // Convert PDFs to images first so Groq can read them
        const allAsImages: Array<{ base64: string; mediaType: string; name: string }> = [];
        for (const att of attachments) {
          if (att.mediaType === "application/pdf" && att.localUri) {
            const pdfBase64 = await convertPdfToBase64Image(att.localUri);
            if (pdfBase64) allAsImages.push({ base64: pdfBase64, mediaType: "image/jpeg", name: att.name });
          } else if (att.base64) {
            allAsImages.push({ base64: att.base64, mediaType: att.mediaType, name: att.name });
          }
        }

        if (allAsImages.length > 0) {
          // Step 1: Groq extracts raw text from all files (grunt work)
          const extractedText = await extractMedicalTextFromImages(allAsImages);
          // Step 2: Gemini analyses clean text — no files, no quota waste
          const analysisPrompt = [
            buildContextPrompt(profile, reports),
            "--- EXTRACTED REPORT CONTENT (via OCR) ---",
            extractedText,
            "--- END OF REPORT ---",
            "Use the extracted report content above to build the personalized health plan.",
          ].join("\n\n");
          rawOutput = await callGeminiWithText(apiKey, analysisPrompt);
        } else {
          // No readable attachments — Gemini analyses from report metadata only
          rawOutput = await callGeminiWithText(apiKey, buildContextPrompt(profile, reports));
        }
      } else if (apiKey) {
        // ── Gemini full pipeline: no Groq key configured ─────────────────────
        rawOutput = await callGeminiWithFiles(apiKey, profile, reports, attachments);
      } else {
        return fallbackPersonalization(profile, reports, "No AI API key configured.");
      }
    }

    const parsed = coerceModelOutput(rawOutput);
    return sanitizePersonalization(parsed, profile, sourceReportIds, "AI plan generated from your uploaded reports.");
  } catch (error) {
    if (error instanceof RateLimitError) throw error; // bubble up for Alert popup
    const reason = error instanceof Error ? error.message : "AI connection failed.";
    console.error("[HealthOS] AI personalization failed:", reason);
    return fallbackPersonalization(profile, reports, `AI issue: ${reason}`);
  }
}
