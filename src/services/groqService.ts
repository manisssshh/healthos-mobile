/**
 * groqService.ts
 *
 * Groq — grunt work only.
 * Role: Read ALL files (images + PDFs) and extract raw text.
 * Gemini only ever receives clean extracted text — never files.
 *
 * Pipeline:
 *   IMAGE: Groq vision → extract text → Gemini analysis
 *   PDF:   react-native-pdf-thumbnail → JPEG → Groq vision → extract text → Gemini analysis
 *   Daily insight: Groq only (no Gemini quota used)
 *
 * Free tier: 14,400 req/day, 30 RPM
 * Model: llama-4-scout-17b-16e-instruct (multimodal, fast)
 */

import * as FileSystem from "expo-file-system";
import { RateLimitError, parseRetryDelay } from "./rateLimitError";

// ─── Gemini PDF text extractor (called from groqService to avoid circular deps)

const PDF_TEXT_EXTRACT_PROMPT = `Extract ALL visible text from this medical PDF exactly as it appears.
Include every lab value, unit, reference range, date, patient detail, doctor note, and test name.
Return plain structured text only. No analysis, no interpretation.`;

export async function extractTextFromPdfViaGemini(
  geminiApiKey: string,
  localUri: string,
  fileName: string
): Promise<string> {
  // Step 1: upload PDF to Gemini Files API
  const fileInfo = await FileSystem.getInfoAsync(localUri, { size: true });
  if (!fileInfo.exists) return "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fileSize: number = (fileInfo as any).size ?? 0;

  const startRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiApiKey}`,
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
  if (!startRes.ok) return "";
  const uploadUrl = startRes.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) return "";

  const uploadResult = await FileSystem.uploadAsync(uploadUrl, localUri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      "Content-Length": String(fileSize),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
  });
  if (uploadResult.status < 200 || uploadResult.status >= 300) return "";

  const uploadData = JSON.parse(uploadResult.body) as { file?: { uri?: string } };
  const geminiFileUri = uploadData?.file?.uri;
  if (!geminiFileUri) return "";

  // Step 2: ask Gemini to extract raw text only (1 cheap call, no analysis)
  const extractRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { fileData: { mimeType: "application/pdf", fileUri: geminiFileUri } },
            { text: PDF_TEXT_EXTRACT_PROMPT },
          ],
        }],
        generationConfig: { temperature: 0.0, maxOutputTokens: 8192 },
      }),
    }
  );
  if (!extractRes.ok) return "";

  const extractData = await extractRes.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return extractData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

export function getGroqApiKey(): string {
  return (process.env.EXPO_PUBLIC_GROQ_API_KEY ?? "").trim();
}

export type GroqMessage = {
  role: "system" | "user";
  content: string | Array<Record<string, unknown>>;
};

// ─── Generic Groq call (JSON response) ───────────────────────────────────────

export async function callGroq(
  messages: GroqMessage[],
  maxTokens = 4096
): Promise<string> {
  const apiKey = getGroqApiKey();
  if (!apiKey) throw new Error("No Groq API key configured.");

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_VISION_MODEL,
      messages,
      temperature: 0.1,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    if (response.status === 429) throw new RateLimitError(parseRetryDelay(errText));
    throw new Error(`Groq request failed (${response.status}): ${errText.slice(0, 200)}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data?.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new Error("Empty Groq response.");
  return text;
}

// ─── Plain text Groq call (no JSON format — for insights/prose) ──────────────

export async function callGroqText(
  messages: GroqMessage[],
  maxTokens = 300
): Promise<string> {
  const apiKey = getGroqApiKey();
  if (!apiKey) throw new Error("No Groq API key configured.");

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_VISION_MODEL,
      messages,
      temperature: 0.4,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    if (response.status === 429) throw new RateLimitError(parseRetryDelay(errText));
    throw new Error(`Groq request failed (${response.status}): ${errText.slice(0, 200)}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data?.choices?.[0]?.message?.content?.trim() ?? "";
}

// ─── Image part builder ───────────────────────────────────────────────────────

export function buildImagePart(base64: string, mediaType: string): Record<string, unknown> {
  return {
    type: "image_url",
    image_url: { url: `data:${mediaType};base64,${base64}` },
  };
}

// ─── PDF → JPEG converter ─────────────────────────────────────────────────────

/**
 * Converts page 1 of a PDF to a JPEG using react-native-pdf-thumbnail,
 * then returns it as base64. Falls back gracefully if the native module
 * is not available (e.g. in Expo Go).
 */
export async function convertPdfToBase64Image(localUri: string): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PdfThumbnail = require("react-native-pdf-thumbnail").default as {
      generate: (filePath: string, page: number) => Promise<{ uri: string }>;
    };
    const { uri } = await PdfThumbnail.generate(localUri, 0);
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return base64 || null;
  } catch {
    return null;
  }
}

// ─── Core function: Extract medical text from images using Groq vision ────────

const EXTRACTION_PROMPT = `You are a medical document reader.
Extract ALL visible text and data from this medical report image exactly as shown.
Include: patient details, all lab values with units and reference ranges,
all medications with dosages and instructions, doctor's name, date, diagnosis,
any handwritten notes, test names, and result values.
Return as plain structured text preserving all numbers exactly. No analysis, no interpretation — just extract what you see.`;

export async function extractMedicalTextFromImages(
  imageAttachments: Array<{ base64: string; mediaType: string; name: string }>
): Promise<string> {
  const groqKey = getGroqApiKey();
  if (!groqKey || !imageAttachments.length) return "";

  const contentParts: Array<Record<string, unknown>> = [
    { type: "text", text: "Extract all medical data from the following report image(s):" },
  ];

  for (const att of imageAttachments) {
    // PDFs arrive here already converted to base64 JPEG via convertPdfToBase64Image
    const mediaType = att.mediaType === "application/pdf" ? "image/jpeg" : att.mediaType;
    contentParts.push(buildImagePart(att.base64, mediaType));
    contentParts.push({ type: "text", text: `(File: ${att.name})` });
  }

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${groqKey}`,
    },
    body: JSON.stringify({
      model: GROQ_VISION_MODEL,
      messages: [
        { role: "system", content: EXTRACTION_PROMPT },
        { role: "user", content: contentParts },
      ],
      temperature: 0.1,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    if (response.status === 429) throw new RateLimitError(parseRetryDelay(errText));
    throw new Error(`Groq extraction failed (${response.status})`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data?.choices?.[0]?.message?.content?.trim() ?? "";
}
