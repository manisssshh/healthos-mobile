import "./global.css";

import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useState } from "react";
import { AppState, AppStateStatus, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { HomeScreen } from "./src/screens/HomeScreen";
import { LogScreen } from "./src/screens/LogScreen";
import { AnalyticsScreen } from "./src/screens/AnalyticsScreen";
import { SetupScreen } from "./src/screens/SetupScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { useHealthStore } from "./src/store/useHealthStore";

type TabKey = "home" | "log" | "analytics" | "settings";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type TabButtonProps = {
  active: boolean;
  label: string;
  icon: string;
  onPress: () => void;
};

function TabButton({ active, label, icon, onPress }: TabButtonProps): JSX.Element {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

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
      className={`flex-1 rounded-2xl py-3 items-center ${
        active ? "bg-white/10 border border-white/20" : "bg-transparent"
      }`}
    >
      <MaterialCommunityIcons
        name={icon as never}
        size={16}
        color={active ? "#ffffff" : "#A8A8BF"}
      />
      <Text className={`mt-1 ${active ? "text-white font-semibold" : "text-textMuted font-semibold"}`}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

export default function App(): JSX.Element {
  const initialize = useHealthStore((state) => state.initialize);
  const ensureTodayRecord = useHealthStore((state) => state.ensureTodayRecord);
  const profile = useHealthStore((state) => state.profile);
  const isLoading = useHealthStore((state) => state.isLoading);
  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "active") {
        ensureTodayRecord();
      }
    });
    return () => subscription.remove();
  }, [ensureTodayRecord]);

  const activeScreen = useMemo(() => {
    if (activeTab === "home") {
      return <HomeScreen />;
    }
    if (activeTab === "log") {
      return <LogScreen />;
    }
    return <AnalyticsScreen />;
  }, [activeTab]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <View className="flex-1 bg-background">
        <LinearGradient
          colors={["rgba(154,108,255,0.22)", "rgba(79,123,255,0.15)", "rgba(11,11,15,1)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <SafeAreaView className="flex-1 px-5 pt-2">
          {isLoading ? (
            <View className="flex-1 items-center justify-center">
              <Text className="text-white text-lg font-semibold">Loading HealthOS...</Text>
            </View>
          ) : !profile ? (
            <Animated.View entering={FadeIn.duration(300)} className="flex-1">
              <SetupScreen />
            </Animated.View>
          ) : showSettings ? (
            <Animated.View entering={FadeIn.duration(200)} className="flex-1">
              <SettingsScreen onClose={() => setShowSettings(false)} />
            </Animated.View>
          ) : (
            <Animated.View entering={FadeIn.duration(300)} className="flex-1">
              {activeScreen}
            </Animated.View>
          )}

          {profile ? (
            <View className="absolute bottom-6 left-5 right-5 rounded-3xl border border-white/15 bg-card/95 p-2 flex-row">
              <TabButton
                active={activeTab === "home" && !showSettings}
                icon="heart-pulse"
                label="Home"
                onPress={() => { setShowSettings(false); setActiveTab("home"); }}
              />
              <TabButton
                active={activeTab === "log" && !showSettings}
                icon="clipboard-text-clock-outline"
                label="Log"
                onPress={() => { setShowSettings(false); setActiveTab("log"); }}
              />
              <TabButton
                active={activeTab === "analytics" && !showSettings}
                icon="chart-line"
                label="Analytics"
                onPress={() => { setShowSettings(false); setActiveTab("analytics"); }}
              />
              <TabButton
                active={showSettings}
                icon="cog-outline"
                label="Settings"
                onPress={() => setShowSettings(true)}
              />
            </View>
          ) : null}
        </SafeAreaView>
      </View>
    </SafeAreaProvider>
  );
}
