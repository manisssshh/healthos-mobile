/**
 * weeklyReportService.ts
 * Generates a downloadable weekly health progress PDF and schedules a weekly calendar reminder.
 */
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as Calendar from "expo-calendar";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import type { DailyHealthRecord, AiPersonalization, UserProfile, MetricTargets } from "../types/health";
import { getZoneColor, getPerformanceZone } from "../types/health";
import { formatReadableDate } from "../utils/dateUtils";
import { calculateDynamicHealthScore } from "../utils/scoreCalculator";

const WEEKLY_REPORT_NOTIF_ID = "healthos-weekly-report";
const WEEKLY_REPORT_CALENDAR_TITLE = "HealthOS Weekly Report";

// ─── HTML Report Template ─────────────────────────────────────────────────────

function metricRow(
  label: string,
  avgValue: string,
  goal: string,
  unit: string,
  color: string,
  pct: number
): string {
  return `
    <tr>
      <td style="padding:10px 8px;font-size:13px;color:#E0E0F0;">${label}</td>
      <td style="padding:10px 8px;text-align:center;font-size:14px;font-weight:700;color:${color};">${avgValue} ${unit}</td>
      <td style="padding:10px 8px;text-align:center;font-size:12px;color:#7A7A95;">${goal} ${unit}</td>
      <td style="padding:10px 8px;min-width:100px;">
        <div style="background:#1A1A2A;border-radius:4px;height:6px;overflow:hidden;">
          <div style="width:${Math.min(100, pct)}%;background:${color};height:100%;border-radius:4px;"></div>
        </div>
        <span style="font-size:10px;color:#7A7A95;">${Math.min(100, pct)}%</span>
      </td>
    </tr>
  `;
}

function scoreBar(score: number): string {
  const zone = getPerformanceZone(score);
  const color = getZoneColor(zone);
  const label = zone === "high" ? "Peak" : zone === "medium" ? "Moderate" : "Low";
  return `
    <div style="text-align:center;padding:20px 0;">
      <div style="font-size:72px;font-weight:900;color:${color};line-height:1;">${score}</div>
      <div style="font-size:13px;color:#7A7A95;letter-spacing:3px;margin-top:6px;">WEEKLY AVG HEALTH SCORE</div>
      <div style="display:inline-block;background:${color}22;border:1px solid ${color}55;border-radius:20px;padding:4px 16px;margin-top:8px;">
        <span style="color:${color};font-size:12px;font-weight:700;">${label} Performance</span>
      </div>
    </div>
  `;
}

export function buildWeeklyReportHtml(
  records: DailyHealthRecord[],
  profile: UserProfile,
  aiPlan: AiPersonalization | null,
  weekLabel: string
): string {
  if (!records.length) return "<html><body><p>No data available.</p></body></html>";

  // Calculate averages
  const avg = (fn: (r: DailyHealthRecord) => number): number => {
    const vals = records.map(fn).filter((v) => v > 0);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  };

  const avgSteps = avg((r) => r.steps);
  const avgSleep = parseFloat((records.map((r) => r.sleep_hours).reduce((a, b) => a + b, 0) / records.length).toFixed(1));
  const avgWater = avg((r) => r.water_ml);
  const avgHr = avg((r) => r.heart_rate);
  const avgSugar = avg((r) => r.blood_sugar);
  const avgWeight = parseFloat((records.filter((r) => r.weight_kg > 0).map((r) => r.weight_kg).reduce((a, b) => a + b, 0) / (records.filter((r) => r.weight_kg > 0).length || 1)).toFixed(1));

  // Compute average score
  const activeMetrics = aiPlan?.active_metrics ?? ["sleep", "steps", "water"];
  const targets = aiPlan?.metric_targets ?? {};
  const scores = records.map((r) =>
    calculateDynamicHealthScore(r, profile, activeMetrics, targets).score
  );
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  const stepGoal = targets.steps ?? 10000;
  const waterGoal = targets.water ?? 3000;
  const sleepGoal = targets.sleep ?? 8;

  const doctorFocusHtml = aiPlan?.doctor_focus?.slice(0, 3).map(
    (f) => `<li style="margin:6px 0;color:#E0E0F0;font-size:13px;line-height:1.6;">${f}</li>`
  ).join("") ?? "";

  const tipsHtml = aiPlan?.health_tips?.slice(0, 4).map(
    (t, i) => `<li style="margin:8px 0;color:#E0E0F0;font-size:13px;line-height:1.6;"><strong style="color:#4F7BFF;">${i + 1}.</strong> ${t}</li>`
  ).join("") ?? "";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #060608; font-family: -apple-system, 'Helvetica Neue', sans-serif; color: #FFFFFF; padding: 24px; }
    .header { padding: 24px 0 16px; border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 24px; }
    .badge { display: inline-block; background: rgba(79,123,255,0.2); border: 1px solid rgba(79,123,255,0.4); border-radius: 20px; padding: 4px 14px; font-size: 11px; color: #4F7BFF; letter-spacing: 2px; font-weight: 700; margin-bottom: 10px; }
    .title { font-size: 28px; font-weight: 900; color: #FFFFFF; }
    .subtitle { font-size: 14px; color: #7A7A95; margin-top: 4px; }
    .card { background: #0E0E14; border: 1px solid rgba(255,255,255,0.07); border-radius: 16px; padding: 20px; margin-bottom: 20px; }
    .card-title { font-size: 10px; font-weight: 700; letter-spacing: 2px; color: #7A7A95; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    th { font-size: 10px; letter-spacing: 1.5px; color: #7A7A95; text-align: left; padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.07); }
    tr:nth-child(even) { background: rgba(255,255,255,0.02); }
    .section-label { font-size: 10px; font-weight: 700; letter-spacing: 2px; color: #9A6CFF; margin-bottom: 12px; }
    ul { padding-left: 16px; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.07); text-align: center; color: #7A7A95; font-size: 11px; }
  </style>
</head>
<body>

  <div class="header">
    <div class="badge">WEEKLY PROGRESS REPORT</div>
    <div class="title">HealthOS Report</div>
    <div class="subtitle">${weekLabel} &nbsp;·&nbsp; Generated ${new Date().toLocaleDateString()}</div>
  </div>

  <!-- Score -->
  <div class="card">
    <div class="card-title">PERFORMANCE SUMMARY</div>
    ${scoreBar(avgScore)}
    <div style="display:flex;justify-content:space-around;margin-top:16px;text-align:center;">
      <div><div style="font-size:24px;font-weight:900;color:#1AE5A7;">${avgSteps.toLocaleString()}</div><div style="font-size:10px;color:#7A7A95;">AVG STEPS</div></div>
      <div><div style="font-size:24px;font-weight:900;color:#9A6CFF;">${avgSleep}h</div><div style="font-size:10px;color:#7A7A95;">AVG SLEEP</div></div>
      <div><div style="font-size:24px;font-weight:900;color:#4F7BFF;">${avgWater}ml</div><div style="font-size:10px;color:#7A7A95;">AVG WATER</div></div>
    </div>
  </div>

  <!-- Metrics Table -->
  <div class="card">
    <div class="card-title">METRIC BREAKDOWN</div>
    <table>
      <thead>
        <tr>
          <th>METRIC</th><th>AVG</th><th>GOAL</th><th>PROGRESS</th>
        </tr>
      </thead>
      <tbody>
        ${metricRow("Steps", avgSteps.toLocaleString(), stepGoal.toLocaleString(), "", "#4F7BFF", Math.round((avgSteps/stepGoal)*100))}
        ${metricRow("Sleep", String(avgSleep), String(sleepGoal), "hrs", "#9A6CFF", Math.round((avgSleep/sleepGoal)*100))}
        ${metricRow("Water", String(avgWater), String(waterGoal), "ml", "#1AE5A7", Math.round((avgWater/waterGoal)*100))}
        ${avgHr > 0 ? metricRow("Heart Rate", String(avgHr), "70", "bpm", "#EF476F", avgHr <= 80 && avgHr >= 60 ? 100 : 60) : ""}
        ${avgSugar > 0 ? metricRow("Blood Sugar", String(avgSugar), "100", "mg/dL", "#06D6A0", avgSugar <= 100 ? 100 : Math.round((100/avgSugar)*100)) : ""}
        ${avgWeight > 0 ? metricRow("Weight", String(avgWeight), String(profile.weight), "kg", "#FFD166", 100) : ""}
      </tbody>
    </table>
  </div>

  <!-- Score per day -->
  <div class="card">
    <div class="card-title">DAILY SCORES THIS WEEK</div>
    <div style="display:flex;align-items:flex-end;gap:8px;height:80px;">
      ${scores.map((s, i) => {
        const zone = getPerformanceZone(s);
        const c = getZoneColor(zone);
        const h = Math.max(10, Math.round((s / 100) * 70));
        const days = ["M","T","W","T","F","S","S"];
        return `<div style="flex:1;text-align:center;">
          <div style="height:${h}px;background:${c};border-radius:4px;margin-bottom:4px;"></div>
          <div style="font-size:10px;color:#7A7A95;">${days[i] ?? i+1}</div>
          <div style="font-size:10px;font-weight:700;color:${c};">${s}</div>
        </div>`;
      }).join("")}
    </div>
  </div>

  ${doctorFocusHtml ? `
  <!-- Doctor Focus -->
  <div class="card">
    <div class="section-label">DOCTOR FOCUS AREAS</div>
    <ul>${doctorFocusHtml}</ul>
  </div>` : ""}

  ${tipsHtml ? `
  <!-- Health Tips -->
  <div class="card">
    <div class="section-label">AI HEALTH TIPS</div>
    <ul>${tipsHtml}</ul>
  </div>` : ""}

  <div class="footer">
    HealthOS Mobile &nbsp;·&nbsp; Powered by AI analysis of your medical reports<br/>
    This report is for personal tracking only. Consult your doctor for medical decisions.
  </div>

</body>
</html>
  `.trim();
}

// ─── PDF Generation & Share ───────────────────────────────────────────────────

export async function generateAndShareWeeklyReport(
  records: DailyHealthRecord[],
  profile: UserProfile,
  aiPlan: AiPersonalization | null,
  weekLabel: string
): Promise<string | null> {
  try {
    const html = buildWeeklyReportHtml(records, profile, aiPlan, weekLabel);
    const { uri } = await Print.printToFileAsync({ html, base64: false });

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: "Save or Share Your Health Report",
        UTI: "com.adobe.pdf"
      });
    }

    return uri;
  } catch (err) {
    console.warn("Failed to generate weekly report:", err);
    return null;
  }
}

// ─── Weekly Notification (every 7 days) ──────────────────────────────────────

export async function scheduleWeeklyReportNotification(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(WEEKLY_REPORT_NOTIF_ID).catch(() => {});

  // Schedule every Sunday at 9 AM for the weekly report
  await Notifications.scheduleNotificationAsync({
    identifier: WEEKLY_REPORT_NOTIF_ID,
    content: {
      title: "📊 Your Weekly Health Report is Ready",
      body: "Tap to view and download your 7-day progress summary.",
      data: { screen: "analytics", action: "weekly_report" }
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 1,   // Sunday (1=Sunday in Expo's numbering)
      hour: 9,
      minute: 0
    }
  });
}

export async function cancelWeeklyReportNotification(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(WEEKLY_REPORT_NOTIF_ID).catch(() => {});
}

// ─── Calendar Integration ─────────────────────────────────────────────────────

export async function addWeeklyReportToCalendar(): Promise<string | null> {
  try {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== "granted") return null;

    // Find or create HealthOS calendar
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    let calId = calendars.find((c) => c.title === "HealthOS")?.id;

    if (!calId) {
      const defaultSource = Platform.OS === "ios"
        ? calendars.find((c) => c.source?.name === "Default")?.source ?? { isLocalAccount: true, name: "Default", type: "" }
        : { isLocalAccount: true, name: "HealthOS", type: "" };

      calId = await Calendar.createCalendarAsync({
        title: "HealthOS",
        color: "#4F7BFF",
        entityType: Calendar.EntityTypes.EVENT,
        sourceId: (defaultSource as { id?: string }).id,
        source: defaultSource as Calendar.Source,
        name: "healthOS",
        ownerAccount: "personal",
        accessLevel: Calendar.CalendarAccessLevel.OWNER
      });
    }

    // Create a recurring weekly event every Sunday
    const now = new Date();
    // Find next Sunday
    const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
    const nextSunday = new Date(now);
    nextSunday.setDate(now.getDate() + daysUntilSunday);
    nextSunday.setHours(9, 0, 0, 0);
    const endTime = new Date(nextSunday);
    endTime.setMinutes(30);

    const eventId = await Calendar.createEventAsync(calId, {
      title: WEEKLY_REPORT_CALENDAR_TITLE,
      startDate: nextSunday,
      endDate: endTime,
      notes: "Open HealthOS to view and download your weekly health progress report.",
      alarms: [{ relativeOffset: -30 }],
      recurrenceRule: {
        frequency: Calendar.Frequency.WEEKLY,
        interval: 1
      }
    });

    return eventId;
  } catch (err) {
    console.warn("Calendar integration failed:", err);
    return null;
  }
}
