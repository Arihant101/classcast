import ical, { type ParameterValue, type VEvent } from "node-ical";

export type ClassEvent = {
  id: string;
  title: string;
  location: string;
  notes: string;
  start: string; // ISO UTC, or "YYYY-MM-DD" for all-day items
  end: string; // ISO UTC, or "YYYY-MM-DD" for all-day items
  // "due" = assignments/deadlines (Canvas assignments, all-day or zero-length events).
  // They're listed, but not routed to.
  kind: "class" | "due";
  allDay: boolean;
  geo?: { lat: number; lon: number };
};

const DAY = 86_400_000;

/** Calendar date of an instant in a time zone, as "YYYY-MM-DD". */
function dayIn(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

// node-ical builds all-day dates at local midnight of the server, so read them back in local time.
const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Canvas assignment UIDs look like "event-assignment-123" or "event-assignment-override-45".
const isAssignment = (uid: string) => /^event-assignment/i.test(uid);

const text = (v: ParameterValue | undefined): string =>
  v == null ? "" : typeof v === "string" ? v : String(v.val ?? "");

function parseGeo(geo: unknown): ClassEvent["geo"] {
  if (!geo || typeof geo !== "object") return undefined;
  const g = geo as { lat?: unknown; lon?: unknown };
  const lat = Number(g.lat);
  const lon = Number(g.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return undefined;
  return { lat, lon };
}

/**
 * Events overlapping [from, to], recurring ones expanded, sorted by start.
 * All-day events are matched by calendar day in the viewer's time zone.
 */
export function eventsInWindow(ics: string, from: Date, to: Date, tz = "UTC"): ClassEvent[] {
  const data = ical.sync.parseICS(ics);
  const out: ClassEvent[] = [];
  const firstDay = dayIn(from, tz);
  const lastDay = dayIn(new Date(to.getTime() - 1), tz);
  // Widen the expansion window so all-day items aren't lost to time-zone offsets.
  const range = { from: new Date(from.getTime() - 2 * DAY), to: new Date(to.getTime() + 2 * DAY) };

  for (const comp of Object.values(data)) {
    if (!comp || comp.type !== "VEVENT") continue;
    const ev = comp as VEvent;
    if (ev.status === "CANCELLED") continue;

    for (const inst of ical.expandRecurringEvent(ev, range)) {
      const src = inst.event;
      const base = {
        title: text(src.summary).slice(0, 200) || "(untitled)",
        location: text(src.location).slice(0, 300),
        notes: text(src.description).slice(0, 500),
        geo: parseGeo(src.geo),
      };
      if (inst.isFullDay) {
        const day = localDay(new Date(inst.start));
        if (day < firstDay || day > lastDay) continue;
        out.push({ ...base, id: `${ev.uid}|${day}`, start: day, end: day, kind: "due", allDay: true });
        continue;
      }
      const start = new Date(inst.start);
      const end = new Date(inst.end ?? inst.start);
      if (end < from || start >= to) continue;
      const due = isAssignment(String(ev.uid ?? "")) || end.getTime() - start.getTime() < 60_000;
      out.push({
        ...base,
        id: `${ev.uid}|${start.toISOString()}`,
        start: start.toISOString(),
        end: end.toISOString(),
        kind: due ? "due" : "class",
        allDay: false,
      });
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start)).slice(0, 500);
}
