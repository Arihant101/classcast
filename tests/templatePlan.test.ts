import { describe, expect, it } from "vitest";
import { templateBrief, templateBring, type TemplateClass } from "@/lib/templatePlan";

const w = (over = {}) => ({ tempC: 10, feelsC: 8, precipProb: 0, precipMm: 0, windKmh: 5, code: 1, ...over });
const cls = (over: Partial<TemplateClass> = {}): TemplateClass => ({
  id: "a",
  title: "MATH 230",
  start: "Mon 9:05 AM",
  leaveBy: "Mon 8:48 AM",
  lateByMin: 0,
  weather: w(),
  bring: [],
  ...over,
});

describe("templateBrief", () => {
  it("leads with the first leave-by and flags rain, lateness and due items", () => {
    const brief = templateBrief(
      [cls(), cls({ id: "b", title: "CMPSC 132", start: "Mon 10:00 AM", lateByMin: 4, weather: w({ precipProb: 80 }) })],
      [{ title: "HW 5 [CMPSC 360]", due: "Tue Oct 27 (all day)" }],
    );
    expect(brief).toMatch(/^Leave by Mon 8:48 AM for MATH 230 at Mon 9:05 AM\./);
    expect(brief).toContain("Rain is likely around Mon 10:00 AM");
    expect(brief).toContain("about 4 min late");
    expect(brief).toContain("Due soon: HW 5 (Tue Oct 27 (all day)).");
  });
  it("mentions snow and handles a due-only day", () => {
    expect(templateBrief([cls({ weather: w({ code: 73 }) })], [])).toContain("Snow");
    expect(templateBrief([], [{ title: "Essay", due: "Fri 11:59 PM" }])).toBe("Due soon: Essay (Fri 11:59 PM).");
  });
});

describe("templateBring", () => {
  it("adds a subject item without duplicating rule items", () => {
    expect(templateBring("CMPSC 132", ["Umbrella or rain jacket"])).toEqual(["Umbrella or rain jacket", "Laptop + charger", "Notebook + pen"]);
    expect(templateBring("MATH 230", ["Pencil + calculator (exam)"])).not.toContain("Calculator");
    expect(templateBring("History 20", [])).toEqual(["Notebook + pen"]);
  });
});
