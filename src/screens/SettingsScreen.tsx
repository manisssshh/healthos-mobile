import { useState } from "react";
import { Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import type { HealthCondition, UserProfileInput } from "../types/health";
import {
  AGE_MAX, AGE_MIN, CONDITION_OPTIONS, GOAL_OPTIONS,
  HEIGHT_MAX, HEIGHT_MIN, WEIGHT_MAX, WEIGHT_MIN
} from "../types/health";
import { useHealthStore } from "../store/useHealthStore";
import { useTheme } from "../context/ThemeContext";
import { cancelAllReminders, setupHealthReminders } from "../services/notificationService";
import { enableMealReminders, cancelMealReminders } from "../services/mealReminderService";
import {
  scheduleWeeklyReportNotification,
  cancelWeeklyReportNotification,
  addWeeklyReportToCalendar,
  generateAndShareWeeklyReport
} from "../services/weeklyReportService";
import { syncGalaxyWatch4, isHealthConnectAvailable } from "../services/samsungHealthService";

type SettingsScreenProps = { onClose: () => void };

function SectionCard({ title, icon, color, children }: {
  title: string; icon: string; color: string; children: React.ReactNode;
}): JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{
      backgroundColor: colors.card, borderRadius: 20,
      borderWidth: 1, borderColor: colors.border,
      padding: 16, marginBottom: 12
    }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <View style={{ backgroundColor: `${color}20`, borderRadius: 8, padding: 6 }}>
          <MaterialCommunityIcons name={icon as never} size={14} color={color} />
        </View>
        <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "700" }}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function SettingRow({ label, description, value, onValueChange, disabled }: {
  label: string; description?: string;
  value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean;
}): JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 }}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600" }}>{label}</Text>
        {description ? <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.cardMuted, true: colors.accentBlue }}
        thumbColor={value ? "#FFFFFF" : colors.textMuted}
      />
    </View>
  );
}

export function SettingsScreen({ onClose }: SettingsScreenProps): JSX.Element {
  const profile     = useHealthStore((s) => s.profile);
  const saveProfile = useHealthStore((s) => s.saveProfile);
  const appSettings = useHealthStore((s) => s.appSettings);
  const updateSettings = useHealthStore((s) => s.updateAppSettings);
  const syncWatchData = useHealthStore((s) => s.syncWatchData);
  const weeklyRecords = useHealthStore((s) => s.weeklyRecords);
  const aiPersonalization = useHealthStore((s) => s.aiPersonalization);

  const { colors, isDark, toggleTheme } = useTheme();

  const [age,    setAge]    = useState(String(profile?.age    ?? 28));
  const [weight, setWeight] = useState(String(profile?.weight ?? 70));
  const [height, setHeight] = useState(String(profile?.height ?? 170));
  const [goal,   setGoal]   = useState<UserProfileInput["goal"]>(profile?.goal ?? "general_fitness");
  const [conditions, setConditions] = useState<HealthCondition[]>(profile?.conditions ?? []);
  const [isSaving,         setIsSaving]         = useState(false);
  const [notifEnabled,      setNotifEnabled]      = useState(false);
  const [notifLoading,     setNotifLoading]      = useState(false);
  const [mealNotifLoading, setMealNotifLoading]  = useState(false);
  const [watchLoading,     setWatchLoading]      = useState(false);
  const [reportLoading,    setReportLoading]     = useState(false);
  const [calendarLoading,  setCalendarLoading]   = useState(false);

  function toggleCondition(condition: HealthCondition): void {
    setConditions((c) =>
      c.includes(condition) ? c.filter((x) => x !== condition) : [...c, condition]
    );
  }

  async function handleSave(): Promise<void> {
    const parsedAge    = Number(age);
    const parsedWeight = Number(weight);
    const parsedHeight = Number(height);
    if (!Number.isFinite(parsedAge) || !Number.isFinite(parsedWeight) || !Number.isFinite(parsedHeight)) {
      Alert.alert("Invalid Input", "Please enter valid numbers.");
      return;
    }
    if (parsedAge < AGE_MIN || parsedAge > AGE_MAX) {
      Alert.alert("Invalid Age", `Age must be ${AGE_MIN}–${AGE_MAX}.`);
      return;
    }
    if (parsedWeight < WEIGHT_MIN || parsedWeight > WEIGHT_MAX) {
      Alert.alert("Invalid Weight", `Weight must be ${WEIGHT_MIN}–${WEIGHT_MAX} kg.`);
      return;
    }
    if (parsedHeight < HEIGHT_MIN || parsedHeight > HEIGHT_MAX) {
      Alert.alert("Invalid Height", `Height must be ${HEIGHT_MIN}–${HEIGHT_MAX} cm.`);
      return;
    }
    setIsSaving(true);
    try {
      await saveProfile({ age: parsedAge, weight: parsedWeight, height: parsedHeight, goal, conditions });
      Alert.alert("Saved", "Profile updated.", [{ text: "OK", onPress: onClose }]);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleReminders(value: boolean): Promise<void> {
    setNotifLoading(true);
    try {
      if (value) {
        const success = await setupHealthReminders();
        if (success) {
          setNotifEnabled(true);
          Alert.alert("Reminders On", "Daily reminders set for 8 AM, 8 PM, and 10:30 PM.");
        } else {
          Alert.alert("Permission Denied", "Enable notifications in device settings.");
          return;
        }
      } else {
        await cancelAllReminders();
        setNotifEnabled(false);
      }
    } finally {
      setNotifLoading(false);
    }
  }

  async function handleToggleMealReminders(value: boolean): Promise<void> {
    setMealNotifLoading(true);
    try {
      if (value) {
        const mealPlan = aiPersonalization?.meal_plan;
        if (!mealPlan?.length) {
          Alert.alert("No Meal Plan", "Run AI Analysis first to generate your meal plan, then enable reminders.");
          return;
        }
        const count = await enableMealReminders(mealPlan);
        if (count > 0) {
          await updateSettings({ meal_reminders_enabled: true });
          Alert.alert("Meal Reminders On", `${count} daily meal notifications scheduled. You'll be told what to eat at each meal time.`);
        }
      } else {
        await cancelMealReminders();
        await updateSettings({ meal_reminders_enabled: false });
      }
    } finally {
      setMealNotifLoading(false);
    }
  }

  async function handleToggleWeeklyReport(value: boolean): Promise<void> {
    try {
      if (value) {
        await scheduleWeeklyReportNotification();
        await updateSettings({ weekly_report_enabled: true });
        Alert.alert("Weekly Reports On", "You'll receive a notification every Sunday at 9 AM to download your 7-day progress PDF.");
      } else {
        await cancelWeeklyReportNotification();
        await updateSettings({ weekly_report_enabled: false });
      }
    } catch {
      Alert.alert("Error", "Could not update weekly report settings.");
    }
  }

  async function handleAddToCalendar(): Promise<void> {
    setCalendarLoading(true);
    try {
      const eventId = await addWeeklyReportToCalendar();
      if (eventId) {
        Alert.alert("Added to Calendar", "A recurring weekly event 'HealthOS Weekly Report' has been added to your calendar every Sunday at 9 AM.");
      } else {
        Alert.alert("Calendar Access Denied", "Please grant calendar permissions in device settings.");
      }
    } finally {
      setCalendarLoading(false);
    }
  }

  async function handleDownloadReport(): Promise<void> {
    if (!profile) return;
    setReportLoading(true);
    try {
      const weekLabel = weeklyRecords.length >= 2
        ? `${weeklyRecords[0].date} – ${weeklyRecords[weeklyRecords.length - 1].date}`
        : new Date().toLocaleDateString();
      await generateAndShareWeeklyReport(weeklyRecords, profile, aiPersonalization, weekLabel);
    } finally {
      setReportLoading(false);
    }
  }

  async function handleSyncWatch(): Promise<void> {
    setWatchLoading(true);
    try {
      const available = await isHealthConnectAvailable();
      if (!available) {
        Alert.alert(
          "Health Connect Required",
          "Install Samsung Health and Android Health Connect. Your Galaxy Watch 4 must be paired and syncing."
        );
        return;
      }
      const data = await syncGalaxyWatch4();
      if (data) {
        await syncWatchData(data);
        await updateSettings({ watch_connected: true });
        Alert.alert("Watch Synced", "Galaxy Watch 4 data is now showing in your dashboard.");
      } else {
        Alert.alert("Sync Failed", "Could not read watch data. Check permissions in Health Connect settings.");
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "An unexpected error occurred during sync.";
      Alert.alert("Sync Error", msg);
    } finally {
      setWatchLoading(false);
    }
  }

  const inputStyle = {
    borderRadius: 12, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.cardMuted,
    paddingHorizontal: 12, paddingVertical: 10,
    color: colors.text, fontSize: 14
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4, marginBottom: 20 }}>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: "900" }}>Settings</Text>
        <Pressable
          onPress={onClose}
          style={{
            borderRadius: 20, padding: 8,
            backgroundColor: colors.cardMuted,
            borderWidth: 1, borderColor: colors.border
          }}
        >
          <MaterialCommunityIcons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </View>

      {/* ── Appearance ──────────────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.delay(40).duration(350)}>
        <SectionCard title="Appearance" icon="palette-outline" color="#9A6CFF">
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: isDark ? "#060608" : "#F0F2F8", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.accentPurple }}>
                <MaterialCommunityIcons name={isDark ? "weather-night" : "weather-sunny"} size={18} color={colors.accentPurple} />
              </View>
              <View>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>
                  {isDark ? "Dark Mode" : "Light Mode"}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                  {isDark ? "Switch to light theme" : "Switch to dark theme"}
                </Text>
              </View>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: "#E0E0F0", true: "#9A6CFF" }}
              thumbColor="#FFFFFF"
            />
          </View>
        </SectionCard>
      </Animated.View>

      {/* ── Samsung Watch ─────────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.delay(60).duration(350)}>
        <SectionCard title="Samsung Galaxy Watch 4" icon="watch" color="#1AE5A7">
          <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18, marginBottom: 12 }}>
            Sync steps, heart rate, SpO₂, sleep, calories and more from your Galaxy Watch 4 via Samsung Health Connect.
          </Text>

          <View style={{ gap: 8 }}>
            {(["steps", "heart_rate", "spo2", "sleep_hours", "calories_burned", "stress_level", "body_fat_pct", "resting_hr"] as const).map((key) => (
              <View key={key} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: "#1AE5A7" }} />
                <Text style={{ color: colors.text, fontSize: 12 }}>
                  {key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </Text>
              </View>
            ))}
          </View>

          <Pressable
            onPress={() => { void handleSyncWatch(); }}
            disabled={watchLoading}
            style={{
              marginTop: 14, borderRadius: 14, backgroundColor: "#1AE5A7",
              paddingVertical: 12, alignItems: "center",
              opacity: watchLoading ? 0.7 : 1
            }}
          >
            <Text style={{ color: "#000", fontSize: 13, fontWeight: "700" }}>
              {watchLoading ? "Connecting..." : "Sync Galaxy Watch 4"}
            </Text>
          </Pressable>

          {appSettings.watch_connected && (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#1AE5A7" }} />
              <Text style={{ color: "#1AE5A7", fontSize: 11 }}>Watch connected</Text>
            </View>
          )}
        </SectionCard>
      </Animated.View>

      {/* ── Weekly Progress Reports ───────────────────────────────────── */}
      <Animated.View entering={FadeInDown.delay(80).duration(350)}>
        <SectionCard title="Weekly Progress Reports" icon="file-chart-outline" color="#4F7BFF">
          <SettingRow
            label="Automated Weekly Report"
            description="Receive a reminder every Sunday at 9 AM to download your PDF"
            value={appSettings.weekly_report_enabled}
            onValueChange={(v) => { void handleToggleWeeklyReport(v); }}
          />

          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 10 }} />

          <View style={{ gap: 8 }}>
            <Pressable
              onPress={() => { void handleDownloadReport(); }}
              disabled={reportLoading}
              style={{
                borderRadius: 14, backgroundColor: colors.accentBlue,
                paddingVertical: 11, alignItems: "center",
                opacity: reportLoading ? 0.7 : 1
              }}
            >
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>
                {reportLoading ? "Generating..." : "Download Report Now"}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => { void handleAddToCalendar(); }}
              disabled={calendarLoading}
              style={{
                borderRadius: 14, borderWidth: 1, borderColor: colors.border,
                backgroundColor: colors.cardMuted,
                paddingVertical: 11, alignItems: "center", flexDirection: "row",
                justifyContent: "center", gap: 8,
                opacity: calendarLoading ? 0.7 : 1
              }}
            >
              <MaterialCommunityIcons name="calendar-plus" size={16} color={colors.accentBlue} />
              <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600" }}>
                {calendarLoading ? "Adding..." : "Add to Calendar"}
              </Text>
            </Pressable>
          </View>
        </SectionCard>
      </Animated.View>

      {/* ── Meal Reminders ────────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.delay(100).duration(350)}>
        <SectionCard title="Meal Reminders" icon="food-outline" color="#1AE5A7">
          <SettingRow
            label="Daily Meal Notifications"
            description="Get notified at each meal time with what to eat from your AI plan"
            value={appSettings.meal_reminders_enabled}
            onValueChange={(v) => { void handleToggleMealReminders(v); }}
            disabled={mealNotifLoading}
          />
          {!aiPersonalization?.meal_plan?.length && (
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 8 }}>
              Run AI Analysis first to generate your personalized meal plan.
            </Text>
          )}
        </SectionCard>
      </Animated.View>

      {/* ── Notifications ─────────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.delay(120).duration(350)}>
        <SectionCard title="Daily Reminders" icon="bell-outline" color="#FFB238">
          <SettingRow
            label="Health Reminders"
            description="8 AM morning log · 8 PM hydration · 10:30 PM sleep"
            value={notifEnabled}
            onValueChange={(v) => { void handleToggleReminders(v); }}
            disabled={notifLoading}
          />
        </SectionCard>
      </Animated.View>

      {/* ── Profile ───────────────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.delay(140).duration(350)}>
        <SectionCard title="Basic Profile" icon="account-outline" color="#4F7BFF">
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textMuted, fontSize: 10, marginBottom: 6, fontWeight: "600" }}>AGE</Text>
              <TextInput value={age} onChangeText={setAge} keyboardType="numeric" maxLength={2} style={inputStyle} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textMuted, fontSize: 10, marginBottom: 6, fontWeight: "600" }}>WEIGHT (KG)</Text>
              <TextInput value={weight} onChangeText={setWeight} keyboardType="decimal-pad" maxLength={5} style={inputStyle} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textMuted, fontSize: 10, marginBottom: 6, fontWeight: "600" }}>HEIGHT (CM)</Text>
              <TextInput value={height} onChangeText={setHeight} keyboardType="numeric" maxLength={3} style={inputStyle} />
            </View>
          </View>

          <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "600", marginBottom: 8 }}>PRIMARY GOAL</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {GOAL_OPTIONS.map((item) => (
              <Pressable
                key={item.value}
                onPress={() => setGoal(item.value)}
                style={{
                  borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
                  borderWidth: 1,
                  backgroundColor: goal === item.value ? "rgba(79,123,255,0.25)" : colors.cardMuted,
                  borderColor: goal === item.value ? "rgba(79,123,255,0.60)" : colors.border
                }}
              >
                <Text style={{ color: goal === item.value ? "#FFFFFF" : colors.textMuted, fontSize: 12, fontWeight: "600" }}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "600", marginBottom: 8 }}>HEALTH CONDITIONS</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {CONDITION_OPTIONS.map((option) => {
              const selected = conditions.includes(option.value);
              return (
                <Pressable
                  key={option.value}
                  onPress={() => toggleCondition(option.value)}
                  style={{
                    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
                    borderWidth: 1,
                    backgroundColor: selected ? "rgba(79,123,255,0.25)" : colors.cardMuted,
                    borderColor: selected ? "rgba(79,123,255,0.60)" : colors.border
                  }}
                >
                  <Text style={{ color: selected ? "#FFFFFF" : colors.textMuted, fontSize: 12 }}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </SectionCard>
      </Animated.View>

      {/* Save Button */}
      <Animated.View entering={FadeInDown.delay(160).duration(350)}>
        <LinearGradient
          colors={["#4F7BFF", "#9A6CFF"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ borderRadius: 16 }}
        >
          <Pressable
            onPress={() => { void handleSave(); }}
            disabled={isSaving}
            style={{ paddingVertical: 15, alignItems: "center", opacity: isSaving ? 0.7 : 1 }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "800" }}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Text>
          </Pressable>
        </LinearGradient>
      </Animated.View>
    </ScrollView>
  );
}
