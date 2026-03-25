// Future-ready structure placeholders (not implemented in V1).

export type ExternalHealthProvider = "google_fit" | "apple_healthkit";

export type IntegrationStatus = "not_connected" | "connected";

export type FutureIntegrationState = {
  provider: ExternalHealthProvider;
  status: IntegrationStatus;
};

export async function syncFromExternalProvider(): Promise<void> {
  // TODO: Implement Google Fit / Apple HealthKit sync in a future version.
}

export async function generateAiInsight(): Promise<string> {
  // TODO: Implement OpenAI-powered insight generation in a future version.
  return "";
}

export async function scheduleDailyReminder(): Promise<void> {
  // TODO: Implement local notification scheduling in a future version.
}
