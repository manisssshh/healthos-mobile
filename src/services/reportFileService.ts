import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";

export type StoredReportFile = {
  fileUrl: string;
  fileName: string;
};

export type ReportFileError =
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_FORMAT"
  | "STORAGE_UNAVAILABLE"
  | "COPY_FAILED";

export class ReportFileException extends Error {
  constructor(
    public readonly code: ReportFileError,
    message: string
  ) {
    super(message);
    this.name = "ReportFileException";
  }
}

const REPORTS_DIRECTORY = `${FileSystem.documentDirectory}health-reports/`;

/** Max allowed file size: 20 MB (Gemini Files API limit) */
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

/** Supported file types shown in the picker */
const SUPPORTED_MIME_TYPES = ["application/pdf", "image/*"];

async function ensureReportsDirectory(): Promise<void> {
  if (!FileSystem.documentDirectory) {
    throw new ReportFileException(
      "STORAGE_UNAVAILABLE",
      "Local storage directory is not available on this device."
    );
  }
  const dirInfo = await FileSystem.getInfoAsync(REPORTS_DIRECTORY);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(REPORTS_DIRECTORY, { intermediates: true });
  }
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * Validates that the chosen file has a supported extension.
 * Catches cases where the OS allows a file through despite the MIME filter.
 */
function validateFileExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return (
    lower.endsWith(".pdf") ||
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".heic") ||
    lower.endsWith(".heif")
  );
}

/**
 * Opens the system document picker, validates the selected file, copies it
 * to persistent app storage, and returns the stored file reference.
 *
 * Throws a `ReportFileException` with a typed error code on failure.
 * Returns `null` if the user cancels the picker.
 */
export async function pickAndStoreReportFile(): Promise<StoredReportFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: SUPPORTED_MIME_TYPES,
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets?.length) {
    return null;
  }

  const asset = result.assets[0];
  if (!asset.uri || !asset.name) {
    return null;
  }

  // Validate file extension
  if (!validateFileExtension(asset.name)) {
    throw new ReportFileException(
      "UNSUPPORTED_FORMAT",
      `Unsupported file type: ${asset.name}. Please upload a PDF or image.`
    );
  }

  // Validate file size (asset.size is available on most platforms)
  if (asset.size !== undefined && asset.size !== null && asset.size > MAX_FILE_SIZE_BYTES) {
    const sizeMB = (asset.size / (1024 * 1024)).toFixed(1);
    throw new ReportFileException(
      "FILE_TOO_LARGE",
      `File is ${sizeMB} MB. Please upload a file smaller than 20 MB.`
    );
  }

  await ensureReportsDirectory();

  const safeName = sanitizeFileName(asset.name);
  const targetPath = `${REPORTS_DIRECTORY}${Date.now()}_${safeName}`;

  try {
    await FileSystem.copyAsync({ from: asset.uri, to: targetPath });
  } catch {
    throw new ReportFileException(
      "COPY_FAILED",
      "Could not save the file to local storage. Please try again."
    );
  }

  return {
    fileUrl: targetPath,
    fileName: safeName,
  };
}

/**
 * Deletes a stored report file from device storage.
 * Silently ignores errors if the file is already gone.
 */
export async function deleteStoredReportFile(fileUrl: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(fileUrl);
    if (info.exists) {
      await FileSystem.deleteAsync(fileUrl, { idempotent: true });
    }
  } catch {
    // Non-fatal — the record will still be removed from the database.
  }
}
