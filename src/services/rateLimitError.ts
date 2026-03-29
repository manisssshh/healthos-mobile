/**
 * rateLimitError.ts
 * Shared rate limit error type used by AI services.
 * Extracted to avoid circular imports between aiPersonalizationService ↔ groqService.
 */

export class RateLimitError extends Error {
  retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    const mins = Math.ceil(retryAfterSeconds / 60);
    const label = retryAfterSeconds < 60
      ? `${retryAfterSeconds} seconds`
      : `${mins} minute${mins > 1 ? "s" : ""}`;
    super(`RATE_LIMIT:${retryAfterSeconds}`);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
    this.message = `Gemini API rate limit reached. Please retry in ${label}.\n\nFree tier resets every minute (15 req/min) and daily at midnight PT.`;
  }
}

export function parseRetryDelay(body: string): number {
  try {
    const json = JSON.parse(body) as {
      error?: { details?: Array<{ retryDelay?: string }> };
    };
    const delay = json?.error?.details?.find((d) => d.retryDelay)?.retryDelay;
    if (delay) return parseInt(delay.replace("s", ""), 10) || 60;
  } catch { /* ignore */ }
  return 60;
}
