/**
 * mealReminderService.ts
 * Schedules daily per-meal push notifications based on the AI meal plan.
 * Each notification fires at the meal's specified time and tells the user what to eat.
 */
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { DailyMealTemplate, MealItem } from "../types/health";

const MEAL_CHANNEL_ID = "healthos-meal-reminders";
const MEAL_NOTIF_PREFIX = "healthos-meal-";

/** Parse "8:00 AM" or "13:30" into { hour, minute } */
function parseTime(timeStr: string): { hour: number; minute: number } | null {
  const amPm = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!amPm) return null;

  let hour = parseInt(amPm[1], 10);
  const minute = parseInt(amPm[2], 10);
  const period = (amPm[3] || "").toUpperCase();

  if (period === "PM" && hour !== 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function mealNotifId(index: number): string {
  return `${MEAL_NOTIF_PREFIX}${index}`;
}

/**
 * Cancel all previously scheduled meal reminders.
 */
export async function cancelMealReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const mealNotifs = scheduled.filter((n) => n.identifier.startsWith(MEAL_NOTIF_PREFIX));
  await Promise.all(
    mealNotifs.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {}))
  );
}

/**
 * Schedule daily meal notifications from a meal template.
 * Each meal fires at its specified time every day, telling the user exactly what to eat.
 */
export async function scheduleMealReminders(template: DailyMealTemplate): Promise<number> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(MEAL_CHANNEL_ID, {
      name: "Meal Plan Reminders",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 100, 200]
    });
  }

  await cancelMealReminders();

  let scheduled = 0;
  for (let i = 0; i < template.meals.length; i++) {
    const meal = template.meals[i];
    const time = parseTime(meal.time);
    if (!time) continue;

    const body = buildMealNotificationBody(meal);

    await Notifications.scheduleNotificationAsync({
      identifier: mealNotifId(i),
      content: {
        title: `🍽️ Time for ${meal.name}`,
        body,
        data: { screen: "log", mealIndex: i }
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: time.hour,
        minute: time.minute
      }
    });
    scheduled++;
  }

  return scheduled;
}

function buildMealNotificationBody(meal: MealItem): string {
  let body = `${meal.name} — ~${meal.calories} kcal`;
  if (meal.notes) {
    body += `\n${meal.notes}`;
  }
  return body;
}

/**
 * Get the meal template that best matches today (regular day by default).
 * Picks "Workout Day" template if today is a workout day, else "Regular Day".
 */
export function getTodayMealTemplate(
  templates: DailyMealTemplate[]
): DailyMealTemplate | null {
  if (!templates.length) return null;
  // Prefer "Regular Day" template, fall back to first template
  return (
    templates.find((t) => t.label.toLowerCase().includes("regular")) ??
    templates[0]
  );
}

/**
 * Enable meal reminders by scheduling from the AI meal plan.
 * Returns the number of notifications scheduled.
 */
export async function enableMealReminders(templates: DailyMealTemplate[]): Promise<number> {
  const template = getTodayMealTemplate(templates);
  if (!template) return 0;
  return scheduleMealReminders(template);
}
