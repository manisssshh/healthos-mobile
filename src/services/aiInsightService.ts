/**
 * aiInsightService.ts
 * Generates a personalized daily health insight paragraph
 * by sending the user's weekly data to the Gemini API.
 * Falls back to the static insightService if no API key is configured.
 */
import type {
  AiPersonalization,
  DailyHealthRecord,
  HealthMetricKey,
  UserProfile
} from "../types/health";
import { getDoctorInsight } from "./insightService";

type InsightRequest = {
  profile: UserProfile;
  todayRecord: DailyHealthRecord;
  weeklyRecords: DailyHealthRecord[];
  activeMetrics: HealthMetricKey[];
  aiPersonalization: AiPersonalization | null;
};

const INSIGHT_SYSTEM_PROMPT = `You are a doctor-guided personal health coach.
You will receive a user's health profile and their daily and weekly health data.
Generate a single SHORT paragraph (2-4 sentences) of personalized, clinically reasoned
daily health insight. Be specific about what metric is doing well or needs attention.
Write directly to the user. No markdown, no lists, just plain prose. No fluff.`;

function readEnv(name: string): string {
  // Expo inlines EXPO_PUBLIC_ vars into process.env at bundle time.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((process as any).env?.[name] ?? "").trim();
}

function formatWeeklySummary(records: DailyHealthRecord[], metrics: HealthMetricKey[]): string {
  const lines: string[] = [];
  for (const metric of metrics) {
    let total = 0;
    let count = 0;
    for (const record of records) {
      let val = 0;
      if (metric === "sleep") val = record.sleep_hours;
      else if (metric === "steps") val = record.steps;
      else if (metric === "water") val = record.water_ml;
      else if (metric === "calories") val = record.calories;
      else if (metric === "weight") val = record.weight_kg;
      else if (metric === "blood_pressure_sys") val = record.blood_pressure_sys;
      else if (metric === "blood_pressure_dia") val = record.blood_pressure_dia;
      else if (metric === "heart_rate") val = record.heart_rate;
      else if (metric === "blood_sugar") val = record.blood_sugar;
      if (val > 0) { total += val; count++; }
    }
    const avg = count > 0 ? (total / count).toFixed(1) : "n/a";
    lines.push(`  ${metric}: weekly avg = ${avg}`);
  }
  return lines.join("\n");
}

async function callGeminiInsight(apiKey: string, req: InsightRequest): Promise<string> {
  const userMessage = [
    `Profile: age=${req.profile.age}, weight=${req.profile.weight}kg, goal=${req.profile.goal}, conditions=${req.profile.conditions.join(", ") || "none"}`,
    `Today: sleep=${req.todayRecord.sleep_hours}h, steps=${req.todayRecord.steps}, water=${req.todayRecord.water_ml}ml, calories=${req.todayRecord.calories}kcal, weight=${req.todayRecord.weight_kg}kg, bp=${req.todayRecord.blood_pressure_sys}/${req.todayRecord.blood_pressure_dia}, hr=${req.todayRecord.heart_rate}bpm, sugar=${req.todayRecord.blood_sugar}mg/dL`,
    `Weekly averages (last 7 days):\n${formatWeeklySummary(req.weeklyRecords, req.activeMetrics)}`,
    req.aiPersonalization?.summary ? `AI Plan Summary: ${req.aiPersonalization.summary}` : ""
  ].filter(Boolean).join("\n");

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: INSIGHT_SYSTEM_PROMPT }]
      },
      contents: [
        {
          role: "user",
          parts: [{ text: userMessage }]
        }
      ],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 300
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini insight request failed (${response.status})`);
  }

  const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
  if (!text) throw new Error("Empty AI insight response.");
  return text;
}

/**
 * Generate a personalized daily insight paragraph.
 * Uses Gemini if an API key is configured, otherwise falls back to local rules.
 */
export async function generateDailyInsight(req: InsightRequest): Promise<string> {
  const apiKey = readEnv("EXPO_PUBLIC_GEMINI_API_KEY");
  if (!apiKey) {
    // Fallback to deterministic local insight.
    return getDoctorInsight(
      req.todayRecord,
      req.profile,
      req.activeMetrics,
      req.weeklyRecords,
      req.aiPersonalization
    );
  }

  try {
    return await callGeminiInsight(apiKey, req);
  } catch (_error) {
    // On any failure, gracefully fall back to local insight.
    return getDoctorInsight(
      req.todayRecord,
      req.profile,
      req.activeMetrics,
      req.weeklyRecords,
      req.aiPersonalization
    );
  }
}
