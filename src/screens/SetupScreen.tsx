import { useState } from "react";
import { Alert, ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { HealthCondition, ReportType, UserProfileInput } from "../types/health";
import {
  AGE_MAX,
  AGE_MIN,
  CONDITION_OPTIONS,
  GOAL_OPTIONS,
  HEIGHT_MAX,
  HEIGHT_MIN,
  WEIGHT_MAX,
  WEIGHT_MIN
} from "../types/health";
import { useHealthStore } from "../store/useHealthStore";
import { getTodayDateKey } from "../utils/dateUtils";
import { pickAndStoreReportFile } from "../services/reportFileService";
import { useTheme } from "../context/ThemeContext";

type GoalCardProps = {
  label: string;
  active: boolean;
  onPress: () => void;
};

function GoalCard({ label, active, onPress }: GoalCardProps): JSX.Element {
  const { colors, isDark } = useTheme();
  return (
    <Pressable onPress={onPress} style={{ flex: 1 }}>
      <LinearGradient
        colors={active ? ["rgba(79,123,255,0.35)", "rgba(154,108,255,0.25)"] : isDark ? ["#1A1A24", "#161620"] : [colors.card, colors.cardMuted]}
        style={{
          borderRadius: 16,
          borderWidth: 1,
          borderColor: active ? colors.borderStrong : colors.border,
          paddingVertical: 12,
          paddingHorizontal: 10
        }}
      >
        <Text style={{ color: active ? "#FFFFFF" : colors.text, fontSize: 14, fontWeight: "600", textAlign: "center" }}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

export function SetupScreen(): JSX.Element {
  const saveProfile = useHealthStore((state) => state.saveProfile);
  const addReport = useHealthStore((state) => state.addReport);
  const runAiPersonalization = useHealthStore((state) => state.runAiPersonalization);
  const reports = useHealthStore((state) => state.reports);
  const isAnalyzingAi = useHealthStore((state) => state.isAnalyzingAi);

  const [age, setAge] = useState("28");
  const [weight, setWeight] = useState("72");
  const [height, setHeight] = useState("175");
  const [goal, setGoal] = useState<UserProfileInput["goal"]>("general_fitness");
  const [conditions, setConditions] = useState<HealthCondition[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingType, setUploadingType] = useState<ReportType | null>(null);

  function toggleCondition(condition: HealthCondition): void {
    setConditions((current) =>
      current.includes(condition)
        ? current.filter((item) => item !== condition)
        : [...current, condition]
    );
  }

  async function handleUploadReport(type: ReportType): Promise<void> {
    try {
      setUploadingType(type);
      const picked = await pickAndStoreReportFile();
      if (!picked) return;
      await addReport({
        file_url: picked.fileUrl,
        file_name: picked.fileName,
        type,
        date: getTodayDateKey()
      });
    } catch {
      // silently ignore cancelled picker
    } finally {
      setUploadingType(null);
    }
  }

  async function handleContinue(): Promise<void> {
    const parsedAge = Number(age);
    const parsedWeight = Number(weight);
    const parsedHeight = Number(height);

    if (!Number.isFinite(parsedAge) || !Number.isFinite(parsedWeight) || !Number.isFinite(parsedHeight)) {
      Alert.alert("Invalid Input", "Please enter valid numbers for age, weight and height.");
      return;
    }

    if (parsedAge < AGE_MIN || parsedAge > AGE_MAX) {
      Alert.alert("Invalid Age", `Age must be between ${AGE_MIN} and ${AGE_MAX}.`);
      return;
    }

    if (parsedWeight < WEIGHT_MIN || parsedWeight > WEIGHT_MAX) {
      Alert.alert("Invalid Weight", `Weight must be between ${WEIGHT_MIN} and ${WEIGHT_MAX} kg.`);
      return;
    }

    if (parsedHeight < HEIGHT_MIN || parsedHeight > HEIGHT_MAX) {
      Alert.alert("Invalid Height", `Height must be between ${HEIGHT_MIN} and ${HEIGHT_MAX} cm.`);
      return;
    }

    setIsSaving(true);
    try {
      await saveProfile({
        age: parsedAge,
        weight: parsedWeight,
        height: parsedHeight,
        goal,
        conditions
      });

      if (reports.length) {
        await runAiPersonalization();
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <Text className="text-white text-3xl font-extrabold mt-2">Health Profile Setup</Text>
      <Text className="text-textMuted mt-2 leading-6">
        Set up your baseline so HealthOS can decide what to track like a doctor-guided system.
      </Text>

      <View className="mt-6 rounded-2xl border border-white/10 bg-card/80 p-4">
        <Text className="text-white text-lg font-semibold">Basic Profile</Text>

        <View className="mt-4 flex-row" style={{ gap: 10 }}>
          <View className="flex-1">
            <Text className="text-textMuted text-xs mb-2">Age</Text>
            <TextInput
              value={age}
              onChangeText={setAge}
              keyboardType="numeric"
              maxLength={2}
              className="rounded-xl border border-white/10 bg-cardMuted px-3 py-3 text-white"
            />
          </View>
          <View className="flex-1">
            <Text className="text-textMuted text-xs mb-2">Weight (kg)</Text>
            <TextInput
              value={weight}
              onChangeText={setWeight}
              keyboardType="decimal-pad"
              maxLength={5}
              className="rounded-xl border border-white/10 bg-cardMuted px-3 py-3 text-white"
            />
          </View>
          <View className="flex-1">
            <Text className="text-textMuted text-xs mb-2">Height (cm)</Text>
            <TextInput
              value={height}
              onChangeText={setHeight}
              keyboardType="numeric"
              maxLength={3}
              className="rounded-xl border border-white/10 bg-cardMuted px-3 py-3 text-white"
            />
          </View>
        </View>
      </View>

      <View className="mt-4 rounded-2xl border border-white/10 bg-card/80 p-4">
        <Text className="text-white text-lg font-semibold">Primary Goal</Text>
        <View className="mt-3" style={{ gap: 10 }}>
          <View className="flex-row" style={{ gap: 10 }}>
            {GOAL_OPTIONS.slice(0, 2).map((item) => (
              <GoalCard
                key={item.value}
                label={item.label}
                active={goal === item.value}
                onPress={() => setGoal(item.value)}
              />
            ))}
          </View>
          <View className="flex-row" style={{ gap: 10 }}>
            {GOAL_OPTIONS.slice(2).map((item) => (
              <GoalCard
                key={item.value}
                label={item.label}
                active={goal === item.value}
                onPress={() => setGoal(item.value)}
              />
            ))}
          </View>
        </View>
      </View>

      <View className="mt-4 rounded-2xl border border-white/10 bg-card/80 p-4">
        <Text className="text-white text-lg font-semibold">Conditions (Optional)</Text>
        <View className="mt-3 flex-row flex-wrap" style={{ gap: 8 }}>
          {CONDITION_OPTIONS.map((option) => {
            const selected = conditions.includes(option.value);
            return (
              <Pressable
                key={option.value}
                onPress={() => toggleCondition(option.value)}
                className={`rounded-full px-3 py-2 border ${
                  selected ? "bg-accentBlue/30 border-accentBlue/60" : "bg-cardMuted border-white/10"
                }`}
              >
                <Text className={selected ? "text-white" : "text-textMuted"}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="mt-4 rounded-2xl border border-white/10 bg-card/80 p-4">
        <Text className="text-white text-lg font-semibold">Health Reports</Text>
        <Text className="text-textMuted text-sm mt-1">Upload PDF or image and tag it.</Text>

        <View className="mt-3 flex-row" style={{ gap: 10 }}>
          <Pressable
            onPress={() => handleUploadReport("blood_test")}
            className="flex-1 rounded-xl border border-white/10 bg-cardMuted px-3 py-3"
          >
            {uploadingType === "blood_test" ? (
              <ActivityIndicator color="#4F7BFF" />
            ) : (
              <View className="items-center">
                <MaterialCommunityIcons name="test-tube" size={18} color="#4F7BFF" />
                <Text className="text-white mt-1 text-sm">Blood Test</Text>
              </View>
            )}
          </Pressable>

          <Pressable
            onPress={() => handleUploadReport("prescription")}
            className="flex-1 rounded-xl border border-white/10 bg-cardMuted px-3 py-3"
          >
            {uploadingType === "prescription" ? (
              <ActivityIndicator color="#9A6CFF" />
            ) : (
              <View className="items-center">
                <MaterialCommunityIcons name="file-document-outline" size={18} color="#9A6CFF" />
                <Text className="text-white mt-1 text-sm">Prescription</Text>
              </View>
            )}
          </Pressable>
        </View>

        {!!reports.length && (
          <View className="mt-4" style={{ gap: 8 }}>
            {reports.slice(0, 3).map((report) => (
              <View
                key={report.id}
                className="rounded-xl border border-white/10 bg-cardMuted/70 p-3 flex-row items-center justify-between"
              >
                <View className="flex-row items-center flex-1">
                  <MaterialCommunityIcons
                    name={report.type === "blood_test" ? "test-tube" : "file-document-outline"}
                    size={16}
                    color={report.type === "blood_test" ? "#4F7BFF" : "#9A6CFF"}
                  />
                  <Text className="text-white ml-2 flex-1" numberOfLines={1}>
                    {report.file_name}
                  </Text>
                </View>
                <Text className="text-textMuted text-xs">{report.date}</Text>
              </View>
            ))}
          </View>
        )}

        {isAnalyzingAi ? (
          <Text className="text-accentBlue mt-3 text-sm">
            AI is reading your reports and preparing personalized tracking targets.
          </Text>
        ) : null}
      </View>

      <Pressable
        onPress={handleContinue}
        disabled={isSaving || isAnalyzingAi}
        className="mt-5 rounded-2xl bg-accentBlue py-4 items-center"
      >
        {isSaving || isAnalyzingAi ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-white text-base font-semibold">Complete Setup</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}
