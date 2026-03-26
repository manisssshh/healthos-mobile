/**
 * notificationService.ts
 * Core push notification setup and health reminder scheduling.
 * Meal-specific reminders are in mealReminderService.ts
 * Weekly report notifications are in weeklyReportService.ts
 */
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// Configure foreground notification display
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false
  })
});

const CHANNEL_ID = "healthos-reminders";
const WATER_NOTIFICATION_ID = "healthos-water-reminder";
const LOG_NOTIFICATION_ID = "healthos-log-reminder";
const SLEEP_NOTIFICATION_ID = "healthos-sleep-reminder";

export type NotificationPermissionStatus = "granted" | "denied" | "undetermined";

export async function requestNotificationPermissions(): Promise<NotificationPermissionStatus> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "HealthOS Reminders",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: "default"
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === "granted") return "granted";

  const { status } = await Notifications.requestPermissionsAsync();
  return status as NotificationPermissionStatus;
}

/** Daily evening hydration reminder at 20:00 */
export async function scheduleWaterReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(WATER_NOTIFICATION_ID).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: WATER_NOTIFICATION_ID,
    content: {
      title: "💧 Hydration Check",
      body: "Have you hit your daily water goal? Keep it up!",
      data: { screen: "log" }
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 20,
      minute: 0
    }
  });
}

/** Daily morning metric log reminder at 08:00 */
export async function scheduleDailyLogReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(LOG_NOTIFICATION_ID).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: LOG_NOTIFICATION_ID,
    content: {
      title: "📋 Morning Check-in",
      body: "Log your weight, sleep, and steps to start your day strong.",
      data: { screen: "log" }
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 8,
      minute: 0
    }
  });
}

/** Bedtime reminder at 22:30 */
export async function scheduleSleepReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(SLEEP_NOTIFICATION_ID).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: SLEEP_NOTIFICATION_ID,
    content: {
      title: "🌙 Wind Down Time",
      body: "Aiming for your sleep target? Start your wind-down routine.",
      data: { screen: "home" }
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 22,
      minute: 30
    }
  });
}

export async function cancelAllReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Set up core daily reminders: morning log, evening water, bedtime.
 * Returns true if permissions were granted.
 */
export async function setupHealthReminders(): Promise<boolean> {
  try {
    const status = await requestNotificationPermissions();
    if (status !== "granted") return false;
    await Promise.all([
      scheduleWaterReminder(),
      scheduleDailyLogReminder(),
      scheduleSleepReminder()
    ]);
    return true;
  } catch {
    return false;
  }
}
