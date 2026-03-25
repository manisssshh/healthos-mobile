import { Text, View } from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";

type InsightCardProps = {
  title?: string;
  message: string;
};

export function InsightCard({ title = "Doctor Insight", message }: InsightCardProps): JSX.Element {
  return (
    <Animated.View
      entering={FadeInUp.duration(450)}
      className="rounded-2xl border border-white/10 bg-card/80 p-4"
    >
      <View className="flex-row items-center">
        <MaterialCommunityIcons name="stethoscope" size={16} color="#4F7BFF" />
        <Text className="text-textMuted text-xs tracking-widest ml-2">{title.toUpperCase()}</Text>
      </View>
      <View className="mt-3 flex-row items-start">
        <View className="h-2.5 w-2.5 rounded-full bg-accentBlue mt-1.5" />
        <Text className="text-white text-base ml-3 leading-6">{message}</Text>
      </View>
    </Animated.View>
  );
}
