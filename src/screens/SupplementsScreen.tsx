/**
 * SupplementsScreen.tsx
 *
 * 3-tab screen:
 *   Tab 1 — Today's Meds: daily checklist grouped by timing
 *   Tab 2 — Doctor's Notes: diagnosis + recommendations
 *   Tab 3 — All Supplements: full list with delete
 */
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useState } from "react";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useHealthStore } from "../store/useHealthStore";
import { useTheme } from "../context/ThemeContext";
import { SupplementTracker } from "../components/SupplementTracker";
import type { DoctorNote, Supplement, SupplementTiming } from "../types/health";

type TabKey = "today" | "doctor" | "all";

const TIMING_ORDER: SupplementTiming[] = ["morning", "afternoon", "evening", "night"];
const TIMING_LABELS: Record<SupplementTiming, string> = {
  morning: "Morning", afternoon: "Afternoon", evening: "Evening", night: "Night",
};
const FREQUENCY_LABELS: Record<Supplement["frequency"], string> = {
  daily: "Daily", twice_daily: "Twice daily", weekly: "Weekly", as_needed: "As needed",
};

// ─── Tab pill ─────────────────────────────────────────────────────────────────

function TabPill({ label, active, onPress, colors }: {
  label: string; active: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
}): JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1, paddingVertical: 8, borderRadius: 12,
        backgroundColor: active ? colors.accentBlue : "transparent",
        alignItems: "center",
      }}
    >
      <Text style={{
        color: active ? "#FFFFFF" : colors.textMuted,
        fontSize: 12, fontWeight: "700",
      }}>
        {label}
      </Text>
    </Pressable>
  );
}

// ─── Today's Meds tab ─────────────────────────────────────────────────────────

function TodayMedsTab(): JSX.Element {
  const { colors } = useTheme();
  const supplements          = useHealthStore((s) => s.supplements);
  const isAnalyzing          = useHealthStore((s) => s.isAnalyzingSupplements);
  const supplementError      = useHealthStore((s) => s.supplementError);
  const analyzeDocPrescrip   = useHealthStore((s) => s.analyzeDocPrescriptions);
  const clearSupplementError = useHealthStore((s) => s.clearSupplementError);
  const reports              = useHealthStore((s) => s.reports);

  const hasPrescription = reports.some((r) => r.type === "prescription");
  const active = supplements.filter((s) => s.is_active);

  return (
    <View style={{ gap: 16 }}>
      {/* Error banner */}
      {supplementError ? (
        <Pressable
          onPress={clearSupplementError}
          style={{
            backgroundColor: "rgba(255,65,88,0.12)", borderRadius: 14,
            borderWidth: 1, borderColor: "rgba(255,65,88,0.30)",
            padding: 12, flexDirection: "row", gap: 8, alignItems: "center",
          }}
        >
          <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#FF4158" />
          <Text style={{ color: "#FF4158", fontSize: 12, flex: 1 }}>{supplementError}</Text>
        </Pressable>
      ) : null}

      {/* AI Extract button */}
      {hasPrescription && (
        <Pressable
          onPress={() => { clearSupplementError(); void analyzeDocPrescrip(); }}
          disabled={isAnalyzing}
          style={{
            borderRadius: 14, padding: 14,
            backgroundColor: isAnalyzing ? "rgba(154,108,255,0.12)" : "rgba(154,108,255,0.15)",
            borderWidth: 1, borderColor: "rgba(154,108,255,0.35)",
            flexDirection: "row", alignItems: "center", gap: 10,
          }}
        >
          {isAnalyzing
            ? <ActivityIndicator color="#9A6CFF" size="small" />
            : <MaterialCommunityIcons name="brain" size={18} color="#9A6CFF" />}
          <Text style={{ color: "#9A6CFF", fontSize: 13, fontWeight: "700", flex: 1 }}>
            {isAnalyzing ? "Extracting supplements from prescription…" : "Extract Supplements with AI"}
          </Text>
        </Pressable>
      )}

      {/* Checklist */}
      {active.length > 0 ? (
        <View style={{
          backgroundColor: colors.card,
          borderRadius: 20, borderWidth: 1,
          borderColor: colors.border, padding: 16,
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <View style={{
              backgroundColor: "rgba(26,229,167,0.15)", borderRadius: 8,
              width: 30, height: 30, alignItems: "center", justifyContent: "center",
            }}>
              <MaterialCommunityIcons name="pill" size={16} color="#1AE5A7" />
            </View>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>
              Today's Supplements
            </Text>
          </View>
          <SupplementTracker compact={false} />
        </View>
      ) : (
        <EmptyState
          icon="pill-multiple"
          title="No supplements yet"
          subtitle={hasPrescription
            ? "Tap 'Extract Supplements with AI' to parse your prescription."
            : "Upload a doctor's prescription in the Log tab, then extract supplements here."}
          colors={colors}
        />
      )}
    </View>
  );
}

// ─── Doctor's Notes tab ───────────────────────────────────────────────────────

function DoctorNotesTab(): JSX.Element {
  const { colors } = useTheme();
  const doctorNotes = useHealthStore((s) => s.doctorNotes);

  if (!doctorNotes.length) {
    return (
      <EmptyState
        icon="stethoscope"
        title="No doctor's notes"
        subtitle="Upload a doctor's prescription and extract supplements to see diagnosis and recommendations here."
        colors={colors}
      />
    );
  }

  return (
    <View style={{ gap: 16 }}>
      {doctorNotes.map((note, index) => (
        <Animated.View key={note.id} entering={FadeInDown.delay(index * 60).duration(300)}>
          <DoctorNoteCard note={note} colors={colors} />
        </Animated.View>
      ))}
    </View>
  );
}

function DoctorNoteCard({ note, colors }: {
  note: DoctorNote;
  colors: ReturnType<typeof useTheme>["colors"];
}): JSX.Element {
  const [expanded, setExpanded] = useState(true);
  return (
    <View style={{
      backgroundColor: colors.card, borderRadius: 20,
      borderWidth: 1, borderColor: colors.border, overflow: "hidden",
    }}>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        style={{ padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}
      >
        <LinearGradient
          colors={["rgba(79,123,255,0.25)", "rgba(154,108,255,0.15)"]}
          style={{
            width: 40, height: 40, borderRadius: 12,
            alignItems: "center", justifyContent: "center",
          }}
        >
          <MaterialCommunityIcons name="stethoscope" size={20} color="#4F7BFF" />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{note.title}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
            {new Date(note.created_at).toLocaleDateString("en-IN", {
              day: "numeric", month: "short", year: "numeric",
            })}
          </Text>
        </View>
        <MaterialCommunityIcons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18} color={colors.textMuted}
        />
      </Pressable>

      {expanded && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 14 }}>
          {/* Diagnosis */}
          <InfoSection
            icon="clipboard-pulse-outline"
            iconColor="#FF4158"
            label="Diagnosis"
            text={note.diagnosis}
            colors={colors}
          />
          {/* Recommendations */}
          <InfoSection
            icon="lightbulb-outline"
            iconColor="#FFB238"
            label="Doctor's Recommendations"
            text={note.recommendations}
            colors={colors}
          />
        </View>
      )}
    </View>
  );
}

function InfoSection({ icon, iconColor, label, text, colors }: {
  icon: string; iconColor: string; label: string; text: string;
  colors: ReturnType<typeof useTheme>["colors"];
}): JSX.Element {
  return (
    <View style={{
      backgroundColor: colors.cardMuted, borderRadius: 14,
      borderWidth: 1, borderColor: colors.border, padding: 12,
    }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <MaterialCommunityIcons name={icon as never} size={14} color={iconColor} />
        <Text style={{ color: iconColor, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 }}>
          {label.toUpperCase()}
        </Text>
      </View>
      <Text style={{ color: colors.text, fontSize: 13, lineHeight: 19 }}>{text}</Text>
    </View>
  );
}

// ─── All Supplements tab ──────────────────────────────────────────────────────

function AllSupplementsTab(): JSX.Element {
  const { colors } = useTheme();
  const supplements        = useHealthStore((s) => s.supplements);
  const removeSupplementEntry = useHealthStore((s) => s.removeSupplementEntry);

  if (!supplements.length) {
    return (
      <EmptyState
        icon="pill-multiple"
        title="No supplements yet"
        subtitle="Extract supplements from your doctor's prescription to see them here."
        colors={colors}
      />
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {supplements.map((supp, index) => (
        <Animated.View key={supp.id} entering={FadeInDown.delay(index * 50).duration(300)}>
          <SupplementListRow
            supplement={supp}
            onDelete={() => {
              Alert.alert(
                "Remove Supplement",
                `Remove ${supp.name} from your list?`,
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Remove", style: "destructive", onPress: () => { void removeSupplementEntry(supp.id); } },
                ]
              );
            }}
            colors={colors}
          />
        </Animated.View>
      ))}
    </View>
  );
}

function SupplementListRow({ supplement, onDelete, colors }: {
  supplement: Supplement;
  onDelete: () => void;
  colors: ReturnType<typeof useTheme>["colors"];
}): JSX.Element {
  return (
    <View style={{
      backgroundColor: colors.card, borderRadius: 16,
      borderWidth: 1, borderColor: colors.border,
      padding: 14, flexDirection: "row", gap: 12, alignItems: "center",
    }}>
      <View style={{
        width: 40, height: 40, borderRadius: 12,
        backgroundColor: "rgba(154,108,255,0.15)",
        alignItems: "center", justifyContent: "center",
      }}>
        <MaterialCommunityIcons name="pill" size={20} color="#9A6CFF" />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{supplement.name}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
          {supplement.dosage} · {FREQUENCY_LABELS[supplement.frequency]}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
          {TIMING_ORDER.filter((t) => supplement.timing.includes(t)).map((t) => (
            <View key={t} style={{
              backgroundColor: colors.cardMuted, borderRadius: 8,
              paddingHorizontal: 8, paddingVertical: 3,
              borderWidth: 1, borderColor: colors.border,
            }}>
              <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "600" }}>
                {TIMING_LABELS[t]}
              </Text>
            </View>
          ))}
        </View>
        {supplement.notes ? (
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4, fontStyle: "italic" }}>
            {supplement.notes}
          </Text>
        ) : null}
      </View>

      <Pressable onPress={onDelete} style={{ padding: 8 }}>
        <MaterialCommunityIcons name="trash-can-outline" size={18} color="#FF4158" />
      </Pressable>
    </View>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ icon, title, subtitle, colors }: {
  icon: string; title: string; subtitle: string;
  colors: ReturnType<typeof useTheme>["colors"];
}): JSX.Element {
  return (
    <View style={{
      backgroundColor: colors.cardMuted, borderRadius: 20,
      padding: 28, alignItems: "center", gap: 10,
      borderWidth: 1, borderColor: colors.border,
    }}>
      <MaterialCommunityIcons name={icon as never} size={36} color={colors.textMuted} />
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700", textAlign: "center" }}>
        {title}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: "center", lineHeight: 18 }}>
        {subtitle}
      </Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function SupplementsScreen(): JSX.Element {
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState<TabKey>("today");

  return (
    <Animated.View entering={FadeIn.duration(300)} style={{ flex: 1 }}>
      {/* Header */}
      <View style={{ paddingTop: 8, paddingBottom: 16 }}>
        <Text style={{ color: colors.text, fontSize: 24, fontWeight: "900", letterSpacing: -0.5 }}>
          Meds & Supplements
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 4 }}>
          Track your daily medications and doctor's notes
        </Text>
      </View>

      {/* Tab bar */}
      <View style={{
        flexDirection: "row",
        backgroundColor: colors.cardMuted,
        borderRadius: 16, padding: 4,
        marginBottom: 16, gap: 2,
        borderWidth: 1, borderColor: colors.border,
      }}>
        <TabPill label="Today" active={activeTab === "today"} onPress={() => setActiveTab("today")} colors={colors} />
        <TabPill label="Doctor's Notes" active={activeTab === "doctor"} onPress={() => setActiveTab("doctor")} colors={colors} />
        <TabPill label="All Meds" active={activeTab === "all"} onPress={() => setActiveTab("all")} colors={colors} />
      </View>

      {/* Content */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20, gap: 0 }}>
        {activeTab === "today"  && <TodayMedsTab />}
        {activeTab === "doctor" && <DoctorNotesTab />}
        {activeTab === "all"    && <AllSupplementsTab />}
      </ScrollView>
    </Animated.View>
  );
}
