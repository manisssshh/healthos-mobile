import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Theme Palettes ───────────────────────────────────────────────────────────

export type ThemeColors = {
  background: string;
  surface: string;
  card: string;
  cardMuted: string;
  border: string;
  borderStrong: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  accentBlue: string;
  accentPurple: string;
  success: string;
  // Performance zones
  zoneHigh: string;
  zoneMid: string;
  zoneLow: string;
  // Overlay tints
  overlayLight: string;
};

export const DARK_THEME: ThemeColors = {
  background: "#060608",
  surface: "#0E0E14",
  card: "#12121A",
  cardMuted: "#1A1A25",
  border: "rgba(255,255,255,0.07)",
  borderStrong: "rgba(255,255,255,0.15)",
  text: "#FFFFFF",
  textSecondary: "#E0E0F0",
  textMuted: "#7A7A95",
  accentBlue: "#4F7BFF",
  accentPurple: "#9A6CFF",
  success: "#1AE5A7",
  zoneHigh: "#1AE5A7",
  zoneMid: "#FFB238",
  zoneLow: "#FF4158",
  overlayLight: "rgba(255,255,255,0.05)",
};

export const LIGHT_THEME: ThemeColors = {
  background: "#F0F2F8",
  surface: "#FFFFFF",
  card: "#FFFFFF",
  cardMuted: "#F5F6FA",
  border: "rgba(0,0,0,0.07)",
  borderStrong: "rgba(0,0,0,0.15)",
  text: "#0B0B1F",
  textSecondary: "#2D2D4A",
  textMuted: "#6B7280",
  accentBlue: "#3D6AEE",
  accentPurple: "#7A52E8",
  success: "#00B884",
  zoneHigh: "#00B884",
  zoneMid: "#E09020",
  zoneLow: "#E03050",
  overlayLight: "rgba(0,0,0,0.04)",
};

// ─── Context ──────────────────────────────────────────────────────────────────

type ThemeContextType = {
  isDark: boolean;
  colors: ThemeColors;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType>({
  isDark: true,
  colors: DARK_THEME,
  toggleTheme: () => {}
});

const THEME_STORAGE_KEY = "healthos_theme_mode";

export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((stored) => {
      if (stored === "light") setIsDark(false);
    }).catch(() => {});
  }, []);

  function toggleTheme(): void {
    setIsDark((prev) => {
      const next = !prev;
      AsyncStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light").catch(() => {});
      return next;
    });
  }

  return (
    <ThemeContext.Provider value={{ isDark, colors: isDark ? DARK_THEME : LIGHT_THEME, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  return useContext(ThemeContext);
}
