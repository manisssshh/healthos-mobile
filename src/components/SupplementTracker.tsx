/**
 * SupplementTracker.tsx
 *
 * Compact daily supplement checklist grouped by timing.
 * Used on HomeScreen as an adherence widget.
 */
import { Pressable, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { useHealthStore } from "../store/useHealthStore";
import type { Supplement, SupplementLog, SupplementTiming } from "../types/health";

const TIMINGS: SupplementTiming[] = ["morning", "afternoon", "evening", "night"];

const TIMING_META: Record<SupplementTiming, { label: string; icon: string; color: string }> = {
  morning:   { label: "Morning",   icon: "weather-sunny",    color: "#FFB238" },
  afternoon: { label: "Afternoon", icon: "weather-partly-cloudy", color: "#4F7BFF" },
  evening:   { label: "Evening",   icon: "weather-sunset",   color: "#FF7043" },
  night:     { label: "Night",     icon: "weather-night",    color: "#9A6CFF" },
};

function isTaken(logs: SupplementLog[], supplementId: number, timing: SupplementTiming): boolean {
  return logs.some((l) => l.supplement_id === supplementId && l.timing === timing && l.taken_at !== null);
}

type Props = {
  compact?: boolean; // If true, show a mini summary ring instead of full list
};

export function SupplementTracker({ compact = false }: Props): JSX.Element {
  const { colors, isDark } = useTheme();
  const supplements         = useHealthStore((s) => s.supplements);
  const todaySupplementLogs = useHealthStore((s) => s.todaySupplementLogs);
  const markSupplementDose  = useHealthStore((s) => s.markSupplementDose);

  const active = supplements.filter((s) => s.is_active);

  // Compute total doses expected & taken today
  const totalDoses  = active.reduce((sum, s) => sum + s.timing.length, 0);
  const takenDoses  = active.reduce((sum, s) =>
    sum + s.timing.filter((t) => isTaken(todaySupplementLogs, s.id, t)).length, 0
  );
  const adherencePct = totalDoses > 0 ? Math.round((takenDoses / totalDoses) * 100) : 0;

  if (!active.length) {
    return (
      <View style={{
        backgroundColor: colors.cardMuted,
        borderRadius: 16, padding: 16,
        alignItems: "center", gap: 6
      }}>
        <MaterialCommunityIcons name="pill" size={28} color={colors.textMuted} />
        <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: "center" }}>
          No supplements yet. Upload a doctor's prescription to get started.
        </Text>
      </View>
    );
  }

  if (compact) {
    // Mini summary bar for HomeScreen widget
    const color = adherencePct >= 80 ? "#1AE5A7" : adherencePct >= 50 ? "#FFB238" : "#FF4158";
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{
          width: 44, height: 44, borderRadius: 22,
          borderWidth: 3, borderColor: color,
          alignItems: "center", justifyContent: "center",
          backgroundColor: `${color}15`,
        }}>
          <Text style={{ color, fontSize: 11, fontWeight: "800" }}>{adherencePct}%</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>
            {takenDoses}/{totalDoses} doses taken today
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
            {active.length} supplement{active.length !== 1 ? "s" : ""} prescribed
          </Text>
        </View>
        <MaterialCommunityIcons name="pill" size={20} color={colors.textMuted} />
      </View>
    );
  }

  // Full checklist grouped by timing
  const timingsWithSupps = TIMINGS.filter((t) =>
    active.some((s) => s.timing.includes(t))
  );

  return (
    <View style={{ gap: 16 }}>
      {timingsWithSupps.map((timing) => {
        const meta = TIMING_META[timing];
        const suppsForTiming = active.filter((s) => s.timing.includes(timing));
        return (
          <View key={timing}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <MaterialCommunityIcons name={meta.icon as never} size={14} color={meta.color} />
              <Text style={{ color: meta.color, fontSize: 11, fontWeight: "700", letterSpacing: 1 }}>
                {meta.label.toUpperCase()}
              </Text>
            </View>
            <View style={{ gap: 8 }}>
              {suppsForTiming.map((supp) => {
                const taken = isTaken(todaySupplementLogs, supp.id, timing);
                return (
                  <SupplementDoseRow
                    key={`${supp.id}-${timing}`}
                    supplement={supp}
                    timing={timing}
                    taken={taken}
                    onToggle={() => { void markSupplementDose(supp.id, timing, !taken); }}
                    colors={colors}
                    isDark={isDark}
                  />
                );
              })}
            </View>
          </View>
        );
      })}

      {/* Adherence footer */}
      <View style={{
        marginTop: 4, paddingTop: 12,
        borderTopWidth: 1, borderTopColor: colors.border,
        flexDirection: "row", justifyContent: "space-between", alignItems: "center"
      }}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          Today's adherence
        </Text>
        <Text style={{
          color: adherencePct >= 80 ? "#1AE5A7" : adherencePct >= 50 ? "#FFB238" : "#FF4158",
          fontSize: 14, fontWeight: "800"
        }}>
          {takenDoses}/{totalDoses} · {adherencePct}%
        </Text>
      </View>
    </View>
  );
}

// ─── Dose row ─────────────────────────────────────────────────────────────────

function SupplementDoseRow({ supplement, timing, taken, onToggle, colors, isDark }: {
  supplement: Supplement;
  timing: SupplementTiming;
  taken: boolean;
  onToggle: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
  isDark: boolean;
}): JSX.Element {
  const checkColor = "#1AE5A7";
  return (
    <Pressable
      onPress={onToggle}
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: taken
          ? (isDark ? "rgba(26,229,167,0.10)" : "rgba(26,229,167,0.08)")
          : colors.cardMuted,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: taken ? "rgba(26,229,167,0.30)" : colors.border,
        paddingHorizontal: 14,
        paddingVertical: 12,
        gap: 12,
      }}
    >
      {/* Checkbox */}
      <View style={{
        width: 22, height: 22, borderRadius: 11,
        backgroundColor: taken ? checkColor : "transparent",
        borderWidth: taken ? 0 : 2,
        borderColor: colors.textMuted,
        alignItems: "center", justifyContent: "center",
      }}>
        {taken && <MaterialCommunityIcons name="check" size={14} color="#000" />}
      </View>

      {/* Info */}
      <View style={{ flex: 1 }}>
        <Text style={{
          color: taken ? colors.textMuted : colors.text,
          fontSize: 13, fontWeight: "700",
          textDecorationLine: taken ? "line-through" : "none",
        }}>
          {supplement.name}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
          {supplement.dosage}
          {supplement.notes ? ` · ${supplement.notes}` : ""}
        </Text>
      </View>

      {taken && (
        <MaterialCommunityIcons name="check-circle" size={18} color={checkColor} />
      )}
    </Pressable>
  );
}
