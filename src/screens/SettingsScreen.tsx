import { useState } from "react";
import { Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { HealthCondition, UserProfileInput } from "../types/health";
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
import { cancelAllReminders, setupHealthReminders } from "../services/notificationService";

type GoalCardProps = {
  label: string;
  active: boolean;
  onPress: () => void;
};

function GoalCard({ label, active, onPress }: GoalCardProps): JSX.Element {
  return (
    <Pressable onPress={onPress} className="flex-1">
      <LinearGradient
        colors={active ? ["rgba(79,123,255,0.35)", "rgba(154,108,255,0.25)"] : ["#1A1A24", "#161620"]}
        style={{
          borderRadius: 16,
          borderWidth: 1,
          borderColor: active ? "rgba(255,255,255,0.24)" : "rgba(255,255,255,0.08)",
          paddingVertical: 12,
          paddingHorizontal: 10
        }}
      >
        <Text className="text-white text-sm font-semibold text-center">{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

type SettingsScreenProps = {
  onClose: () => void;
};

export function SettingsScreen({ onClose }: SettingsScreenProps): JSX.Element {
  const profile = useHealthStore((state) => state.profile);
  const saveProfile = useHealthStore((state) => state.saveProfile);

  const [age, setAge] = useState(String(profile?.age ?? 28));
  const [weight, setWeight] = useState(String(profile?.weight ?? 70));
  const [height, setHeight] = useState(String(profile?.height ?? 170));
  const [goal, setGoal] = useState<UserProfileInput["goal"]>(profile?.goal ?? "general_fitness");
  const [conditions, setConditions] = useState<HealthCondition[]>(profile?.conditions ?? []);
  const [isSaving, setIsSaving] = useState(false);
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);

  function toggleCondition(condition: HealthCondition): void {
    setConditions((current) =>
      current.includes(condition)
        ? current.filter((item) => item !== condition)
        : [...current, condition]
    );
  }

  async function handleSave(): Promise<void> {
    const parsedAge = Number(age);
    const parsedWeight = Number(weight);
    const parsedHeight = Number(height);

    if (
      !Number.isFinite(parsedAge) ||
      !Number.isFinite(parsedWeight) ||
      !Number.isFinite(parsedHeight)
    ) {
      Alert.alert("Invalid Input", "Please enter valid numbers for age, weight, and height.");
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
      Alert.alert("Saved", "Your profile has been updated.", [{ text: "OK", onPress: onClose }]);
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
          setRemindersEnabled(true);
          Alert.alert("Reminders On", "Daily reminders set for 9 AM and 8 PM.");
        } else {
          Alert.alert("Permission Denied", "Please allow notifications in your device settings.");
        }
      } else {
        await cancelAllReminders();
        setRemindersEnabled(false);
      }
    } finally {
      setNotifLoading(false);
    }
  }

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-row items-center justify-between mt-2 mb-6">
        <Text className="text-white text-2xl font-bold">Settings</Text>
        <Pressable onPress={onClose} className="rounded-full p-2 bg-cardMuted border border-white/10">
          <MaterialCommunityIcons name="close" size={18} color="#A8A8BF" />
        </Pressable>
      </View>

      {/* Basic Profile */}
      <View className="rounded-2xl border border-white/10 bg-card/80 p-4 mb-4">
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

      {/* Primary Goal */}
      <View className="rounded-2xl border border-white/10 bg-card/80 p-4 mb-4">
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

      {/* Notifications */}
      <View className="rounded-2xl border border-white/10 bg-card/80 p-4 mb-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <MaterialCommunityIcons name="bell-outline" size={20} color="#9A6CFF" />
            <View className="ml-3">
              <Text className="text-white font-semibold">Daily Reminders</Text>
              <Text className="text-textMuted text-xs mt-0.5">9 AM log reminder · 8 PM water check</Text>
            </View>
          </View>
          <Switch
            value={remindersEnabled}
            onValueChange={(v) => { void handleToggleReminders(v); }}
            disabled={notifLoading}
            trackColor={{ false: "#2A2A3A", true: "#4F7BFF" }}
            thumbColor={remindersEnabled ? "#ffffff" : "#666680"}
          />
        </View>
      </View>

      {/* Conditions */}
      <View className="rounded-2xl border border-white/10 bg-card/80 p-4 mb-6">
        <Text className="text-white text-lg font-semibold">Health Conditions</Text>
        <Text className="text-textMuted text-sm mt-1">
          These determine which medical metrics are tracked.
        </Text>
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

      {/* Save Button */}
      <Pressable
        onPress={() => { void handleSave(); }}
        disabled={isSaving}
        className="rounded-2xl bg-accentBlue py-4 items-center"
      >
        <Text className="text-white text-base font-semibold">
          {isSaving ? "Saving..." : "Save Changes"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
