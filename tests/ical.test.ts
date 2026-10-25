import { describe, expect, it } from "vitest";
import { eventsInWindow } from "@/lib/ical";

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
BEGIN:VEVENT
UID:cmpsc
DTSTAMP:20261001T000000Z
DTSTART:20261026T140000Z
DTEND:20261026T151500Z
RRULE:FREQ=WEEKLY;BYDAY=MO,WE
SUMMARY:CMPSC 360
LOCATION:Thomas Building 101
DESCRIPTION:Bring calculator
END:VEVENT
BEGIN:VEVENT
UID:holiday
DTSTAMP:20261001T000000Z
DTSTART;VALUE=DATE:20261028
SUMMARY:All day thing
END:VEVENT
BEGIN:VEVENT
UID:geo
DTSTAMP:20261001T000000Z
DTSTART:20261028T180000Z
DTEND:20261028T190000Z
SUMMARY:Lab
GEO:40.7982;-77.8599
END:VEVENT
END:VCALENDAR`;

describe("eventsInWindow", () => {
  it("expands weekly classes and lists all-day events as due items", () => {
    const ev = eventsInWindow(ICS, new Date("2026-10-26T00:00:00Z"), new Date("2026-10-29T00:00:00Z"));
    expect(ev.filter((e) => e.kind === "class").map((e) => e.title)).toEqual(["CMPSC 360", "CMPSC 360", "Lab"]);
    expect(ev.filter((e) => e.kind === "due").map((e) => [e.title, e.start, e.allDay])).toEqual([["All day thing", "2026-10-28", true]]);
    expect(ev[0].start).toBe("2026-10-26T14:00:00.000Z");
    expect(ev[0].location).toBe("Thomas Building 101");
    expect(ev[0].notes).toBe("Bring calculator");
  });

  it("reads GEO when present", () => {
    const ev = eventsInWindow(ICS, new Date("2026-10-28T17:00:00Z"), new Date("2026-10-28T20:00:00Z")).filter((e) => e.kind === "class");
    expect(ev).toHaveLength(1);
    expect(ev[0].geo).toEqual({ lat: 40.7982, lon: -77.8599 });
  });
});

// Shaped like a Canvas (Instructure) feed: assignments are all-day or zero-length, times in UTC.
const CANVAS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Instructure//Canvas//EN
BEGIN:VEVENT
DTSTAMP:20261020T000000Z
DTSTART;VALUE=DATE:20261027
DTEND;VALUE=DATE:20261027
SUMMARY:Homework 5 [CMPSC 360]
UID:event-assignment-123
END:VEVENT
BEGIN:VEVENT
DTSTAMP:20261020T000000Z
DTSTART:20261028T035900Z
DTEND:20261028T035900Z
SUMMARY:Lab 3 [CMPSC 360]
UID:event-assignment-124
END:VEVENT
BEGIN:VEVENT
DTSTAMP:20261020T000000Z
DTSTART:20261027T170000Z
DTEND:20261027T181500Z
LOCATION:Westgate E201
SUMMARY:Review session [CMPSC 360]
UID:event-calendar-event-55
END:VEVENT
END:VCALENDAR`;

describe("Canvas feeds", () => {
  // Tuesday Oct 27 in New York
  const from = new Date("2026-10-27T04:00:00Z");
  const to = new Date("2026-10-28T04:00:00Z");

  it("keeps assignments (all-day and timed) as due items, and real events as classes", () => {
    const ev = eventsInWindow(CANVAS, from, to, "America/New_York");
    expect(ev.map((e) => [e.title, e.kind])).toEqual([
      ["Homework 5 [CMPSC 360]", "due"],
      ["Review session [CMPSC 360]", "class"],
      ["Lab 3 [CMPSC 360]", "due"], // 11:59 PM Eastern
    ]);
  });

  it("matches all-day items by the viewer's calendar day", () => {
    const nextDay = eventsInWindow(CANVAS, to, new Date("2026-10-29T04:00:00Z"), "America/New_York");
    expect(nextDay.map((e) => e.title)).toEqual([]);
  });
});
