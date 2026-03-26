/**
 * supplementReminderService.ts
 *
 * Schedules daily push notifications for each supplement at the correct time.
 * One notification per supplement per timing slot (morning/afternoon/evening/night).
 */
import * as Notifications from "expo-notifications";
import type { Supplement, SupplementTiming } from "../types/health";

// ─── Timing → Hour mapping ───────────────────────────────────────────────────

const TIMING_HOURS: Record<SupplementTiming, number> = {
  morning:   8,
  afternoon: 13,
  evening:   18,
  night:     21,
};

const TIMING_LABELS: Record<SupplementTiming, string> = {
  morning:   "Morning",
  afternoon: "Afternoon",
  evening:   "Evening",
  night:     "Night",
};

// ─── Identifier helpers ───────────────────────────────────────────────────────

function notificationId(supplementId: number, timing: SupplementTiming): string {
  return `supplement_${supplementId}_${timing}`;
}

// ─── Permission guard ─────────────────────────────────────────────────────────

async function ensurePermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === "granted") return true;
  const { status: requested } = await Notifications.requestPermissionsAsync();
  return requested === "granted";
}

// ─── Schedule one supplement reminder ────────────────────────────────────────

async function scheduleSupplementReminder(
  supplement: Supplement,
  timing: SupplementTiming
): Promise<void> {
  const identifier = notificationId(supplement.id, timing);
  const hour = TIMING_HOURS[timing];

  // Cancel any existing notification for this slot first
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});

  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: `${TIMING_LABELS[timing]} Supplement`,
      body: `Take ${supplement.name} — ${supplement.dosage}${supplement.notes ? ` (${supplement.notes})` : ""}`,
      sound: true,
      data: { supplementId: supplement.id, timing },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute: 0,
    },
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Cancels all existing supplement reminders and reschedules for the given list.
 * Call this whenever supplements are updated.
 */
export async function rescheduleAllSupplementReminders(supplements: Supplement[]): Promise<void> {
  const hasPermission = await ensurePermission();
  if (!hasPermission) return;

  // Cancel all existing supplement reminders
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const supplementNotifs = scheduled.filter((n) =>
    typeof n.identifier === "string" && n.identifier.startsWith("supplement_")
  );
  await Promise.all(
    supplementNotifs.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );

  // Schedule for active supplements only
  const active = supplements.filter((s) => s.is_active);
  for (const supplement of active) {
    for (const timing of supplement.timing) {
      await scheduleSupplementReminder(supplement, timing).catch((err) => {
        console.warn(`[HealthOS] Failed to schedule ${supplement.name} ${timing}:`, err);
      });
    }
  }
}

/**
 * Cancel all reminders for a single supplement (e.g. when deleted).
 */
export async function cancelSupplementReminders(supplementId: number): Promise<void> {
  const timings: SupplementTiming[] = ["morning", "afternoon", "evening", "night"];
  await Promise.all(
    timings.map((t) =>
      Notifications.cancelScheduledNotificationAsync(notificationId(supplementId, t)).catch(() => {})
    )
  );
}
