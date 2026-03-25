export function getTodayDateKey(baseDate: Date = new Date()): string {
  const year = baseDate.getFullYear();
  const month = String(baseDate.getMonth() + 1).padStart(2, "0");
  const day = String(baseDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getLastNDates(count: number, referenceDate: Date = new Date()): string[] {
  const dates: string[] = [];

  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(referenceDate);
    date.setDate(referenceDate.getDate() - index);
    dates.push(getTodayDateKey(date));
  }

  return dates;
}

export function formatShortDay(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

export function formatReadableDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}
