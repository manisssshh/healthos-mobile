/**
 * aiPersonalizationService.ts
 *
 * Analyzes uploaded medical reports (PDFs + images) and generates a
 * doctor-guided personalization plan including:
 *   - Active health metrics & daily targets
 *   - Meal plan templates (Regular Day, Workout Day, Rest Day)
 *   - 7-day workout schedule
 *   - Health tips extracted from report findings
 *
 * PDF Fix: Uses the Gemini Files API (resumable upload) instead of
 * base64 inline data, which is the correct approach for PDFs and
 * avoids size and parsing failures with the Gemini API.
 */
import * as FileSystem from "expo-file-system";
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

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportAttachment = {
  id: number;
  type: HealthReport["type"];
  name: string;
  mediaType: string;
  /** Base64 image data — used for image/* files via inline Gemini data */
  base64?: string;
  /** Local device URI — used for PDFs uploaded via the Gemini Files API */
  localUri?: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPPORTED_METRICS: HealthMetricKey[] = [
  "sleep",
  "steps",
  "water",
  "calories",
  "weight",
  "blood_pressure_sys",
  "blood_pressure_dia",
  "heart_rate",
  "blood_sugar",
];
const BASE_METRICS: HealthMetricKey[] = ["sleep", "steps", "water"];
const MAX_REPORTS_FOR_AI = 4;
const WORKOUT_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;
const VALID_WORKOUT_TYPES: WorkoutType[] = ["cardio", "strength", "flexibility", "rest"];

const DEFAULT_AI_STEPS = [
  "Reading report files",
  "Extracting clinical signals",
  "Building meal & workout plan",
  "Tuning daily targets",
] as const;

// ─── Prompts ──────────────────────────────────────────────────────────────────

const AI_SYSTEM_PROMPT = `You are a doctor-guided health planning AI for a mobile health tracking app.
You will receive:
1) A user's health profile and goal
2) Uploaded health reports (blood tests, prescriptions, scans as PDF or images)

Carefully read all uploaded documents and generate a comprehensive personalized health plan.
Return ONLY valid JSON — no prose, no markdown fences, no explanation — with this exact schema:

{
  "active_metrics": ["sleep","steps","water"],
  "metric_targets": {
    "sleep": 8,
    "steps": 10000,
    "water": 3000,
    "calories": 1800
  },
  "doctor_focus": ["Clinical focus point 1", "Focus point 2"],
  "summary": "2-4 sentence clinical summary based on the actual report findings.",
  "meal_plan": [
    {
      "label": "Regular Day",
      "meals": [
        { "time": "8:00 AM", "name": "Oatmeal with nuts and banana", "calories": 380, "notes": "High fiber breakfast" },
        { "time": "1:00 PM", "name": "Grilled chicken with salad", "calories": 480, "notes": "Lean protein, low sodium" },
        { "time": "4:30 PM", "name": "Almonds and green tea", "calories": 160, "notes": "Anti-inflammatory snack" },
        { "time": "7:30 PM", "name": "Dal with brown rice and sabzi", "calories": 560, "notes": "Balanced dinner" }
      ],
      "total_calories": 1580
    },
    {
      "label": "Workout Day",
      "meals": [
        { "time": "7:30 AM", "name": "Banana with peanut butter toast", "calories": 420, "notes": "Pre-workout energy" },
        { "time": "10:30 AM", "name": "Protein smoothie with milk and fruit", "calories": 300, "notes": "Post-workout recovery" },
        { "time": "1:30 PM", "name": "Chicken rice bowl with vegetables", "calories": 580, "notes": "High protein lunch" },
        { "time": "4:00 PM", "name": "Greek yogurt with berries", "calories": 180, "notes": "Protein snack" },
        { "time": "8:00 PM", "name": "Lentil soup with whole wheat roti", "calories": 480, "notes": "Light but filling dinner" }
      ],
      "total_calories": 1960
    }
  ],
  "workout_plan": {
    "monday": { "type": "cardio", "name": "Brisk Walk", "duration_minutes": 35, "exercises": ["35 min brisk walk outdoors or treadmill"] },
    "tuesday": { "type": "strength", "name": "Upper Body", "duration_minutes": 40, "exercises": ["Push-ups 3x12", "Dumbbell rows 3x10", "Shoulder press 3x10", "Plank 3x30s"] },
    "wednesday": { "type": "flexibility", "name": "Yoga & Stretch", "duration_minutes": 30, "exercises": ["Sun salutation x5", "Hip flexor stretch 2 min", "Child pose 2 min", "Seated forward bend"] },
    "thursday": { "type": "cardio", "name": "Moderate Cycling or Walk", "duration_minutes": 35, "exercises": ["35 min moderate cycling or brisk walk"] },
    "friday": { "type": "strength", "name": "Lower Body", "duration_minutes": 40, "exercises": ["Squats 3x15", "Lunges 3x12 each leg", "Glute bridges 3x15", "Calf raises 3x20"] },
    "saturday": { "type": "flexibility", "name": "Active Recovery", "duration_minutes": 25, "exercises": ["Light yoga", "Full body stretch", "Deep breathing 5 min"] },
    "sunday": { "type": "rest", "name": "Rest Day", "duration_minutes": 0, "exercises": [] }
  },
  "health_tips": [
    "Actionable tip 1 based on specific report findings",
    "Tip 2",
    "Tip 3"
  ]
}

Rules — follow strictly:
- active_metrics: ONLY from [sleep, steps, water, calories, weight, blood_pressure_sys, blood_pressure_dia, heart_rate, blood_sugar]. Always include sleep, steps, water.
- metric_targets: realistic daily targets only for each active metric.
- meal_plan: provide 2-3 templates. Adapt to health conditions from reports. Prefer Indian dietary patterns where suitable. Calorie totals must align with metric_targets.calories.
- workout_plan: cover all 7 days. Adjust intensity based on conditions (gentle for high_sugar, thyroid; moderate for high_cholesterol; no high-intensity for medical_monitoring).
- health_tips: 3-5 specific actionable tips based on the actual report findings.
- summary: 2-4 sentences, clinically reasoned, plain text. Mention specific values from the reports if available.
- No text outside the JSON object.`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readEnv(name: string): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((process as any).env?.[name] ?? "").trim();
}

/**
 * Case-insensitive extension detection.
 * Added HEIC/HEIF support for iPhone-captured report photos.
 */
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

function parseJsonFromText(raw: string): unknown {
  const text = raw.trim();
  if (!text) throw new Error("Empty AI response.");
  try {
    return JSON.parse(text);
  } catch {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    }
    throw new Error("AI response did not contain valid JSON.");
  }
}

function buildContextPrompt(profile: UserProfile, reports: HealthReport[]): string {
  return [
    "Build a doctor-guided personalization plan for this user based on their profile and the attached medical reports.",
    `Profile: ${JSON.stringify(profile)}`,
    `Reports metadata: ${JSON.stringify(
      reports.slice(0, MAX_REPORTS_FOR_AI).map((r) => ({
        id: r.id,
        type: r.type,
        date: r.date,
        file_name: r.file_name,
      }))
    )}`,
  ].join("\n");
}

// ─── Gemini Files API — PDF Upload ───────────────────────────────────────────

/**
 * Uploads a local PDF to the Gemini Files API using the resumable upload
 * protocol. Returns the Gemini file URI (e.g. "https://...files/xyz").
 *
 * This is the correct approach for PDFs — inline base64 in inlineData
 * is unreliable for large or multi-page medical reports.
 */
async function uploadPdfToGeminiFiles(
  apiKey: string,
  localUri: string,
  fileName: string
): Promise<string> {
  // Determine file size for the upload headers
  const fileInfo = await FileSystem.getInfoAsync(localUri, { size: true });
  if (!fileInfo.exists) throw new Error(`PDF file not found at: ${localUri}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fileSize: number = (fileInfo as any).size ?? 0;
  if (fileSize === 0) throw new Error("PDF file is empty.");

  // Step 1: Start a resumable upload session
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
    throw new Error(`Gemini Files API session init failed (${startResponse.status}).`);
  }

  const uploadUrl = startResponse.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) throw new Error("No upload URL returned from Gemini Files API.");

  // Step 2: Upload the binary PDF content using expo-file-system
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

  const responseData = JSON.parse(uploadResult.body) as {
    file?: { uri?: string; state?: string };
  };
  const geminiUri = responseData?.file?.uri;
  if (!geminiUri) throw new Error("No file URI returned from Gemini Files API upload.");

  return geminiUri;
}

// ─── Report Attachment Loading ────────────────────────────────────────────────

/**
 * Loads report attachments from device storage.
 * PDFs: store only localUri (for Files API upload — avoids base64 size issues).
 * Images: load as base64 for inline Gemini data.
 */
async function loadReportAttachments(reports: HealthReport[]): Promise<ReportAttachment[]> {
  const selected = reports.slice(0, MAX_REPORTS_FOR_AI);
  const attachments: ReportAttachment[] = [];

  for (const report of selected) {
    const mediaType = detectMediaType(report.file_name);
    if (!mediaType) continue;

    try {
      const fileInfo = await FileSystem.getInfoAsync(report.file_url);
      if (!fileInfo.exists) continue;

      if (mediaType === "application/pdf") {
        // PDFs: store URI only — will be uploaded via Files API in callGeminiDirectly
        attachments.push({
          id: report.id,
          type: report.type,
          name: report.file_name,
          mediaType,
          localUri: report.file_url,
        });
      } else {
        // Images: read as base64 for inline data
        const base64 = await FileSystem.readAsStringAsync(report.file_url, {
          encoding: FileSystem.EncodingType.Base64,
        });
        if (!base64) continue;
        attachments.push({
          id: report.id,
          type: report.type,
          name: report.file_name,
          mediaType,
          base64,
        });
      }
    } catch {
      // Skip unreadable files and continue with available reports.
    }
  }

  return attachments;
}

// ─── AI API Callers ───────────────────────────────────────────────────────────

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
      files: attachments.map((item) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        media_type: item.mediaType,
        // Include base64 for images; PDFs must be handled server-side via URL
        data_base64: item.base64 ?? null,
        local_uri: item.localUri ?? null,
      })),
    }),
  });

  if (!response.ok) throw new Error(`AI endpoint failed (${response.status}).`);
  return response.json();
}

async function callGeminiDirectly(
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
      // Upload PDF via Gemini Files API — this is the correct approach for PDFs
      try {
        const geminiUri = await uploadPdfToGeminiFiles(apiKey, attachment.localUri, attachment.name);
        parts.push({
          fileData: {
            mimeType: "application/pdf",
            fileUri: geminiUri,
          },
        });
      } catch (err) {
        // If individual PDF upload fails, log and continue with other files
        console.warn(`[HealthOS] PDF upload skipped (${attachment.name}):`, err);
      }
    } else if (attachment.base64) {
      // Images: use inline data
      parts.push({
        inlineData: {
          mimeType: attachment.mediaType,
          data: attachment.base64,
        },
      });
    }
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: AI_SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0.2,
          // Increased to accommodate meal plan + workout plan JSON output
          maxOutputTokens: 2500,
        },
      }),
    }
  );

  if (!response.ok) throw new Error(`Gemini request failed (${response.status}).`);

  const data = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini response.");
  return text;
}

// ─── Output Coercion ──────────────────────────────────────────────────────────

function coerceModelOutput(raw: unknown): unknown {
  if (typeof raw === "string") return parseJsonFromText(raw);
  if (!raw || typeof raw !== "object") return raw;

  const value = raw as Record<string, unknown>;
  if (value.plan && typeof value.plan === "object") return value.plan;
  if (typeof value.output === "string") return parseJsonFromText(value.output);
  if (typeof value.text === "string") return parseJsonFromText(value.text);

  if (Array.isArray(value.content)) {
    const combined = value.content
      .map((block) => {
        if (block && typeof block === "object" && "text" in block) {
          const t = (block as { text?: unknown }).text;
          return typeof t === "string" ? t : "";
        }
        return "";
      })
      .join("\n")
      .trim();
    if (combined) return parseJsonFromText(combined);
  }

  return raw;
}

// ─── Fallback & Default Targets ───────────────────────────────────────────────

function defaultTargets(profile: UserProfile): MetricTargets {
  const baseWeightTarget =
    profile.goal === "fat_loss"
      ? Number((profile.weight * 0.99).toFixed(1))
      : profile.goal === "muscle_gain"
        ? Number((profile.weight * 1.01).toFixed(1))
        : Number(profile.weight.toFixed(1));

  return {
    sleep: SLEEP_GOAL_HOURS,
    steps:
      profile.goal === "fat_loss"
        ? 11000
        : profile.goal === "medical_monitoring"
          ? 8500
          : STEP_GOAL,
    water: profile.conditions.includes("high_sugar") ? 3500 : WATER_GOAL_ML,
    calories: getCalorieTarget(profile.goal),
    weight: baseWeightTarget,
  };
}

function inferSignalsFromReportNames(reports: HealthReport[]): string[] {
  const blob = reports
    .map((r) => `${r.file_name} ${r.type}`)
    .join(" ")
    .toLowerCase();
  const signals: string[] = [];
  if (blob.includes("hba1c") || blob.includes("glucose") || blob.includes("sugar"))
    signals.push("glucose");
  if (blob.includes("cholesterol") || blob.includes("lipid") || blob.includes("ldl"))
    signals.push("lipids");
  if (blob.includes("thyroid") || blob.includes("tsh")) signals.push("thyroid");
  if (blob.includes("vitamin d") || blob.includes("vitd")) signals.push("vitamin_d");
  return signals;
}

function fallbackPersonalization(
  profile: UserProfile,
  reports: HealthReport[],
  reason: string
): AiPersonalization {
  const signalHints = inferSignalsFromReportNames(reports);
  const metricSet = new Set<HealthMetricKey>(generateActiveMetrics(profile));

  if (signalHints.includes("glucose") || signalHints.includes("lipids"))
    metricSet.add("calories");
  if (signalHints.includes("thyroid")) metricSet.add("weight");
  BASE_METRICS.forEach((m) => metricSet.add(m));

  const activeMetrics = SUPPORTED_METRICS.filter((m) => metricSet.has(m));
  const targets = defaultTargets(profile);
  const doctorFocus = normalizeDoctorFocus([], profile);

  if (signalHints.includes("glucose"))
    doctorFocus.unshift("Prioritize steady hydration, walking, and controlled carb load.");
  if (signalHints.includes("lipids"))
    doctorFocus.unshift("Keep daily activity high and reduce high-fat calorie excess.");

  return {
    active_metrics: activeMetrics,
    metric_targets: normalizeMetricTargets(targets, activeMetrics, profile),
    doctor_focus: doctorFocus.slice(0, 5),
    summary: `Report-aware smart rules are active. ${reason}`,
    source_report_ids: reports.map((r) => r.id),
    generated_at: new Date().toISOString(),
  };
}

// ─── Normalization ────────────────────────────────────────────────────────────

function normalizeMetricList(raw: unknown, fallback: HealthMetricKey[]): HealthMetricKey[] {
  if (!Array.isArray(raw)) return fallback;
  const metricSet = new Set<HealthMetricKey>();
  for (const item of raw) {
    if (typeof item === "string" && SUPPORTED_METRICS.includes(item as HealthMetricKey))
      metricSet.add(item as HealthMetricKey);
  }
  BASE_METRICS.forEach((m) => metricSet.add(m));
  const normalized = SUPPORTED_METRICS.filter((m) => metricSet.has(m));
  return normalized.length ? normalized : fallback;
}

function normalizeMetricTargets(
  raw: unknown,
  activeMetrics: HealthMetricKey[],
  profile: UserProfile
): MetricTargets {
  const defaults = defaultTargets(profile);
  const rawTargets = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const normalized: MetricTargets = {};
  for (const metric of activeMetrics) {
    const candidate = rawTargets[metric];
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) {
      normalized[metric] = Math.round(candidate * 10) / 10;
    } else {
      normalized[metric] = defaults[metric];
    }
  }
  return normalized;
}

function normalizeDoctorFocus(raw: unknown, profile: UserProfile): string[] {
  if (Array.isArray(raw)) {
    const sanitized = raw
      .filter((item) => typeof item === "string")
      .map((item) => (item as string).trim())
      .filter(Boolean)
      .slice(0, 5);
    if (sanitized.length) return sanitized;
  }

  const focus: string[] = [];
  if (profile.goal === "fat_loss")
    focus.push("Maintain a calorie deficit with high daily movement.");
  if (profile.goal === "muscle_gain")
    focus.push("Support training recovery with sleep consistency and calorie sufficiency.");
  if (profile.conditions.includes("high_sugar"))
    focus.push("Keep hydration and walking volume steady to support glycemic control.");
  if (profile.conditions.includes("high_cholesterol"))
    focus.push("Monitor calorie quality and activity volume for lipid management.");
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
    const label =
      typeof obj.label === "string" && obj.label.trim() ? obj.label.trim() : "Regular Day";

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

    const computedTotal = meals.reduce((sum, m) => sum + m.calories, 0);
    const total_calories =
      typeof obj.total_calories === "number" && obj.total_calories > 0
        ? Math.round(obj.total_calories)
        : computedTotal;

    plans.push({ label, meals, total_calories });
  }

  return plans.length ? plans : undefined;
}

function normalizeWorkoutDay(raw: unknown): WorkoutDay {
  const fallback: WorkoutDay = {
    type: "rest",
    name: "Rest Day",
    duration_minutes: 0,
    exercises: [],
  };
  if (!raw || typeof raw !== "object") return fallback;

  const obj = raw as Record<string, unknown>;
  const type: WorkoutType = VALID_WORKOUT_TYPES.includes(obj.type as WorkoutType)
    ? (obj.type as WorkoutType)
    : "rest";
  const name =
    typeof obj.name === "string" && obj.name.trim()
      ? obj.name.trim()
      : type === "rest"
        ? "Rest Day"
        : "Workout";
  const duration_minutes =
    typeof obj.duration_minutes === "number" && obj.duration_minutes >= 0
      ? Math.round(obj.duration_minutes)
      : 0;
  const exercises = Array.isArray(obj.exercises)
    ? obj.exercises
        .filter((e) => typeof e === "string" && (e as string).trim())
        .map((e) => (e as string).trim())
    : [];

  return { type, name, duration_minutes, exercises };
}

function normalizeWorkoutPlan(raw: unknown): WeeklyWorkoutPlan | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  if (!WORKOUT_DAYS.some((day) => day in obj)) return undefined;

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
  const tips = raw
    .filter((t) => typeof t === "string" && (t as string).trim())
    .map((t) => (t as string).trim())
    .slice(0, 5);
  return tips.length ? tips : undefined;
}

function sanitizePersonalization(
  raw: unknown,
  profile: UserProfile,
  sourceReportIds: number[],
  fallbackSummary: string
): AiPersonalization {
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
    return fallbackPersonalization(
      profile,
      reports,
      "No reports found, so profile-based personalization is applied."
    );
  }

  const sourceReportIds = reports.map((r) => r.id);
  const attachments = await loadReportAttachments(reports);
  const endpoint = readEnv("EXPO_PUBLIC_HEALTHOS_AI_ENDPOINT");
  const apiKey = readEnv("EXPO_PUBLIC_GEMINI_API_KEY");

  try {
    let rawOutput: unknown;
    if (endpoint) {
      rawOutput = await callCustomEndpoint(endpoint, profile, reports, attachments);
    } else if (apiKey) {
      rawOutput = await callGeminiDirectly(apiKey, profile, reports, attachments);
    } else {
      return fallbackPersonalization(
        profile,
        reports,
        "AI endpoint is not configured, so smart local personalization is active."
      );
    }

    const parsed = coerceModelOutput(rawOutput);
    return sanitizePersonalization(
      parsed,
      profile,
      sourceReportIds,
      "AI generated doctor-guided tracking plan from your uploaded reports."
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : "AI connection failed.";
    return fallbackPersonalization(profile, reports, `AI connection issue: ${reason}`);
  }
}

export const AI_ANALYSIS_PROGRESS_STEPS = [...DEFAULT_AI_STEPS];
