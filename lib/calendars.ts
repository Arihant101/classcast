// Loads several calendars (links and/or uploaded files), merges their events,
// labels each event with its source, and drops duplicates (the same class can
// appear in two feeds, e.g. a school calendar and a personal copy).
// Classes and due items (assignments) come back separately.
// One bad link only produces a warning; the others still load.
import { eventsInWindow, type ClassEvent } from "./ical";
import { assertLooksLikeIcs, fetchCalendar, UnsafeUrlError } from "./safeFetch";

export const MAX_CALENDARS = 5;
export const MAX_EVENTS = 50;

export type CalendarSource = { label: string } & ({ url: string } | { ics: string });
export type SourcedEvent = ClassEvent & { source: string };

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Same start time and same title (or same UID) = same event. */
export function dedupe(events: SourcedEvent[]): SourcedEvent[] {
  const seen = new Set<string>();
  const out: SourcedEvent[] = [];
  for (const ev of events) {
    const uidKey = `uid:${ev.id}`; // id is uid|start
    const titleKey = `t:${norm(ev.title)}|${ev.start}`;
    if (seen.has(uidKey) || seen.has(titleKey)) continue;
    seen.add(uidKey);
    seen.add(titleKey);
    out.push(ev);
  }
  return out;
}

export async function loadCalendars(sources: CalendarSource[], from: Date, to: Date, tz = "UTC") {
  const results = await Promise.all(
    sources.map(async (src): Promise<SourcedEvent[] | string> => {
      try {
        const ics = "url" in src ? await fetchCalendar(src.url) : src.ics;
        if (!("url" in src)) assertLooksLikeIcs(ics);
        return eventsInWindow(ics, from, to, tz).map((ev) => ({ ...ev, source: src.label }));
      } catch (e) {
        // Never echo the URL back: private iCal links work like passwords.
        const why = e instanceof UnsafeUrlError ? e.message : "Couldn't read that calendar.";
        return `${src.label}: ${why}`;
      }
    }),
  );

  // Warnings in the same order as the sources, not in the order fetches finished.
  const warnings = results.filter((r): r is string => typeof r === "string");
  const loaded = results.filter((r): r is SourcedEvent[] => typeof r !== "string");
  const merged = dedupe(loaded.flat().sort((a, b) => a.start.localeCompare(b.start)));
  const classes = merged.filter((e) => e.kind === "class");
  const due = merged.filter((e) => e.kind === "due");
  if (classes.length > MAX_EVENTS) warnings.push(`Showing the first ${MAX_EVENTS} classes.`);
  if (due.length > MAX_EVENTS) warnings.push(`Showing the first ${MAX_EVENTS} due items.`);
  return { events: classes.slice(0, MAX_EVENTS), due: due.slice(0, MAX_EVENTS), warnings, loadedCount: loaded.length };
}
