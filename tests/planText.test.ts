import { describe, expect, it } from "vitest";
import { emailLinks, labelFor, planText, rangeFor, splitCourse } from "@/lib/planText";
import type { PlanResponse } from "@/app/api/plan/route";

const plan = (over: Partial<PlanResponse> = {}): PlanResponse =>
  ({
    home: { lat: 0, lon: 0 },
    classes: [],
    due: [],
    brief: "",
    aiUsed: true,
    warnings: [],
    ...over,
  }) as PlanResponse;

describe("splitCourse", () => {
  it("pulls the course out of Canvas brackets", () => {
    expect(splitCourse("Homework 5 [CMPSC 360 Fall 2026]")).toEqual({ name: "Homework 5", course: "CMPSC 360 Fall 2026" });
  });
  it("leaves plain titles alone", () => {
    expect(splitCourse("Quiz [draft] review")).toEqual({ name: "Quiz [draft] review", course: "" });
  });
});

describe("rangeFor / labelFor", () => {
  it("covers 7 days for the week", () => {
    const { from, to } = rangeFor("week");
    expect((Date.parse(to) - Date.parse(from)) / 86_400_000).toBeCloseTo(7, 0);
    expect(labelFor("week")).toBe("this week");
  });
  it("starts a picked date at local midnight", () => {
    const { from } = rangeFor("2026-10-26");
    const d = new Date(from);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 26, 0]);
  });
  it("labels today and tomorrow", () => {
    expect(labelFor("0")).toBe("today");
    expect(labelFor("1")).toBe("tomorrow");
  });
});

describe("planText", () => {
  it("lists the brief, due items as bullets, and bring lists", () => {
    const text = planText(
      plan({
        brief: "Rain at 2.",
        classes: [{ id: "a", title: "MATH 230", location: "Thomas 102", start: "2026-10-26T13:05:00Z", bring: ["umbrella"] }] as PlanResponse["classes"],
        due: [{ id: "d", title: "HW 5 [CMPSC 360]", source: "Canvas", start: "2026-10-27", allDay: true }],
      }),
      "0",
    );
    expect(text).toContain("Rain at 2.");
    expect(text).toContain("MATH 230 @ Thomas 102");
    expect(text).toContain("Bring: umbrella");
    expect(text).toMatch(/• HW 5 \(CMPSC 360\), due /);
  });
  it("trims long plans to stay under URL limits", () => {
    expect(planText(plan({ brief: "x".repeat(5000) }), "0").length).toBeLessThan(1800);
  });
});

describe("emailLinks", () => {
  it("encodes subject and body", () => {
    const { mailto, gmail } = emailLinks(plan({ brief: "A & B" }), "0");
    expect(mailto).toMatch(/^mailto:\?subject=ClassCast%20plan%20today&body=/);
    expect(mailto).toContain("A%20%26%20B");
    expect(gmail).toMatch(/^https:\/\/mail\.google\.com\/mail\/\?view=cm&fs=1&su=/);
  });
});
