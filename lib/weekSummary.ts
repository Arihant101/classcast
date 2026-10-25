// "Reality Check": a look across the whole week so tight turnarounds and
// busy days show up before Monday. All of this is plain math on the planned classes.
import { BUFFER_MIN } from "./leaveTime";
import { isWet, isSnow, type Weather } from "./weather";

export type WeekClass = {
  title: string;
  start: string;
  end: string;
  from: "home" | "previous class" | null;
  travelMin: number | null;
  weather: Weather | null;
};

export type WeekSummary = {
  busiest: { day: string; classes: number; hours: number } | null;
  risky: { day: string; from: string; to: string; gapMin: number; travelMin: number; slackMin: number }[];
  rainyDays: { day: string; classes: number; snow: boolean }[];
  freeWindows: { day: string; start: string; end: string; minutes: number }[];
};

export const FREE_WINDOW_MIN = 90;

const minutes = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000);

export function weekSummary(classes: WeekClass[], tz: string): WeekSummary {
  const dayOf = (iso: string) =>
    new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(new Date(iso));

  const byDay = new Map<string, WeekClass[]>();
  for (const c of [...classes].sort((a, b) => a.start.localeCompare(b.start))) {
    const d = dayOf(c.start);
    byDay.set(d, [...(byDay.get(d) ?? []), c]);
  }

  let busiest: WeekSummary["busiest"] = null;
  const risky: WeekSummary["risky"] = [];
  const rainyDays: WeekSummary["rainyDays"] = [];
  const freeWindows: WeekSummary["freeWindows"] = [];

  for (const [day, list] of byDay) {
    const classMin = list.reduce((n, c) => n + minutes(c.start, c.end), 0);
    if (!busiest || list.length > busiest.classes || (list.length === busiest.classes && classMin / 60 > busiest.hours)) {
      busiest = { day, classes: list.length, hours: Math.round((classMin / 60) * 10) / 10 };
    }

    const wet = list.filter((c) => c.weather && isWet(c.weather));
    if (wet.length) rainyDays.push({ day, classes: wet.length, snow: wet.some((c) => isSnow(c.weather!.code)) });

    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const next = list[i];
      const gapMin = minutes(prev.end, next.start);
      if (gapMin >= FREE_WINDOW_MIN) freeWindows.push({ day, start: prev.end, end: next.start, minutes: gapMin });
      if (next.from === "previous class" && next.travelMin != null) {
        const slackMin = gapMin - next.travelMin;
        if (slackMin < BUFFER_MIN) risky.push({ day, from: prev.title, to: next.title, gapMin, travelMin: next.travelMin, slackMin });
      }
    }
  }

  return {
    busiest,
    risky: risky.sort((a, b) => a.slackMin - b.slackMin),
    rainyDays,
    freeWindows: freeWindows.sort((a, b) => b.minutes - a.minutes).slice(0, 5),
  };
}
