/**
 * notificationService.ts
 * Handles push notification permissions and daily health reminder scheduling.
 * Uses expo-notifications with local triggers (no server required).
 */
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// Configure how notifications look when the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false
  })
});

const CHANNEL_ID = "healthos-reminders";
const WATER_NOTIFICATION_ID = "healthos-water-reminder";
const LOG_NOTIFICATION_ID = "healthos-log-reminder";

export type NotificationPermissionStatus = "granted" | "denied" | "undetermined";

/**
 * Request push notification permissions from the OS.
 * Returns "granted" | "denied" | "undetermined".
 */
export async function requestNotificationPermissions(): Promise<NotificationPermissionStatus> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "HealthOS Reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250]
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === "granted") {
    return "granted";
  }

  const { status } = await Notifications.requestPermissionsAsync();
  return status as NotificationPermissionStatus;
}

/**
 * Schedule a daily evening reminder to log water if not already met.
 * Fires every day at 20:00 local time.
 */
export async function scheduleWaterReminder(): Promise<void> {
  // Cancel any existing water reminder first to avoid duplicates.
  await Notifications.cancelScheduledNotificationAsync(WATER_NOTIFICATION_ID).catch(() => {});

  await Notifications.scheduleNotificationAsync({
    identifier: WATER_NOTIFICATION_ID,
    content: {
      title: "💧 Stay Hydrated!",
      body: "Have you hit your daily water goal? Log your intake now.",
      data: { screen: "log" }
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 20,
      minute: 0
    }
  });
}

/**
 * Schedule a daily morning reminder to log daily metrics.
 * Fires every day at 09:00 local time.
 */
export async function scheduleDailyLogReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(LOG_NOTIFICATION_ID).catch(() => {});

  await Notifications.scheduleNotificationAsync({
    identifier: LOG_NOTIFICATION_ID,
    content: {
      title: "📋 Morning Health Check",
      body: "Start your day right — log your weight, sleep, and steps.",
      data: { screen: "log" }
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 9,
      minute: 0
    }
  });
}

/**
 * Cancel all HealthOS scheduled notifications.
 */
export async function cancelAllReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Set up both reminders after permissions are granted.
 */
export async function setupHealthReminders(): Promise<boolean> {
  try {
    const status = await requestNotificationPermissions();
    if (status !== "granted") {
      return false;
    }
    await Promise.all([scheduleWaterReminder(), scheduleDailyLogReminder()]);
    return true;
  } catch (_error) {
    return false;
  }
}
