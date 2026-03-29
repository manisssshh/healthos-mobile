/**
 * supplementAiService.ts
 *
 * Analyzes uploaded doctor prescription PDFs/images via Gemini and extracts:
 *   - Supplements/medications with dosage and timing
 *   - Doctor's diagnosis
 *   - Doctor's recommendations
 *
 * This is intentionally separate from aiPersonalizationService — prescriptions
 * contain supplement/medication data while blood tests drive health plan metrics.
 */
import * as FileSystem from "expo-file-system";
import type { HealthReport, Supplement, SupplementInput, SupplementTiming } from "../types/health";
import type { DoctorNoteInput } from "../types/health";
import { RateLimitError, parseRetryDelay } from "./rateLimitError";
import { extractMedicalTextFromImages, convertPdfToBase64Image, getGroqApiKey, callGroq } from "./groqService";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SupplementExtractionResult = {
  supplements: SupplementInput[];
  doctorNote: DoctorNoteInput;
};

type FileAttachment = {
  name: string;
  mediaType: string;
  base64?: string;
  localUri?: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_PRESCRIPTION_FILES = 4;

const SUPPLEMENT_PROMPT = `You are a medical prescription parser. Extract all supplements, vitamins, and medications from the attached doctor's prescription or diagnosis report.

CRITICAL: Return ONLY raw JSON. No markdown. No explanation. Start with { and end with }.

JSON schema (follow exactly):
{
  "supplements": [
    {
      "name": "Supplement or medication name",
      "dosage": "e.g. 500mg, 2 tablets, 60000 IU",
      "timing": ["morning"],
      "frequency": "daily",
      "notes": "Take after meals (optional)"
    }
  ],
  "diagnosis": "Doctor's diagnosis in 1-3 sentences",
  "recommendations": "Doctor's general recommendations and lifestyle advice",
  "doctor_title": "Doctor name and date if visible, e.g. Dr. Sharma - 15 Mar 2026"
}

Rules for timing array — include one or more of: "morning", "afternoon", "evening", "night"
Rules for frequency — use one of: "daily", "twice_daily", "weekly", "as_needed"
- If dose is once daily → frequency: "daily", timing: ["morning"] or as indicated
- If dose is twice daily / BD / BID → frequency: "twice_daily", timing: ["morning", "evening"]
- If dose is weekly → frequency: "weekly"
- If SOS / as needed → frequency: "as_needed"
- notes: include any food/timing instructions from the prescription

If no supplements are found, return empty supplements array.
If diagnosis is not visible, return "See uploaded prescription for diagnosis."
If recommendations are not visible, return "Follow doctor's instructions as prescribed."`;

// ─── Env helper ───────────────────────────────────────────────────────────────

function readEnv(_name: string): string {
  // Metro statically replaces process.env.EXPO_PUBLIC_* at bundle time.
  // Dynamic bracket access (process.env[name]) does NOT work in React Native.
  return (process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? "").trim();
}

// ─── JSON Parsing ─────────────────────────────────────────────────────────────

function extractJson(raw: string): unknown {
  const text = raw.trim();
  try { return JSON.parse(text); } catch { /* continue */ }
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) { try { return JSON.parse(fence[1].trim()); } catch { /* continue */ } }
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) { try { return JSON.parse(text.slice(first, last + 1)); } catch { /* continue */ } }
  throw new Error("No valid JSON found in AI response.");
}

// ─── Media helpers ────────────────────────────────────────────────────────────

function detectMediaType(fileName: string): string | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic")) return "image/heic";
  return null;
}

async function uploadPdfToGeminiFiles(apiKey: string, localUri: string, fileName: string): Promise<string> {
  const fileInfo = await FileSystem.getInfoAsync(localUri, { size: true });
  if (!fileInfo.exists) throw new Error(`File not found: ${localUri}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fileSize: number = (fileInfo as any).size ?? 0;

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
  if (!startResponse.ok) throw new Error(`Gemini Files API init failed (${startResponse.status}).`);

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

  if (uploadResult.status < 200 || uploadResult.status >= 300)
    throw new Error(`PDF upload failed (${uploadResult.status}).`);

  const data = JSON.parse(uploadResult.body) as { file?: { uri?: string } };
  const uri = data?.file?.uri;
  if (!uri) throw new Error("No file URI from Gemini Files API.");
  return uri;
}

async function loadAttachments(reports: HealthReport[]): Promise<FileAttachment[]> {
  const attachments: FileAttachment[] = [];
  for (const report of reports.slice(0, MAX_PRESCRIPTION_FILES)) {
    const mediaType = detectMediaType(report.file_name);
    if (!mediaType) continue;
    try {
      const info = await FileSystem.getInfoAsync(report.file_url);
      if (!info.exists) continue;
      if (mediaType === "application/pdf") {
        attachments.push({ name: report.file_name, mediaType, localUri: report.file_url });
      } else {
        const base64 = await FileSystem.readAsStringAsync(report.file_url, {
          encoding: FileSystem.EncodingType.Base64,
        });
        if (base64) attachments.push({ name: report.file_name, mediaType, base64 });
      }
    } catch { /* skip unreadable */ }
  }
  return attachments;
}

// ─── Normalization ────────────────────────────────────────────────────────────

const VALID_TIMINGS: SupplementTiming[] = ["morning", "afternoon", "evening", "night"];
const VALID_FREQUENCIES: Supplement["frequency"][] = ["daily", "twice_daily", "weekly", "as_needed"];

function normalizeTiming(raw: unknown): SupplementTiming[] {
  if (!Array.isArray(raw)) return ["morning"];
  const result = raw.filter((t): t is SupplementTiming =>
    typeof t === "string" && VALID_TIMINGS.includes(t as SupplementTiming)
  );
  return result.length ? result : ["morning"];
}

function normalizeFrequency(raw: unknown): Supplement["frequency"] {
  if (typeof raw === "string" && VALID_FREQUENCIES.includes(raw as Supplement["frequency"]))
    return raw as Supplement["frequency"];
  return "daily";
}

function parseSupplements(raw: unknown): SupplementInput[] {
  if (!Array.isArray(raw)) return [];
  const results: SupplementInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const name = typeof obj.name === "string" ? obj.name.trim() : "";
    if (!name) continue;
    results.push({
      name,
      dosage: typeof obj.dosage === "string" ? obj.dosage.trim() : "",
      timing: normalizeTiming(obj.timing),
      frequency: normalizeFrequency(obj.frequency),
      notes: typeof obj.notes === "string" && obj.notes.trim() ? obj.notes.trim() : undefined,
      is_active: true,
    });
  }
  return results;
}

function buildDoctorNote(
  payload: Record<string, unknown>,
  reports: HealthReport[]
): DoctorNoteInput {
  const diagnosis = typeof payload.diagnosis === "string" && payload.diagnosis.trim()
    ? payload.diagnosis.trim()
    : "See uploaded prescription for diagnosis.";
  const recommendations = typeof payload.recommendations === "string" && payload.recommendations.trim()
    ? payload.recommendations.trim()
    : "Follow doctor's instructions as prescribed.";
  const rawTitle = typeof payload.doctor_title === "string" && payload.doctor_title.trim()
    ? payload.doctor_title.trim()
    : `Prescription — ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;

  const prescriptionReport = reports.find((r) => r.type === "prescription");

  return {
    title: rawTitle,
    diagnosis,
    recommendations,
    source_report_id: prescriptionReport?.id ?? null,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function extractSupplementsFromPrescriptions(
  reports: HealthReport[]
): Promise<SupplementExtractionResult> {
  const prescriptions = reports.filter((r) => r.type === "prescription");

  const emptyResult: SupplementExtractionResult = {
    supplements: [],
    doctorNote: {
      title: "Doctor's Prescription",
      diagnosis: "No prescription uploaded yet.",
      recommendations: "Upload your doctor's prescription to see extracted supplements.",
      source_report_id: null,
    },
  };

  if (!prescriptions.length) return emptyResult;

  const geminiKey = readEnv("EXPO_PUBLIC_GEMINI_API_KEY");
  const groqKey = getGroqApiKey();
  if (!geminiKey && !groqKey) return emptyResult;

  const attachments = await loadAttachments(prescriptions);
  if (!attachments.length) return emptyResult;

  try {
    let text: string;

    if (groqKey) {
      // ── Groq full pipeline: read files + extract supplements ──────────────
      const allAsImages: Array<{ base64: string; mediaType: string; name: string }> = [];
      for (const att of attachments) {
        if (att.base64) {
          allAsImages.push({ base64: att.base64, mediaType: att.mediaType, name: att.name });
        }
      }

      const extractedText = allAsImages.length > 0
        ? await extractMedicalTextFromImages(allAsImages)
        : "";

      const analysisPrompt = [
        `Extract all supplements and medications from this prescription. Date: ${new Date().toLocaleDateString("en-IN")}`,
        "--- EXTRACTED PRESCRIPTION CONTENT ---",
        extractedText || "No content could be extracted.",
        "--- END ---",
      ].join("\n\n");

      const messages = [
        { role: "system" as const, content: SUPPLEMENT_PROMPT },
        { role: "user" as const, content: analysisPrompt },
      ];
      text = await callGroq(messages, 4096);
      if (!text) throw new Error("Empty Groq response.");

    } else if (geminiKey) {
      // ── Gemini fallback: only when no Groq key configured ─────────────────
      const parts: Array<Record<string, unknown>> = [
        { text: `Extract all supplements and medications from the attached doctor's prescription. Date: ${new Date().toLocaleDateString("en-IN")}` },
      ];
      for (const att of attachments) {
        if (att.mediaType === "application/pdf" && att.localUri) {
          try {
            const geminiUri = await uploadPdfToGeminiFiles(geminiKey, att.localUri, att.name);
            parts.push({ fileData: { mimeType: "application/pdf", fileUri: geminiUri } });
          } catch (err) {
            console.warn("[HealthOS] Supplement PDF upload skipped:", err);
          }
        } else if (att.base64) {
          parts.push({ inlineData: { mimeType: att.mediaType, data: att.base64 } });
        }
      }
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SUPPLEMENT_PROMPT }] },
            contents: [{ role: "user", parts }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 4096, responseMimeType: "application/json" },
          }),
        }
      );
      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        if (response.status === 429) throw new RateLimitError(parseRetryDelay(errText));
        throw new Error(`Gemini failed (${response.status}): ${errText.slice(0, 200)}`);
      }
      const data = await response.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (!text) throw new Error("Empty Gemini response.");
    } else {
      return emptyResult;
    }

    const parsed = extractJson(text) as Record<string, unknown>;
    return {
      supplements: parseSupplements(parsed.supplements),
      doctorNote: buildDoctorNote(parsed, prescriptions),
    };
  } catch (error) {
    if (error instanceof RateLimitError) throw error; // bubble up for Alert popup
    console.error("[HealthOS] Supplement extraction failed:", error);
    return emptyResult;
  }
}
