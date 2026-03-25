/**
 * pedometerService.ts
 * Reads step count from device sensors using expo-sensors Pedometer.
 * Falls back gracefully if unavailable (Android/simulator).
 */
import { Pedometer } from "expo-sensors";

export type PedometerResult = {
  steps: number;
  available: boolean;
};

/**
 * Read the step count from midnight today up to now.
 * Returns { steps, available }. If the sensor is unavailable, steps = 0.
 */
export async function getTodaySteps(): Promise<PedometerResult> {
  try {
    const isAvailable = await Pedometer.isAvailableAsync();
    if (!isAvailable) {
      return { steps: 0, available: false };
    }

    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    const result = await Pedometer.getStepCountAsync(midnight, now);
    return { steps: result.steps ?? 0, available: true };
  } catch (_error) {
    return { steps: 0, available: false };
  }
}

/**
 * Subscribe to real-time step count updates.
 * Returns the unsubscribe function. Call it when unmounting.
 */
export function subscribeToSteps(onUpdate: (steps: number) => void): () => void {
  const subscription = Pedometer.watchStepCount((result) => {
    onUpdate(result.steps ?? 0);
  });

  return () => subscription.remove();
}
