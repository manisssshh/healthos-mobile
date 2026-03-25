import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ProgressBar } from "../components/ProgressBar";
import { useHealthStore } from "../store/useHealthStore";
import {
  MAX_CALORIES_ENTRY,
  MAX_FOOD_INTAKE_LENGTH,
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

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type ScaleButtonProps = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
};

function ScaleButton({ label, onPress, variant = "primary" }: ScaleButtonProps): JSX.Element {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  const buttonClass =
    variant === "primary"
      ? "rounded-2xl px-4 py-3 bg-accentBlue"
      : "rounded-2xl px-4 py-3 bg-cardMuted border border-white/10";
  const textClass = variant === "primary" ? "text-white font-semibold" : "text-textMuted font-semibold";

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withTiming(0.96, { duration: 90 });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 120 });
      }}
      style={animatedStyle}
      className={buttonClass}
    >
      <Text className={textClass}>{label}</Text>
    </AnimatedPressable>
  );
}

export function LogScreen(): JSX.Element {
  const todayRecord = useHealthStore((state) => state.todayRecord);
  const activeMetrics = useHealthStore((state) => state.activeMetrics);
  const reports = useHealthStore((state) => state.reports);
  const aiPersonalization = useHealthStore((state) => state.aiPersonalization);
  const isAnalyzingAi = useHealthStore((state) => state.isAnalyzingAi);
  const aiError = useHealthStore((state) => state.aiError);
  const clearAiError = useHealthStore((state) => state.clearAiError);
  const runAiPersonalization = useHealthStore((state) => state.runAiPersonalization);
  const addReport = useHealthStore((state) => state.addReport);
  const removeReport = useHealthStore((state) => state.removeReport);
  const addWater = useHealthStore((state) => state.addWater);
  const setSteps = useHealthStore((state) => state.setSteps);
  const setSleep = useHealthStore((state) => state.setSleep);
  const setCalories = useHealthStore((state) => state.setCalories);
  const setWeight = useHealthStore((state) => state.setWeight);
  const setFoodIntake = useHealthStore((state) => state.setFoodIntake);
  const setBloodPressure = useHealthStore((state) => state.setBloodPressure);
  const setHeartRate = useHealthStore((state) => state.setHeartRate);
  const setBloodSugar = useHealthStore((state) => state.setBloodSugar);
  const resetToday = useHealthStore((state) => state.resetToday);

  const [customWater, setCustomWater] = useState("");
  const [stepsInput, setStepsInput] = useState("");
  const [sleepInput, setSleepInput] = useState("");
  const [caloriesInput, setCaloriesInput] = useState("");
  const [weightInput, setWeightInput] = useState("");
  const [foodIntakeInput, setFoodIntakeInput] = useState("");
  
  const [bpSysInput, setBpSysInput] = useState("");
  const [bpDiaInput, setBpDiaInput] = useState("");
  const [heartRateInput, setHeartRateInput] = useState("");
  const [bloodSugarInput, setBloodSugarInput] = useState("");
  const [uploadingType, setUploadingType] = useState<ReportType | null>(null);
  const [analysisStepIndex, setAnalysisStepIndex] = useState(0);

  const shouldTrackCalories = useMemo(
    () => activeMetrics.includes("calories"),
    [activeMetrics]
  );
  const shouldTrackWeight = useMemo(() => activeMetrics.includes("weight"), [activeMetrics]);
  const shouldTrackBp = useMemo(() => activeMetrics.includes("blood_pressure_sys") || activeMetrics.includes("blood_pressure_dia"), [activeMetrics]);
  const shouldTrackHr = useMemo(() => activeMetrics.includes("heart_rate"), [activeMetrics]);
  const shouldTrackSugar = useMemo(() => activeMetrics.includes("blood_sugar"), [activeMetrics]);
  const waterGoal = useMemo(() => {
    const target = aiPersonalization?.metric_targets?.water;
    if (typeof target === "number" && Number.isFinite(target) && target > 0) {
      return Math.round(target);
    }
    return WATER_GOAL_ML;
  }, [aiPersonalization?.metric_targets?.water]);

  useEffect(() => {
    if (!todayRecord) {
      return;
    }
    setStepsInput(String(todayRecord.steps || ""));
    setSleepInput(todayRecord.sleep_hours ? String(todayRecord.sleep_hours) : "");
    setCaloriesInput(String(todayRecord.calories || ""));
    setWeightInput(todayRecord.weight_kg ? String(todayRecord.weight_kg) : "");
    setFoodIntakeInput(todayRecord.food_intake || "");
    setBpSysInput(todayRecord.blood_pressure_sys ? String(todayRecord.blood_pressure_sys) : "");
    setBpDiaInput(todayRecord.blood_pressure_dia ? String(todayRecord.blood_pressure_dia) : "");
    setHeartRateInput(todayRecord.heart_rate ? String(todayRecord.heart_rate) : "");
    setBloodSugarInput(todayRecord.blood_sugar ? String(todayRecord.blood_sugar) : "");
  }, [todayRecord]);

  useEffect(() => {
    if (!isAnalyzingAi) {
      setAnalysisStepIndex(0);
      return;
    }

    const timer = setInterval(() => {
      setAnalysisStepIndex((current) => (current + 1) % AI_ANALYSIS_PROGRESS_STEPS.length);
    }, 1500);

    return () => clearInterval(timer);
  }, [isAnalyzingAi]);

  if (!todayRecord) {
    return <View className="flex-1" />;
  }

  async function onUploadReport(type: ReportType): Promise<void> {
    try {
      setUploadingType(type);
      const picked = await pickAndStoreReportFile();
      if (!picked) {
        return;
      }
      await addReport({
        file_url: picked.fileUrl,
        file_name: picked.fileName,
        type,
        date: getTodayDateKey()
      });
    } finally {
      setUploadingType(null);
    }
  }

  async function onAddCustomWater(): Promise<void> {
    const parsed = Number(customWater);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }
    await addWater(parsed);
    setCustomWater("");
  }

  async function onSaveSteps(): Promise<void> {
    const parsed = Number(stepsInput);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return;
    }
    await setSteps(parsed);
  }

  async function onSaveSleep(): Promise<void> {
    const parsed = Number(sleepInput);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return;
    }
    await setSleep(parsed);
  }

  async function onSaveCalories(): Promise<void> {
    const parsed = Number(caloriesInput);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return;
    }
    await setCalories(parsed);
  }

  async function onSaveWeight(): Promise<void> {
    const parsed = Number(weightInput);
    if (!Number.isFinite(parsed) || parsed < WEIGHT_MIN) {
      return;
    }
    await setWeight(parsed);
  }

  async function onSaveBloodPressure(): Promise<void> {
    const sys = Number(bpSysInput);
    const dia = Number(bpDiaInput);
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

  async function onSaveFoodIntake(): Promise<void> {
    await setFoodIntake(foodIntakeInput);
  }

  async function onAnalyzeReports(): Promise<void> {
    clearAiError();
    await runAiPersonalization();
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingBottom: 122, gap: 14 }}
      showsVerticalScrollIndicator={false}
    >
      <Text className="text-white text-2xl font-bold mt-2">Daily Tracking</Text>
      <Text className="text-textMuted text-sm">
        Inputs are personalized based on your goals and conditions.
      </Text>

      <View className="rounded-2xl border border-white/10 bg-card/80 p-4">
        <Text className="text-white text-lg font-semibold">Water</Text>
        <Text className="text-textMuted text-sm mt-1">Goal: {waterGoal}ml per day</Text>
        <View className="mt-4">
          <ProgressBar label="Hydration" value={todayRecord.water_ml} goal={waterGoal} />
        </View>

        <View className="mt-4 flex-row" style={{ gap: 10 }}>
          <ScaleButton label="+250ml" onPress={() => addWater(250)} />
          <ScaleButton label="+500ml" onPress={() => addWater(500)} />
        </View>

        <View className="mt-4 flex-row items-center" style={{ gap: 10 }}>
          <TextInput
            value={customWater}
            onChangeText={setCustomWater}
            keyboardType="numeric"
            placeholder="Custom ml"
            placeholderTextColor="#777792"
            maxLength={String(MAX_WATER_ML_ENTRY).length}
            className="flex-1 rounded-2xl border border-white/10 bg-cardMuted px-4 py-3 text-white"
          />
          <ScaleButton label="Add" onPress={onAddCustomWater} />
        </View>

        <View className="mt-3">
          <ScaleButton label="Reset Today" onPress={resetToday} variant="secondary" />
        </View>
      </View>

      <View className="rounded-2xl border border-white/10 bg-card/80 p-4">
        <Text className="text-white text-lg font-semibold">Steps</Text>
        <Text className="text-textMuted text-sm mt-1">Max entry {MAX_STEPS_ENTRY}.</Text>
        <View className="mt-3 flex-row items-center" style={{ gap: 10 }}>
          <TextInput
            value={stepsInput}
            onChangeText={setStepsInput}
            keyboardType="numeric"
            placeholder="Enter steps"
            placeholderTextColor="#777792"
            maxLength={String(MAX_STEPS_ENTRY).length}
            className="flex-1 rounded-2xl border border-white/10 bg-cardMuted px-4 py-3 text-white"
          />
          <ScaleButton label="Save" onPress={onSaveSteps} />
        </View>
      </View>

      <View className="rounded-2xl border border-white/10 bg-card/80 p-4">
        <Text className="text-white text-lg font-semibold">Sleep</Text>
        <Text className="text-textMuted text-sm mt-1">Max {MAX_SLEEP_HOURS_ENTRY} hrs.</Text>
        <View className="mt-3 flex-row items-center" style={{ gap: 10 }}>
          <TextInput
            value={sleepInput}
            onChangeText={setSleepInput}
            keyboardType="decimal-pad"
            placeholder="e.g. 7.5"
            placeholderTextColor="#777792"
            maxLength={4}
            className="flex-1 rounded-2xl border border-white/10 bg-cardMuted px-4 py-3 text-white"
          />
          <ScaleButton label="Save" onPress={onSaveSleep} />
        </View>
      </View>

      {shouldTrackCalories && (
        <>
          <View className="rounded-2xl border border-white/10 bg-card/80 p-4">
            <Text className="text-white text-lg font-semibold">Calories</Text>
            <Text className="text-textMuted text-sm mt-1">
              Track intake for your active profile. Max {MAX_CALORIES_ENTRY} kcal.
            </Text>
            <View className="mt-3 flex-row items-center" style={{ gap: 10 }}>
              <TextInput
                value={caloriesInput}
                onChangeText={setCaloriesInput}
                keyboardType="numeric"
                placeholder="Enter calories"
                placeholderTextColor="#777792"
                maxLength={String(MAX_CALORIES_ENTRY).length}
                className="flex-1 rounded-2xl border border-white/10 bg-cardMuted px-4 py-3 text-white"
              />
              <ScaleButton label="Save" onPress={onSaveCalories} />
            </View>
          </View>

          <View className="rounded-2xl border border-white/10 bg-card/80 p-4">
            <Text className="text-white text-lg font-semibold">Food Intake</Text>
            <Text className="text-textMuted text-sm mt-1">
              Keep meal notes. Max {MAX_FOOD_INTAKE_LENGTH} characters.
            </Text>
            <View className="mt-3">
              <TextInput
                value={foodIntakeInput}
                onChangeText={setFoodIntakeInput}
                placeholder="Example: oats + eggs, grilled chicken + rice..."
                placeholderTextColor="#777792"
                multiline
                maxLength={MAX_FOOD_INTAKE_LENGTH}
                style={{ textAlignVertical: "top", minHeight: 96 }}
                className="rounded-2xl border border-white/10 bg-cardMuted px-4 py-3 text-white"
              />
            </View>
            <View className="mt-2 flex-row justify-between items-center">
              <Text className="text-textMuted text-xs">
                {foodIntakeInput.length}/{MAX_FOOD_INTAKE_LENGTH}
              </Text>
              <ScaleButton label="Save Food Log" onPress={onSaveFoodIntake} />
            </View>
          </View>
        </>
      )}

      {shouldTrackWeight && (
        <View className="rounded-2xl border border-white/10 bg-card/80 p-4">
          <Text className="text-white text-lg font-semibold">Weight</Text>
          <Text className="text-textMuted text-sm mt-1">
            Track body weight for goal progress. Max {MAX_WEIGHT_ENTRY} kg.
          </Text>
          <View className="mt-3 flex-row items-center" style={{ gap: 10 }}>
            <TextInput
              value={weightInput}
              onChangeText={setWeightInput}
              keyboardType="decimal-pad"
              placeholder="Enter weight"
              placeholderTextColor="#777792"
              maxLength={5}
              className="flex-1 rounded-2xl border border-white/10 bg-cardMuted px-4 py-3 text-white"
            />
            <ScaleButton label="Save" onPress={onSaveWeight} />
          </View>
        </View>
      )}

      {shouldTrackBp && (
        <View className="rounded-2xl border border-white/10 bg-card/80 p-4">
          <Text className="text-white text-lg font-semibold">Blood Pressure</Text>
          <Text className="text-textMuted text-sm mt-1">
            Track systolic and diastolic pressure (mmHg).
          </Text>
          <View className="mt-3 flex-row items-center" style={{ gap: 10 }}>
            <TextInput
              value={bpSysInput}
              onChangeText={setBpSysInput}
              keyboardType="numeric"
              placeholder="Sys"
              placeholderTextColor="#777792"
              maxLength={3}
              className="flex-1 rounded-2xl border border-white/10 bg-cardMuted px-4 py-3 text-white"
            />
            <Text className="text-textMuted text-lg">/</Text>
            <TextInput
              value={bpDiaInput}
              onChangeText={setBpDiaInput}
              keyboardType="numeric"
              placeholder="Dia"
              placeholderTextColor="#777792"
              maxLength={3}
              className="flex-1 rounded-2xl border border-white/10 bg-cardMuted px-4 py-3 text-white"
            />
            <ScaleButton label="Save" onPress={onSaveBloodPressure} />
          </View>
        </View>
      )}

      {shouldTrackHr && (
        <View className="rounded-2xl border border-white/10 bg-card/80 p-4">
          <Text className="text-white text-lg font-semibold">Heart Rate</Text>
          <Text className="text-textMuted text-sm mt-1">Track resting heart rate (bpm).</Text>
          <View className="mt-3 flex-row items-center" style={{ gap: 10 }}>
            <TextInput
              value={heartRateInput}
              onChangeText={setHeartRateInput}
              keyboardType="numeric"
              placeholder="Enter BPM"
              placeholderTextColor="#777792"
              maxLength={3}
              className="flex-1 rounded-2xl border border-white/10 bg-cardMuted px-4 py-3 text-white"
            />
            <ScaleButton label="Save" onPress={onSaveHeartRate} />
          </View>
        </View>
      )}

      {shouldTrackSugar && (
        <View className="rounded-2xl border border-white/10 bg-card/80 p-4">
          <Text className="text-white text-lg font-semibold">Fasting Blood Sugar</Text>
          <Text className="text-textMuted text-sm mt-1">Track glycemic control (mg/dL).</Text>
          <View className="mt-3 flex-row items-center" style={{ gap: 10 }}>
            <TextInput
              value={bloodSugarInput}
              onChangeText={setBloodSugarInput}
              keyboardType="numeric"
              placeholder="Enter mg/dL"
              placeholderTextColor="#777792"
              maxLength={3}
              className="flex-1 rounded-2xl border border-white/10 bg-cardMuted px-4 py-3 text-white"
            />
            <ScaleButton label="Save" onPress={onSaveBloodSugar} />
          </View>
        </View>
      )}

      <View className="rounded-2xl border border-white/10 bg-card/80 p-4">
        <Text className="text-white text-lg font-semibold">Health Reports</Text>
        <Text className="text-textMuted text-sm mt-1">Upload and tag reports for monitoring context.</Text>

        <View className="mt-3 flex-row" style={{ gap: 10 }}>
          <Pressable
            onPress={() => onUploadReport("blood_test")}
            className="flex-1 rounded-xl border border-white/10 bg-cardMuted px-3 py-3 items-center"
          >
            {uploadingType === "blood_test" ? (
              <ActivityIndicator color="#4F7BFF" />
            ) : (
              <>
                <MaterialCommunityIcons name="test-tube" size={18} color="#4F7BFF" />
                <Text className="text-white text-sm mt-1">Blood Test</Text>
              </>
            )}
          </Pressable>

          <Pressable
            onPress={() => onUploadReport("prescription")}
            className="flex-1 rounded-xl border border-white/10 bg-cardMuted px-3 py-3 items-center"
          >
            {uploadingType === "prescription" ? (
              <ActivityIndicator color="#9A6CFF" />
            ) : (
              <>
                <MaterialCommunityIcons name="file-document-outline" size={18} color="#9A6CFF" />
                <Text className="text-white text-sm mt-1">Prescription</Text>
              </>
            )}
          </Pressable>
        </View>

        {!!reports.length && (
          <View className="mt-4" style={{ gap: 8 }}>
            {reports.slice(0, 4).map((report) => (
              <View
                key={report.id}
                className="rounded-xl border border-white/10 bg-cardMuted/70 p-3 flex-row justify-between items-center"
              >
                <View className="flex-1 mr-2">
                  <Text className="text-white" numberOfLines={1}>
                    {report.file_name}
                  </Text>
                  <Text className="text-textMuted text-xs mt-0.5">
                    {report.type.replace("_", " ")}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    void removeReport(report.id);
                  }}
                  className="p-2"
                >
                  <MaterialCommunityIcons name="trash-can-outline" size={20} color="#FF6C6C" />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <View className="mt-4" style={{ gap: 10 }}>
          <ScaleButton
            label={isAnalyzingAi ? "Analyzing Reports..." : "Analyze Reports with AI"}
            onPress={() => {
              void onAnalyzeReports();
            }}
            variant="primary"
          />

          {isAnalyzingAi ? (
            <View className="rounded-xl border border-accentBlue/30 bg-accentBlue/10 px-3 py-3">
              <Text className="text-white text-sm font-semibold">AI Personalization Running</Text>
              <Text className="text-textMuted text-sm mt-1">
                {AI_ANALYSIS_PROGRESS_STEPS[analysisStepIndex]}...
              </Text>
              <View className="mt-3 flex-row" style={{ gap: 6 }}>
                {AI_ANALYSIS_PROGRESS_STEPS.map((step, index) => (
                  <View
                    key={step}
                    className={`h-1.5 flex-1 rounded-full ${
                      index <= analysisStepIndex ? "bg-accentBlue" : "bg-cardMuted"
                    }`}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {aiError ? (
            <View className="rounded-xl border border-red-400/25 bg-red-400/10 px-3 py-3">
              <Text className="text-red-200 text-sm">{aiError}</Text>
              <View className="mt-3">
                <ScaleButton
                  label="Retry AI Analysis"
                  onPress={() => {
                    void onAnalyzeReports();
                  }}
                  variant="secondary"
                />
              </View>
            </View>
          ) : null}

          {aiPersonalization ? (
            <Text className="text-textMuted text-xs">
              Last personalized {new Date(aiPersonalization.generated_at).toLocaleString()}.
            </Text>
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}
