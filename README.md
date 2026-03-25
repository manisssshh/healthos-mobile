# HealthOS Mobile

Premium single-user health tracking app built with React Native + Expo + TypeScript.

## Stack

- Expo (React Native)
- TypeScript
- Zustand (state management)
- expo-sqlite (local persistence)
- react-native-svg (score circle)
- react-native-reanimated (animations)
- NativeWind (utility styling)

## Features

- First-use smart profile setup (age, weight, height, goal, conditions)
- Health report upload and tagging (blood test / prescription)
- Dynamic metric generation based on profile goals, conditions, and AI report analysis
- Daily WHOOP-style dashboard with personalized health score
- Dynamic tracking screen (only relevant inputs shown)
- Doctor-style insight engine (daily + weekly risk areas)
- Weekly trend charts with icon-driven metric cards
- Local SQLite persistence for profile, logs, reports, and AI personalization
- Input limits to prevent unrealistic entry values

## Health Score Formula

```txt
Dynamic weighted score based on active metrics.
Always includes Sleep + Steps + Water.
Adds Calories and Weight when profile/condition rules enable them.
Cap at 100.
```

## Data Model

```txt
UserProfile:
  age, weight, height, goal, conditions[]

DailyLog:
  date, water_ml, steps, sleep_hours, calories, weight_kg, food_intake

Reports:
  file_url, type, date, file_name

AiPersonalization:
  active_metrics[], metric_targets{}, doctor_focus[], summary, source_report_ids[], generated_at
```

## Project Structure

```txt
src/
  components/
    ScoreCircle.tsx
    MetricCard.tsx
    InsightCard.tsx
    ProgressBar.tsx
    TrendChart.tsx
  screens/
    SetupScreen.tsx
    HomeScreen.tsx
    LogScreen.tsx
    AnalyticsScreen.tsx
  store/
    useHealthStore.ts
  services/
    aiPersonalizationService.ts
    storageService.ts
    insightService.ts
    metricService.ts
    reportFileService.ts
    futureIntegrations.ts
  utils/
    scoreCalculator.ts
    dateUtils.ts
```

## Run

```bash
npm install
npm start
```

## Notes

- Single-user local app, no authentication.
- Data is stored in SQLite on device.
- AI report personalization runs when reports are analyzed:
  - Preferred: set `EXPO_PUBLIC_HEALTHOS_AI_ENDPOINT` to your secure backend endpoint.
  - Dev fallback: set `EXPO_PUBLIC_ANTHROPIC_API_KEY` for direct app calls (not production-safe).
- Entry limits:
  - water up to 10,000 ml
  - steps up to 100,000
  - sleep up to 16 hours
  - calories up to 10,000
  - weight up to 250 kg
  - food intake text up to 220 characters
- Future-ready structure placeholders are included for:
  - Google Fit / Apple HealthKit
  - Notifications
