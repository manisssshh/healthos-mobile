import { Text, View } from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

type InsightCardProps = {
  title?: string;
  message: string;
};

export function InsightCard({ title = "Doctor Insight", message }: InsightCardProps): JSX.Element {
  return (
    <Animated.View entering={FadeInUp.duration(450)}>
      <LinearGradient
        colors={["rgba(79,123,255,0.18)", "rgba(79,123,255,0.06)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: 20, borderWidth: 1, borderColor: "rgba(79,123,255,0.30)", padding: 16 }}
      >
        <View className="flex-row items-center mb-3">
          <View className="h-7 w-7 rounded-full items-center justify-center" style={{ backgroundColor: "rgba(79,123,255,0.20)" }}>
            <MaterialCommunityIcons name="stethoscope" size={14} color="#4F7BFF" />
          </View>
          <Text className="text-accentBlue text-xs tracking-widest font-bold ml-2">{title.toUpperCase()}</Text>
        </View>
        <Text className="text-white text-sm leading-6">{message}</Text>
      </LinearGradient>
    </Animated.View>
  );
}
