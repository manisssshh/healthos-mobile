import { View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";

type TrendChartProps = {
  values: number[];
  color: string;
  height?: number;
};

function buildPath(values: number[], width: number, height: number): string {
  if (!values.length) {
    return "";
  }

  const maxValue = Math.max(...values, 1);
  const stepX = values.length > 1 ? width / (values.length - 1) : width;

  return values
    .map((value, index) => {
      const x = index * stepX;
      const y = height - (value / maxValue) * height;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");
}

function buildAreaPath(values: number[], width: number, height: number): string {
  if (!values.length) {
    return "";
  }

  const linePath = buildPath(values, width, height);
  return `${linePath} L ${width} ${height} L 0 ${height} Z`;
}

export function TrendChart({ values, color, height = 72 }: TrendChartProps): JSX.Element {
  const chartWidth = 260;
  const linePath = buildPath(values, chartWidth, height);
  const areaPath = buildAreaPath(values, chartWidth, height);

  return (
    <View className="w-full overflow-hidden rounded-xl bg-cardMuted/60 p-2">
      <Svg width="100%" height={height} viewBox={`0 0 ${chartWidth} ${height}`}>
        <Defs>
          <LinearGradient id="trendFill" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor={color} stopOpacity={0.45} />
            <Stop offset="100%" stopColor={color} stopOpacity={0.05} />
          </LinearGradient>
        </Defs>
        <Path d={areaPath} fill="url(#trendFill)" />
        <Path d={linePath} stroke={color} strokeWidth={3} fill="none" strokeLinecap="round" />
      </Svg>
    </View>
  );
}
