import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ProgressBar } from "../components/ProgressBar";
import { MealTracker } from "../components/MealTracker";
import { useHealthStore } from "../store/useHealthStore";
import { useTheme } from "../context/ThemeContext";
import {
  MAX_SLEEP_HOURS_ENTRY,
  MAX_STEPS_ENTRY,
  MAX_WATER_ML_ENTRY,
  MAX_WEIGHT_ENTRY,
  WEIGHT_MIN,
  WATER_GOAL_ML,
  BP_SYS_MIN,
  BP_SYS_MAX,
  BP_DIA_MIN,
  BP_DIA_MAX,
  HR_MIN,
  HR_MAX,
  SUGAR_MIN,
  SUGAR_MAX
} from "../types/health";
import type { ReportType } from "../types/health";
import { pickAndStoreReportFile } from "../services/reportFileService";
import { AI_ANALYSIS_PROGRESS_STEPS } from "../services/aiPersonalizationService";
import { getTodayDateKey } from "../utils/dateUtils";
import { syncGalaxyWatch4, isHealthConnectAvailable } from "../services/samsungHealthService";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function ScaleButton({ label, onPress, variant = "primary", color }: {
  label: string; onPress: () => void;
  variant?: "primary" | "secondary"; color?: string;
}): JSX.Element {
  const { colors } = useTheme();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const bg = variant === "primary" ? (color ?? colors.accentBlue) : colors.cardMuted;
  const tc = variant === "primary" ? "#FFFFFF" : colors.textMuted;

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => { scale.value = withTiming(0.96, { duration: 90 }); }}
      onPressOut={() => { scale.value = withTiming(1, { duration: 120 }); }}
      style={[animatedStyle, {
        borderRadius: 14, paddingHorizontal: 16, paddingVertical: 11,
        backgroundColor: bg,
        borderWidth: variant === "secondary" ? 1 : 0,
        borderColor: colors.border
      }]}
    >
      <Text style={{ color: tc, fontWeight: "700", fontSize: 13 }}>{label}</Text>
    </AnimatedPressable>
  );
}

function SectionCard({ title, subtitle, children, accentColor = "#4F7BFF", icon }: {
  title: string; subtitle?: string; children: React.ReactNode;
  accentColor?: string; icon?: string;
}): JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={{
      backgroundColor: colors.card,
      borderRadius: 20, borderWidth: 1,
      borderColor: colors.border, padding: 16
    }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12, gap: 8 }}>
        {icon ? (
          <View style={{
            backgroundColor: `${accentColor}20`, borderRadius: 8,
            width: 30, height: 30, alignItems: "center", justifyContent: "center"
          }}>
            <MaterialCommunityIcons name={icon as never} size={14} color={accentColor} />
          </View>
        ) : null}
        <View>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>{title}</Text>
          {subtitle ? <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}>{subtitle}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

function MetricInput({ value, onChangeText, placeholder, keyboardType = "numeric", maxLength }: {
  value: string; onChangeText: (v: string) => void;
  placeholder: string; keyboardType?: "numeric" | "decimal-pad"; maxLength?: number;
}): JSX.Element {
  const { colors } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      keyboardType={keyboardType}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      maxLength={maxLength}
      style={{
        flex: 1,
        borderRadius: 12, borderWidth: 1, borderColor: colors.border,
        backgroundColor: colors.cardMuted,
        paddingHorizontal: 14, paddingVertical: 11,
        color: colors.text, fontSize: 15
      }}
    />
  );
}

export function LogScreen(): JSX.Element {
  const todayRecord       = useHealthStore((s) => s.todayRecord);
  const activeMetrics     = useHealthStore((s) => s.activeMetrics);
  const reports           = useHealthStore((s) => s.reports);
  const aiPersonalization = useHealthStore((s) => s.aiPersonalization);
  const isAnalyzingAi        = useHealthStore((s) => s.isAnalyzingAi);
  const aiError              = useHealthStore((s) => s.aiError);
  const aiRateLimitSeconds   = useHealthStore((s) => s.aiRateLimitSeconds);
  const watchData            = useHealthStore((s) => s.watchData);
  const clearAiError         = useHealthStore((s) => s.clearAiError);
  const runAiPersonalization = useHealthStore((s) => s.runAiPersonalization);
  const addReport         = useHealthStore((s) => s.addReport);
  const removeReport      = useHealthStore((s) => s.removeReport);
  const addWater          = useHealthStore((s) => s.addWater);
  const setSteps          = useHealthStore((s) => s.setSteps);
  const setSleep          = useHealthStore((s) => s.setSleep);
  const setWeight         = useHealthStore((s) => s.setWeight);
  const setBloodPressure  = useHealthStore((s) => s.setBloodPressure);
  const setHeartRate      = useHealthStore((s) => s.setHeartRate);
  const setBloodSugar     = useHealthStore((s) => s.setBloodSugar);
  const syncWatchData     = useHealthStore((s) => s.syncWatchData);
  const resetToday        = useHealthStore((s) => s.resetToday);

  const { colors } = useTheme();

  const [customWater, setCustomWater]     = useState("");
  const [stepsInput, setStepsInput]       = useState("");
  const [sleepInput, setSleepInput]       = useState("");
  const [weightInput, setWeightInput]     = useState("");
  const [bpSysInput, setBpSysInput]       = useState("");
  const [bpDiaInput, setBpDiaInput]       = useState("");
  const [heartRateInput, setHeartRateInput] = useState("");
  const [bloodSugarInput, setBloodSugarInput] = useState("");
  const [uploadingType, setUploadingType] = useState<ReportType | null>(null);
  const [analysisStepIndex, setAnalysisStepIndex] = useState(0);
  const [isSyncingWatch, setIsSyncingWatch] = useState(false);
  const [watchAvailable, setWatchAvailable] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const retryGlow = useSharedValue(0);

  const shouldTrackWeight = useMemo(() => activeMetrics.includes("weight"), [activeMetrics]);
  const shouldTrackBp     = useMemo(() => activeMetrics.includes("blood_pressure_sys"), [activeMetrics]);
  const shouldTrackHr     = useMemo(() => activeMetrics.includes("heart_rate"), [activeMetrics]);
  const shouldTrackSugar  = useMemo(() => activeMetrics.includes("blood_sugar"), [activeMetrics]);

  const waterGoal = useMemo(() => {
    const t = aiPersonalization?.metric_targets?.water;
    return typeof t === "number" && t > 0 ? Math.round(t) : WATER_GOAL_ML;
  }, [aiPersonalization?.metric_targets?.water]);

  // Today's meal plan template
  const todayMealTemplate = useMemo(() => {
    const meals = aiPersonalization?.meal_plan;
    if (!meals?.length) return null;
    return meals.find((t) => t.label.toLowerCase().includes("regular")) ?? meals[0];
  }, [aiPersonalization?.meal_plan]);

  useEffect(() => {
    if (!todayRecord) return;
    setStepsInput(String(todayRecord.steps || ""));
    setSleepInput(todayRecord.sleep_hours ? String(todayRecord.sleep_hours) : "");
    setWeightInput(todayRecord.weight_kg ? String(todayRecord.weight_kg) : "");
    setBpSysInput(todayRecord.blood_pressure_sys ? String(todayRecord.blood_pressure_sys) : "");
    setBpDiaInput(todayRecord.blood_pressure_dia ? String(todayRecord.blood_pressure_dia) : "");
    setHeartRateInput(todayRecord.heart_rate ? String(todayRecord.heart_rate) : "");
    setBloodSugarInput(todayRecord.blood_sugar ? String(todayRecord.blood_sugar) : "");
  }, [todayRecord]);

  useEffect(() => {
    if (!isAnalyzingAi) { setAnalysisStepIndex(0); return; }
    const timer = setInterval(() => {
      setAnalysisStepIndex((c) => (c + 1) % AI_ANALYSIS_PROGRESS_STEPS.length);
    }, 1500);
    return () => clearInterval(timer);
  }, [isAnalyzingAi]);

  // Check if Samsung Health Connect is available
  useEffect(() => {
    isHealthConnectAvailable().then(setWatchAvailable).catch(() => {});
  }, []);

  // Rate limit countdown
  useEffect(() => {
    if (!aiRateLimitSeconds) { setCountdown(null); return; }
    setCountdown(aiRateLimitSeconds);
    retryGlow.value = 0;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          retryGlow.value = withTiming(1, { duration: 600 });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [aiRateLimitSeconds]);

  const retryGlowStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + retryGlow.value * 0.5,
    transform: [{ scale: 1 + retryGlow.value * 0.04 }],
    shadowOpacity: retryGlow.value * 0.8,
    shadowRadius: retryGlow.value * 12,
    elevation: retryGlow.value * 8,
  }));

  if (!todayRecord) return <View style={{ flex: 1 }} />;

  async function onUploadReport(type: ReportType): Promise<void> {
    try {
      setUploadingType(type);
      const picked = await pickAndStoreReportFile();
      if (!picked) return;
      await addReport({ file_url: picked.fileUrl, file_name: picked.fileName, type, date: getTodayDateKey() });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Could not upload the file. Please try again.";
      Alert.alert("Upload Failed", msg);
    } finally {
      setUploadingType(null);
    }
  }

  async function onAddCustomWater(): Promise<void> {
    const parsed = Number(customWater);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_WATER_ML_ENTRY) return;
    await addWater(parsed);
    setCustomWater("");
  }

  async function onSaveSleep(): Promise<void> {
    const parsed = Number(sleepInput);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_SLEEP_HOURS_ENTRY) {
      Alert.alert("Invalid Sleep", `Enter a value between 0 and ${MAX_SLEEP_HOURS_ENTRY} hours.`);
      return;
    }
    await setSleep(parsed);
  }

  async function onSaveWeight(): Promise<void> {
    const parsed = Number(weightInput);
    if (!Number.isFinite(parsed) || parsed < WEIGHT_MIN || parsed > MAX_WEIGHT_ENTRY) {
      Alert.alert("Invalid Weight", `Enter a weight between ${WEIGHT_MIN} and ${MAX_WEIGHT_ENTRY} kg.`);
      return;
    }
    await setWeight(parsed);
  }

  async function onSaveBloodPressure(): Promise<void> {
    const sys = Number(bpSysInput), dia = Number(bpDiaInput);
    if (!Number.isFinite(sys) || !Number.isFinite(dia)) return;
    if (sys < BP_SYS_MIN || sys > BP_SYS_MAX || dia < BP_DIA_MIN || dia > BP_DIA_MAX) return;
    await setBloodPressure(sys, dia);
  }

  async function onSaveHeartRate(): Promise<void> {
    const hr = Number(heartRateInput);
    if (!Number.isFinite(hr) || hr < HR_MIN || hr > HR_MAX) return;
    await setHeartRate(hr);
  }

  async function onSaveBloodSugar(): Promise<void> {
    const sugar = Number(bloodSugarInput);
    if (!Number.isFinite(sugar) || sugar < SUGAR_MIN || sugar > SUGAR_MAX) return;
    await setBloodSugar(sugar);
  }

  async function onSyncWatch(): Promise<void> {
    setIsSyncingWatch(true);
    try {
      const data = await syncGalaxyWatch4();
      if (data) {
        await syncWatchData(data);
        Alert.alert("Watch Synced", "Galaxy Watch 4 data has been synced to your dashboard.");
      } else {
        Alert.alert("Not Connected", "Could not connect to Samsung Health. Make sure the Health Connect app is installed and your Galaxy Watch 4 is paired.");
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "An unexpected error occurred during sync.";
      Alert.alert("Sync Error", msg);
    } finally {
      setIsSyncingWatch(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 122, gap: 12 }}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View entering={FadeInDown.duration(300)}>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: "900", marginTop: 4 }}>Daily Tracking</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }}>
          Personalized for your goals and medical profile.
        </Text>
      </Animated.View>

      {/* ── Samsung Watch Sync ──────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.delay(60).duration(300)}>
        <LinearGradient
          colors={["rgba(26,229,167,0.12)", "rgba(26,229,167,0.04)"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 20, borderWidth: 1,
            borderColor: "rgba(26,229,167,0.25)", padding: 14
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
              <View style={{
                backgroundColor: "rgba(26,229,167,0.18)", borderRadius: 12,
                width: 42, height: 42, alignItems: "center", justifyContent: "center"
              }}>
                <MaterialCommunityIcons name="watch" size={20} color="#1AE5A7" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>
                  Galaxy Watch 4
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                  {watchData?.last_synced
                    ? `Last synced: ${new Date(watchData.last_synced).toLocaleTimeString()}`
                    : watchAvailable ? "Health Connect available" : "Android Health Connect required"}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={() => { void onSyncWatch(); }}
              disabled={isSyncingWatch}
              style={{
                backgroundColor: "#1AE5A7",
                borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9,
                opacity: isSyncingWatch ? 0.6 : 1
              }}
            >
              {isSyncingWatch
                ? <ActivityIndicator size="small" color="#000" />
                : <Text style={{ color: "#000", fontSize: 12, fontWeight: "700" }}>Sync</Text>}
            </Pressable>
          </View>

          {/* Watch data pills */}
          {watchData && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {watchData.steps !== undefined && (
                <View style={{ backgroundColor: colors.cardMuted, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <MaterialCommunityIcons name="shoe-print" size={11} color="#4F7BFF" />
                  <Text style={{ color: colors.text, fontSize: 11, fontWeight: "600" }}>{watchData.steps.toLocaleString()}</Text>
                </View>
              )}
              {watchData.heart_rate !== undefined && (
                <View style={{ backgroundColor: colors.cardMuted, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <MaterialCommunityIcons name="heart-pulse" size={11} color="#EF476F" />
                  <Text style={{ color: colors.text, fontSize: 11, fontWeight: "600" }}>{watchData.heart_rate} bpm</Text>
                </View>
              )}
              {watchData.spo2 !== undefined && (
                <View style={{ backgroundColor: colors.cardMuted, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <MaterialCommunityIcons name="water-circle" size={11} color="#06D6A0" />
                  <Text style={{ color: colors.text, fontSize: 11, fontWeight: "600" }}>{watchData.spo2.toFixed(1)}% SpO₂</Text>
                </View>
              )}
              {watchData.sleep_hours !== undefined && (
                <View style={{ backgroundColor: colors.cardMuted, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <MaterialCommunityIcons name="power-sleep" size={11} color="#9A6CFF" />
                  <Text style={{ color: colors.text, fontSize: 11, fontWeight: "600" }}>{watchData.sleep_hours.toFixed(1)}h sleep</Text>
                </View>
              )}
            </View>
          )}
        </LinearGradient>
      </Animated.View>

      {/* ── Today's Meal Plan ───────────────────────────────────────────── */}
      {todayMealTemplate ? (
        <Animated.View entering={FadeInDown.delay(80).duration(300)}>
          <MealTracker template={todayMealTemplate} />
        </Animated.View>
      ) : (
        <Animated.View entering={FadeInDown.delay(80).duration(300)}>
          <View style={{
            backgroundColor: colors.card, borderRadius: 20,
            borderWidth: 1, borderColor: colors.border, padding: 16
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <MaterialCommunityIcons name="food-apple-outline" size={16} color="#1AE5A7" />
              <Text style={{ color: "#1AE5A7", fontSize: 10, fontWeight: "700", letterSpacing: 1.5 }}>
                MEAL PLAN
              </Text>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18 }}>
              Upload a lab report (blood test) and run AI Analysis to get your personalized meal plan. Upload a doctor's prescription to extract your supplements in the Meds tab.
            </Text>
          </View>
        </Animated.View>
      )}

      {/* ── Water ───────────────────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.delay(100).duration(300)}>
        <SectionCard title="Hydration" subtitle={`Goal: ${waterGoal}ml per day`} icon="water" accentColor="#1AE5A7">
          <ProgressBar label="Water" value={todayRecord.water_ml} goal={waterGoal} />
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <ScaleButton label="+250ml" onPress={() => addWater(250)} color="#1AE5A7" />
            <ScaleButton label="+500ml" onPress={() => addWater(500)} color="#1AE5A7" />
            <ScaleButton label="+1L" onPress={() => addWater(1000)} color="#1AE5A7" />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
            <MetricInput
              value={customWater}
              onChangeText={setCustomWater}
              placeholder="Custom ml"
              maxLength={String(MAX_WATER_ML_ENTRY).length}
            />
            <ScaleButton label="Add" onPress={onAddCustomWater} color="#1AE5A7" />
          </View>
          <View style={{ marginTop: 8 }}>
            <ScaleButton label="Reset Today" onPress={resetToday} variant="secondary" />
          </View>
        </SectionCard>
      </Animated.View>

      {/* ── Sleep ───────────────────────────────────────────────────────── */}
      <Animated.View entering={FadeInDown.delay(120).duration(300)}>
        <SectionCard title="Sleep" subtitle={`Max ${MAX_SLEEP_HOURS_ENTRY} hrs`} icon="power-sleep" accentColor="#9A6CFF">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <MetricInput
              value={sleepInput}
              onChangeText={setSleepInput}
              keyboardType="decimal-pad"
              placeholder="e.g. 7.5 hrs"
              maxLength={4}
            />
            <ScaleButton label="Save" onPress={onSaveSleep} color="#9A6CFF" />
          </View>
        </SectionCard>
      </Animated.View>

      {/* ── Weight ──────────────────────────────────────────────────────── */}
      {shouldTrackWeight && (
        <Animated.View entering={FadeInDown.delay(140).duration(300)}>
          <SectionCard title="Weight" subtitle={`Goal-aware tracking. Max ${MAX_WEIGHT_ENTRY} kg.`} icon="scale-bathroom" accentColor="#FFD166">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <MetricInput
                value={weightInput}
                onChangeText={setWeightInput}
                keyboardType="decimal-pad"
                placeholder="Enter weight (kg)"
                maxLength={5}
              />
              <ScaleButton label="Save" onPress={onSaveWeight} color="#FFD166" />
            </View>
          </SectionCard>
        </Animated.View>
      )}

      {/* ── Blood Pressure ──────────────────────────────────────────────── */}
      {shouldTrackBp && (
        <Animated.View entering={FadeInDown.delay(160).duration(300)}>
          <SectionCard title="Blood Pressure" subtitle="Systolic / Diastolic (mmHg)" icon="heart-pulse" accentColor="#EF476F">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <MetricInput value={bpSysInput} onChangeText={setBpSysInput} placeholder="Sys" maxLength={3} />
              <Text style={{ color: colors.textMuted, fontSize: 18 }}>/</Text>
              <MetricInput value={bpDiaInput} onChangeText={setBpDiaInput} placeholder="Dia" maxLength={3} />
              <ScaleButton label="Save" onPress={onSaveBloodPressure} color="#EF476F" />
            </View>
          </SectionCard>
        </Animated.View>
      )}

      {/* ── Heart Rate ──────────────────────────────────────────────────── */}
      {shouldTrackHr && (
        <Animated.View entering={FadeInDown.delay(175).duration(300)}>
          <SectionCard title="Heart Rate" subtitle="Resting heart rate (bpm)" icon="heart" accentColor="#EF476F">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <MetricInput value={heartRateInput} onChangeText={setHeartRateInput} placeholder="BPM" maxLength={3} />
              <ScaleButton label="Save" onPress={onSaveHeartRate} color="#EF476F" />
            </View>
          </SectionCard>
        </Animated.View>
      )}

      {/* ── Blood Sugar ─────────────────────────────────────────────────── */}
      {shouldTrackSugar && (
        <Animated.View entering={FadeInDown.delay(190).duration(300)}>
          <SectionCard title="Fasting Blood Sugar" subtitle="Glycemic control (mg/dL)" icon="water-outline" accentColor="#06D6A0">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <MetricInput value={bloodSugarInput} onChangeText={setBloodSugarInput} placeholder="mg/dL" maxLength={3} />
              <ScaleButton label="Save" onPress={onSaveBloodSugar} color="#06D6A0" />
            </View>
          </SectionCard>
        </Animated.View>
      )}

      {/* ── Health Reports & AI Analysis ──────────────────────────────── */}
      <Animated.View entering={FadeInDown.delay(210).duration(300)}>
        <SectionCard
          title="Health Reports"
          subtitle="Lab reports → AI health plan · Prescriptions → auto-extract supplements to Meds tab"
          icon="file-document-outline"
          accentColor="#4F7BFF"
        >
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={() => { void onUploadReport("blood_test"); }}
              style={{
                flex: 1, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
                backgroundColor: colors.cardMuted, padding: 14, alignItems: "center"
              }}
            >
              {uploadingType === "blood_test"
                ? <ActivityIndicator color="#4F7BFF" />
                : <>
                    <MaterialCommunityIcons name="test-tube" size={20} color="#4F7BFF" />
                    <Text style={{ color: colors.text, fontSize: 12, marginTop: 6, fontWeight: "600" }}>Lab Report</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2, textAlign: "center" }}>Blood Test / HbA1c</Text>
                  </>}
            </Pressable>

            <Pressable
              onPress={() => { void onUploadReport("prescription"); }}
              style={{
                flex: 1, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
                backgroundColor: colors.cardMuted, padding: 14, alignItems: "center"
              }}
            >
              {uploadingType === "prescription"
                ? <ActivityIndicator color="#9A6CFF" />
                : <>
                    <MaterialCommunityIcons name="pill" size={20} color="#9A6CFF" />
                    <Text style={{ color: colors.text, fontSize: 12, marginTop: 6, fontWeight: "600" }}>Prescription</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2, textAlign: "center" }}>Doctor's Rx / Meds</Text>
                  </>}
            </Pressable>
          </View>

          {reports.length > 0 && (
            <View style={{ marginTop: 12, gap: 8 }}>
              {reports.slice(0, 4).map((report) => (
                <View key={report.id} style={{
                  flexDirection: "row", alignItems: "center",
                  backgroundColor: colors.cardMuted, borderRadius: 12,
                  paddingHorizontal: 12, paddingVertical: 10
                }}>
                  <MaterialCommunityIcons
                    name={report.type === "blood_test" ? "test-tube" : "pill"}
                    size={16} color={report.type === "blood_test" ? "#4F7BFF" : "#9A6CFF"}
                  />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600" }} numberOfLines={1}>
                      {report.file_name}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>
                      {report.type === "blood_test" ? "Lab Report" : "Doctor's Prescription"} · {report.date}
                    </Text>
                  </View>
                  <Pressable onPress={() => { void removeReport(report.id); }} style={{ padding: 6 }}>
                    <MaterialCommunityIcons name="trash-can-outline" size={18} color="#FF4158" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          <View style={{ marginTop: 12, gap: 10 }}>
            <ScaleButton
              label={isAnalyzingAi ? "Analyzing..." : "Analyze Reports with AI"}
              onPress={() => { clearAiError(); void runAiPersonalization(); }}
            />

            {isAnalyzingAi && (
              <View style={{
                borderRadius: 14, borderWidth: 1, borderColor: "rgba(79,123,255,0.30)",
                backgroundColor: "rgba(79,123,255,0.08)", padding: 12
              }}>
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }}>
                  AI Personalization Running
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
                  {AI_ANALYSIS_PROGRESS_STEPS[analysisStepIndex]}...
                </Text>
                <View style={{ flexDirection: "row", gap: 4, marginTop: 10 }}>
                  {AI_ANALYSIS_PROGRESS_STEPS.map((_, index) => (
                    <View
                      key={index}
                      style={{
                        height: 3, flex: 1, borderRadius: 2,
                        backgroundColor: index <= analysisStepIndex ? colors.accentBlue : colors.cardMuted
                      }}
                    />
                  ))}
                </View>
              </View>
            )}

            {aiError && (
              <View style={{
                borderRadius: 14, borderWidth: 1,
                borderColor: aiError === "rate_limit" ? "rgba(255,180,0,0.35)" : "rgba(239,71,111,0.25)",
                backgroundColor: aiError === "rate_limit" ? "rgba(255,180,0,0.08)" : "rgba(239,71,111,0.08)",
                padding: 12
              }}>
                {aiError === "rate_limit" ? (
                  <>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <MaterialCommunityIcons name="clock-outline" size={16} color="#FFB238" />
                      <Text style={{ color: "#FFB238", fontSize: 13, fontWeight: "700" }}>
                        Rate Limit Reached
                      </Text>
                    </View>
                    <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
                      Gemini free tier: 15 requests/min · resets daily at midnight PT
                    </Text>
                    {countdown !== null && countdown > 0 && (
                      <View style={{
                        flexDirection: "row", alignItems: "center", gap: 6,
                        marginTop: 10, backgroundColor: "rgba(255,178,56,0.12)",
                        borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8
                      }}>
                        <MaterialCommunityIcons name="timer-outline" size={16} color="#FFB238" />
                        <Text style={{ color: "#FFB238", fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                          {countdown}s
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                          until retry available
                        </Text>
                      </View>
                    )}
                    <Animated.View style={[{ marginTop: 10 }, retryGlowStyle]}>
                      <Pressable
                        onPress={() => { if (countdown === 0) { clearAiError(); void runAiPersonalization(); } }}
                        disabled={countdown !== 0}
                        style={{
                          borderRadius: 12, paddingVertical: 11, alignItems: "center",
                          backgroundColor: countdown === 0 ? "#FFB238" : colors.cardMuted,
                          borderWidth: countdown === 0 ? 0 : 1,
                          borderColor: colors.border,
                          shadowColor: "#FFB238",
                        }}
                      >
                        <Text style={{
                          fontSize: 13, fontWeight: "700",
                          color: countdown === 0 ? "#000" : colors.textMuted
                        }}>
                          {countdown === 0 ? "⚡ Retry Now" : `Retry in ${countdown}s`}
                        </Text>
                      </Pressable>
                    </Animated.View>
                  </>
                ) : (
                  <>
                    <Text style={{ color: "#EF476F", fontSize: 12 }}>{aiError}</Text>
                    <View style={{ marginTop: 10 }}>
                      <ScaleButton label="Retry" onPress={() => { clearAiError(); void runAiPersonalization(); }} variant="secondary" />
                    </View>
                  </>
                )}
              </View>
            )}

            {aiPersonalization && (
              <Text style={{ color: colors.textMuted, fontSize: 10, textAlign: "center" }}>
                Last analyzed: {new Date(aiPersonalization.generated_at).toLocaleString()}
              </Text>
            )}
          </View>
        </SectionCard>
      </Animated.View>
    </ScrollView>
  );
}
