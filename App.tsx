import "./global.css";

import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  AppStateStatus,
  Pressable,
  StyleSheet,
  Text,
  View,
  Animated as RNAnimated
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { HomeScreen } from "./src/screens/HomeScreen";
import { LogScreen } from "./src/screens/LogScreen";
import { AnalyticsScreen } from "./src/screens/AnalyticsScreen";
import { SetupScreen } from "./src/screens/SetupScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { SupplementsScreen } from "./src/screens/SupplementsScreen";
import { useHealthStore } from "./src/store/useHealthStore";
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import { HomeScreenSkeleton } from "./src/components/SkeletonLoader";

type TabKey = "home" | "log" | "meds" | "analytics" | "settings";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ─── Splash Screen ────────────────────────────────────────────────────────────

function SplashScreen({ onDone }: { onDone: () => void }): JSX.Element {
  const opacity = useRef(new RNAnimated.Value(0)).current;
  const scale   = useRef(new RNAnimated.Value(0.85)).current;
  const logoY   = useRef(new RNAnimated.Value(20)).current;

  useEffect(() => {
    RNAnimated.parallel([
      RNAnimated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      RNAnimated.spring(scale,   { toValue: 1, friction: 7, useNativeDriver: true }),
      RNAnimated.timing(logoY,   { toValue: 0, duration: 600, useNativeDriver: true })
    ]).start();

    const timer = setTimeout(() => {
      RNAnimated.timing(opacity, { toValue: 0, duration: 400, delay: 800, useNativeDriver: true }).start(onDone);
    }, 1800);

    return () => clearTimeout(timer);
  }, []);

  return (
    <RNAnimated.View style={[StyleSheet.absoluteFillObject, { opacity, backgroundColor: "#060608" }]}>
      <LinearGradient
        colors={["rgba(154,108,255,0.35)", "rgba(79,123,255,0.25)", "rgba(6,6,8,1)"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <RNAnimated.View style={{ transform: [{ scale }, { translateY: logoY }], alignItems: "center" }}>
          {/* Logo ring */}
          <View style={{
            width: 100, height: 100, borderRadius: 50,
            backgroundColor: "rgba(79,123,255,0.15)",
            borderWidth: 2, borderColor: "rgba(79,123,255,0.40)",
            alignItems: "center", justifyContent: "center",
            marginBottom: 20
          }}>
            <MaterialCommunityIcons name="heart-pulse" size={48} color="#4F7BFF" />
          </View>

          <Text style={{ color: "#FFFFFF", fontSize: 36, fontWeight: "900", letterSpacing: -1 }}>
            Health<Text style={{ color: "#4F7BFF" }}>OS</Text>
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, letterSpacing: 3, marginTop: 8 }}>
            AI-POWERED HEALTH TRACKING
          </Text>

          {/* Decorative dots */}
          <View style={{ flexDirection: "row", gap: 6, marginTop: 32 }}>
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                style={{
                  width: 6, height: 6, borderRadius: 3,
                  backgroundColor: i === 1 ? "#4F7BFF" : "rgba(255,255,255,0.25)"
                }}
              />
            ))}
          </View>
        </RNAnimated.View>
      </View>
    </RNAnimated.View>
  );
}

// ─── Tab Button ───────────────────────────────────────────────────────────────

type TabButtonProps = {
  active: boolean;
  label: string;
  icon: string;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
  isDark: boolean;
};

function TabButton({ active, label, icon, onPress, colors, isDark }: TabButtonProps): JSX.Element {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }));

  const activeColor = isDark ? "#FFFFFF" : colors.accentBlue;
  const activeBg = isDark ? "rgba(255,255,255,0.10)" : `${colors.accentBlue}18`;
  const activeBorder = isDark ? "rgba(255,255,255,0.15)" : `${colors.accentBlue}40`;

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => { scale.value = withSpring(0.94, { damping: 15 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 15 }); }}
      style={[
        animatedStyle,
        {
          flex: 1, borderRadius: 16, paddingVertical: 10,
          alignItems: "center",
          backgroundColor: active ? activeBg : "transparent",
          borderWidth: active ? 1 : 0,
          borderColor: activeBorder
        }
      ]}
    >
      <MaterialCommunityIcons
        name={icon as never}
        size={18}
        color={active ? activeColor : colors.textMuted}
      />
      <Text style={{
        marginTop: 3,
        color: active ? activeColor : colors.textMuted,
        fontSize: 10,
        fontWeight: "700",
        letterSpacing: 0.5
      }}>
        {label.toUpperCase()}
      </Text>
    </AnimatedPressable>
  );
}

// ─── Loading Skeleton Wrapper ─────────────────────────────────────────────────

function LoadingView(): JSX.Element {
  const { colors } = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={{ flex: 1, paddingHorizontal: 20 }}>
      <HomeScreenSkeleton />
    </Animated.View>
  );
}

// ─── Inner App ────────────────────────────────────────────────────────────────

function AppInner(): JSX.Element {
  const initialize       = useHealthStore((s) => s.initialize);
  const ensureTodayRecord = useHealthStore((s) => s.ensureTodayRecord);
  const profile          = useHealthStore((s) => s.profile);
  const isLoading        = useHealthStore((s) => s.isLoading);

  const [activeTab,     setActiveTab]     = useState<TabKey>("home");
  const [showSettings,  setShowSettings]  = useState(false);
  const [splashDone,    setSplashDone]    = useState(false);

  const { colors, isDark } = useTheme();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") ensureTodayRecord();
    });
    return () => sub.remove();
  }, [ensureTodayRecord]);

  const activeScreen = useMemo(() => {
    if (activeTab === "home")      return <HomeScreen />;
    if (activeTab === "log")       return <LogScreen />;
    if (activeTab === "meds")      return <SupplementsScreen />;
    if (activeTab === "analytics") return <AnalyticsScreen />;
    return <HomeScreen />;
  }, [activeTab]);

  const bgColors = isDark
    ? (["rgba(154,108,255,0.18)", "rgba(79,123,255,0.10)", "rgba(6,6,8,1)"] as const)
    : (["rgba(154,108,255,0.08)", "rgba(79,123,255,0.05)", "rgba(240,242,248,1)"] as const);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <LinearGradient
        colors={bgColors}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Splash */}
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}

      {splashDone && (
        <SafeAreaView style={{ flex: 1 }}>
          {isLoading ? (
            <LoadingView />
          ) : !profile ? (
            <Animated.View entering={FadeIn.duration(300)} style={{ flex: 1, paddingHorizontal: 20 }}>
              <SetupScreen />
            </Animated.View>
          ) : showSettings ? (
            <Animated.View entering={FadeIn.duration(200)} style={{ flex: 1, paddingHorizontal: 20 }}>
              <SettingsScreen onClose={() => setShowSettings(false)} />
            </Animated.View>
          ) : (
            <Animated.View entering={FadeIn.duration(300)} style={{ flex: 1, paddingHorizontal: 20 }}>
              {activeScreen}
            </Animated.View>
          )}

          {/* Bottom Tab Bar */}
          {profile && (
            <View style={{
              marginHorizontal: 16,
              marginBottom: 12,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: colors.borderStrong,
              backgroundColor: isDark ? "rgba(14,14,20,0.95)" : "rgba(255,255,255,0.95)",
              flexDirection: "row",
              padding: 6,
              gap: 2
            }}>
              {([
                { key: "home",      icon: "heart-pulse",           label: "Home" },
                { key: "log",       icon: "clipboard-edit-outline", label: "Log" },
                { key: "meds",      icon: "pill",                  label: "Meds" },
                { key: "analytics", icon: "chart-line",            label: "Progress" },
                { key: "settings",  icon: "cog-outline",           label: "Settings" }
              ] as const).map(({ key, icon, label }) => (
                <TabButton
                  key={key}
                  active={key === "settings" ? showSettings : (activeTab === key && !showSettings)}
                  icon={icon}
                  label={label}
                  colors={colors}
                  isDark={isDark}
                  onPress={() => {
                    if (key === "settings") {
                      setShowSettings(true);
                    } else {
                      setShowSettings(false);
                      setActiveTab(key as TabKey);
                    }
                  }}
                />
              ))}
            </View>
          )}
        </SafeAreaView>
      )}
    </View>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App(): JSX.Element {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppInner />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
