import { describe, expect, it } from "vitest";
import { weekSummary, type WeekClass } from "@/lib/weekSummary";

const dry = { tempC: 15, feelsC: 15, precipProb: 0, precipMm: 0, windKmh: 5, code: 0 };
const rain = { ...dry, precipProb: 80, precipMm: 1, code: 63 };
const c = (title: string, start: string, end: string, extra: Partial<WeekClass> = {}): WeekClass => ({
  title,
  start,
  end,
  from: "home",
  travelMin: 10,
  weather: dry,
  ...extra,
});

// Times in UTC; New York is UTC-4 in late October.
const week = [
  c("MATH 230", "2026-10-26T13:05:00Z", "2026-10-26T13:55:00Z"),
  c("CMPSC 132", "2026-10-26T14:00:00Z", "2026-10-26T14:50:00Z", { from: "previous class", travelMin: 12 }),
  c("PHYS 211", "2026-10-26T18:00:00Z", "2026-10-26T19:15:00Z", { from: "home" }),
  c("ENGL 15", "2026-10-27T13:35:00Z", "2026-10-27T14:50:00Z", { weather: rain }),
];

describe("weekSummary", () => {
  const s = weekSummary(week, "America/New_York");

  it("finds the busiest day", () => {
    expect(s.busiest).toEqual({ day: "Mon, Oct 26", classes: 3, hours: 2.9 });
  });

  it("flags back-to-backs where travel eats the gap", () => {
    expect(s.risky).toEqual([{ day: "Mon, Oct 26", from: "MATH 230", to: "CMPSC 132", gapMin: 5, travelMin: 12, slackMin: -7 }]);
  });

  it("lists rainy days and long free windows", () => {
    expect(s.rainyDays).toEqual([{ day: "Tue, Oct 27", classes: 1, snow: false }]);
    expect(s.freeWindows).toEqual([{ day: "Mon, Oct 26", start: "2026-10-26T14:50:00Z", end: "2026-10-26T18:00:00Z", minutes: 190 }]);
  });

  it("handles an empty week", () => {
    expect(weekSummary([], "UTC")).toEqual({ busiest: null, risky: [], rainyDays: [], freeWindows: [] });
  });
});
