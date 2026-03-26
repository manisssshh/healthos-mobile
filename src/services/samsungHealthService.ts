/**
 * samsungHealthService.ts
 * Samsung Galaxy Watch 4 integration via Android Health Connect.
 *
 * Galaxy Watch 4 syncs its data to Samsung Health, which feeds Android Health Connect.
 * This service reads from Health Connect using react-native-health-connect.
 *
 * Supported data points from Galaxy Watch 4:
 *   - Steps              (StepsRecord)
 *   - Heart Rate         (HeartRateRecord)
 *   - Sleep              (SleepSessionRecord)
 *   - Calories Burned    (TotalCaloriesBurnedRecord)
 *   - Blood Oxygen SpO2  (OxygenSaturationRecord)
 *   - Resting Heart Rate (RestingHeartRateRecord)
 *   - Body Fat           (BodyFatRecord)
 *   - Skin Temperature   (SkinTemperatureRecord) — Watch 5+ only, Watch 4 has limited support
 *   - Weight             (WeightRecord)
 *   - Exercise Session   (ExerciseSessionRecord)
 */
import { NativeModules, TurboModuleRegistry, Platform } from "react-native";
import type { WatchData } from "../types/health";

// Health Connect SDK types (from react-native-health-connect)
type HealthConnectModule = {
  initialize: () => Promise<boolean>;
  getSdkStatus: (providerPackageName: string) => Promise<number>;
  requestPermission: (permissions: HealthPermission[]) => Promise<GrantedPermission[]>;
  readRecords: <T>(recordType: string, options: ReadRecordsOptions) => Promise<{ records: T[] }>;
  getGrantedPermissions: () => Promise<GrantedPermission[]>;
};

type HealthPermission = {
  accessType: "read" | "write";
  recordType: string;
};

type GrantedPermission = {
  accessType: string;
  recordType: string;
};

type ReadRecordsOptions = {
  timeRangeFilter: {
    operator: "between";
    startTime: string;
    endTime: string;
  };
};

// Samsung Health Provider package name for Health Connect
const SAMSUNG_HEALTH_PACKAGE = "com.samsung.android.wear.shealth";

let _sdk: HealthConnectModule | null = null;

function getHealthConnect(): HealthConnectModule | null {
  if (Platform.OS !== "android") return null;
  // TurboModuleRegistry.get() (NOT getEnforcing) returns null when the native module
  // is not registered in the binary — safe in both bridge and bridgeless New Architecture.
  // This is the root-cause fix: react-native-health-connect internally calls
  // TurboModuleRegistry.getEnforcing('HealthConnect') when required, which throws
  // synchronously and escapes any try/catch. We prevent the require() entirely
  // when the native module isn't compiled in (e.g. Expo Go).
  try {
    const nativeAvailable =
      TurboModuleRegistry.get("HealthConnect") !== null ||
      Boolean(NativeModules.HealthConnect);
    if (!nativeAvailable) return null;
  } catch {
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const hc = require("react-native-health-connect") as { default?: HealthConnectModule } & HealthConnectModule;
    return hc.default ?? (hc as HealthConnectModule);
  } catch {
    return null;
  }
}

// Galaxy Watch 4 data permissions we request
const WATCH_PERMISSIONS: HealthPermission[] = [
  { accessType: "read", recordType: "Steps" },
  { accessType: "read", recordType: "HeartRate" },
  { accessType: "read", recordType: "SleepSession" },
  { accessType: "read", recordType: "TotalCaloriesBurned" },
  { accessType: "read", recordType: "OxygenSaturation" },
  { accessType: "read", recordType: "RestingHeartRate" },
  { accessType: "read", recordType: "BodyFat" },
  { accessType: "read", recordType: "Weight" }
];

/**
 * Check whether Health Connect is available on this device.
 * Requires Android 14+ or Health Connect app installed (Android 9+).
 */
export async function isHealthConnectAvailable(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  const hc = getHealthConnect();
  if (!hc) return false;
  try {
    const initialized = await hc.initialize();
    return initialized;
  } catch {
    return false;
  }
}

/**
 * Request all permissions needed to read Galaxy Watch 4 data.
 * Returns true if at least the core permissions (steps, heart rate) were granted.
 */
export async function requestWatchPermissions(): Promise<boolean> {
  const hc = getHealthConnect();
  if (!hc) return false;
  try {
    const granted = await hc.requestPermission(WATCH_PERMISSIONS);
    return granted.some(
      (p) => p.recordType === "Steps" && p.accessType === "read"
    );
  } catch {
    return false;
  }
}

/**
 * Read today's health data from Health Connect (sourced from Galaxy Watch 4 via Samsung Health).
 */
export async function readTodayWatchData(): Promise<WatchData | null> {
  const hc = getHealthConnect();
  if (!hc) return null;

  const available = await isHealthConnectAvailable();
  if (!available) return null;

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

  const timeRange: ReadRecordsOptions = {
    timeRangeFilter: {
      operator: "between",
      startTime: startOfDay.toISOString(),
      endTime: now.toISOString()
    }
  };

  const result: WatchData = {
    is_connected: true,
    last_synced: now.toISOString()
  };

  try {
    // Steps
    const stepsResult = await hc.readRecords<{ count: number }>("Steps", timeRange);
    if (stepsResult.records.length > 0) {
      result.steps = stepsResult.records.reduce((sum, r) => sum + r.count, 0);
    }
  } catch { /* permission not granted or unavailable */ }

  try {
    // Heart Rate (latest reading)
    const hrResult = await hc.readRecords<{
      samples: Array<{ beatsPerMinute: number }>;
    }>("HeartRate", timeRange);
    if (hrResult.records.length > 0) {
      const allSamples = hrResult.records.flatMap((r) => r.samples);
      if (allSamples.length > 0) {
        result.heart_rate = Math.round(
          allSamples.reduce((sum, s) => sum + s.beatsPerMinute, 0) / allSamples.length
        );
      }
    }
  } catch { /* skip */ }

  try {
    // Resting Heart Rate
    const rhrResult = await hc.readRecords<{ beatsPerMinute: number }>("RestingHeartRate", timeRange);
    if (rhrResult.records.length > 0) {
      result.resting_hr = rhrResult.records[rhrResult.records.length - 1].beatsPerMinute;
    }
  } catch { /* skip */ }

  try {
    // Sleep (last night — look back 12h from midnight)
    const sleepStart = new Date(startOfDay.getTime() - 12 * 3600 * 1000);
    const sleepRange: ReadRecordsOptions = {
      timeRangeFilter: {
        operator: "between",
        startTime: sleepStart.toISOString(),
        endTime: startOfDay.toISOString()
      }
    };
    const sleepResult = await hc.readRecords<{
      startTime: string;
      endTime: string;
    }>("SleepSession", sleepRange);
    if (sleepResult.records.length > 0) {
      const totalMs = sleepResult.records.reduce((sum, r) => {
        return sum + (new Date(r.endTime).getTime() - new Date(r.startTime).getTime());
      }, 0);
      result.sleep_hours = parseFloat((totalMs / 3_600_000).toFixed(1));
    }
  } catch { /* skip */ }

  try {
    // Calories burned
    const calResult = await hc.readRecords<{ energy: { inKilocalories: number } }>(
      "TotalCaloriesBurned", timeRange
    );
    if (calResult.records.length > 0) {
      result.calories_burned = Math.round(
        calResult.records.reduce((sum, r) => sum + r.energy.inKilocalories, 0)
      );
    }
  } catch { /* skip */ }

  try {
    // SpO2 / Blood Oxygen (latest)
    const spo2Result = await hc.readRecords<{
      percentage: { value: number };
    }>("OxygenSaturation", timeRange);
    if (spo2Result.records.length > 0) {
      const latest = spo2Result.records[spo2Result.records.length - 1];
      result.spo2 = latest.percentage.value;
    }
  } catch { /* skip */ }

  try {
    // Body Fat (latest)
    const bfResult = await hc.readRecords<{ percentage: { value: number } }>("BodyFat", timeRange);
    if (bfResult.records.length > 0) {
      result.body_fat_pct = bfResult.records[bfResult.records.length - 1].percentage.value;
    }
  } catch { /* skip */ }

  return result;
}

/**
 * Perform a full sync: request permissions → read today's data → return it.
 */
export async function syncGalaxyWatch4(): Promise<WatchData | null> {
  if (Platform.OS !== "android") {
    return null;
  }

  const available = await isHealthConnectAvailable();
  if (!available) return null;

  const permissionsGranted = await requestWatchPermissions();
  if (!permissionsGranted) return null;

  return readTodayWatchData();
}

/**
 * Human-readable labels for the data Galaxy Watch 4 provides.
 */
export const WATCH_DATA_LABELS: Array<{ key: keyof WatchData; label: string; unit: string; icon: string }> = [
  { key: "steps",          label: "Steps",          unit: "",      icon: "shoe-print" },
  { key: "heart_rate",     label: "Heart Rate",     unit: "bpm",   icon: "heart-pulse" },
  { key: "resting_hr",     label: "Resting HR",     unit: "bpm",   icon: "heart-half-full" },
  { key: "sleep_hours",    label: "Sleep",          unit: "hrs",   icon: "power-sleep" },
  { key: "calories_burned",label: "Calories Burned",unit: "kcal",  icon: "fire" },
  { key: "spo2",           label: "Blood Oxygen",   unit: "%",     icon: "water-circle" },
  { key: "stress_level",   label: "Stress Level",   unit: "/100",  icon: "brain" },
  { key: "body_fat_pct",   label: "Body Fat",       unit: "%",     icon: "scale-bathroom" },
  { key: "skin_temp_c",    label: "Skin Temp",      unit: "°C",    icon: "thermometer" }
];
