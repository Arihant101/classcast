import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { aiPlan } from "@/lib/ai";
import { ruleBring } from "@/lib/bring";
import { loadCalendars, MAX_CALENDARS, type CalendarSource } from "@/lib/calendars";
import { geocodeAddress, geocodeLocation, isVirtual, type LatLon } from "@/lib/geocode";
import { planLeave, startsFromPrevious } from "@/lib/leaveTime";
import { rateLimited } from "@/lib/rateLimit";
import { getRoute, type Route } from "@/lib/route";
import { MAX_BYTES } from "@/lib/safeFetch";
import { getForecasts, type Weather } from "@/lib/weather";
import { weekSummary, type WeekSummary } from "@/lib/weekSummary";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z
  .object({
    calendars: z
      .array(
        z.union([
          z.object({ label: z.string().max(40).optional(), url: z.string().min(1).max(2000) }),
          z.object({ label: z.string().max(40).optional(), ics: z.string().min(1).max(MAX_BYTES) }),
        ]),
      )
      .max(MAX_CALENDARS, `Up to ${MAX_CALENDARS} calendars at a time.`)
      .optional(),
    // single-calendar form, kept for older clients
    icalUrl: z.string().max(2000).optional(),
    icsText: z.string().max(MAX_BYTES).optional(),
    home: z.union([
      z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }),
      z.object({ address: z.string().min(3).max(200) }),
    ]),
    mode: z.enum(["walk", "bike", "drive"]).default("walk"),
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    tz: z.string().max(64).default("UTC"),
  })
  .refine((b) => (b.calendars?.length ?? 0) + (b.icalUrl ? 1 : 0) + (b.icsText ? 1 : 0) > 0, "Add at least one calendar link or file.")
  // Vercel rejects request bodies over 4.5 MB, so keep uploads comfortably under that.
  .refine(
    (b) => (b.calendars ?? []).reduce((n, c) => n + ("ics" in c ? c.ics.length : 0), b.icsText?.length ?? 0) <= 4 * 1024 * 1024,
    "Uploaded files are too big together (4 MB max).",
  );

export type PlannedClass = {
  id: string;
  title: string;
  source: string;
  location: string;
  start: string;
  end: string;
  coords: LatLon | null;
  from: "home" | "previous class" | null;
  route: Route | null;
  leaveBy: string | null;
  travelMin: number | null;
  lateByMin: number;
  weather: Weather | null;
  bring: string[];
  note?: string;
};

export type DueItem = { id: string; title: string; source: string; start: string; allDay: boolean };

export type PlanResponse = { home: LatLon; classes: PlannedClass[]; due: DueItem[]; brief: string | null; aiUsed: boolean; aiProvider?: "gemini" | "claude"; aiError?: string; warnings: string[]; week?: WeekSummary };

const fail = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

function safeTz(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

const cToF = (c: number) => Math.round((c * 9) / 5 + 32);
const kmhToMph = (k: number) => Math.round(k / 1.609);

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) return fail("Slow down a little and try again in a minute.", 429);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Bad request.");
  const b = parsed.data;

  const from = new Date(b.from);
  const to = new Date(b.to);
  if (!(to > from) || to.getTime() - from.getTime() > 8 * 86_400_000) return fail("Pick a range of up to a week.");
  const tz = safeTz(b.tz);

  // 1. Calendars (never logged: private iCal links work like passwords)
  const sources: CalendarSource[] = (b.calendars ?? []).map((c, i) => ({ ...c, label: c.label?.trim() || `Calendar ${i + 1}` }));
  if (b.icalUrl) sources.push({ label: `Calendar ${sources.length + 1}`, url: b.icalUrl });
  if (b.icsText) sources.push({ label: `Calendar ${sources.length + 1}`, ics: b.icsText });
  if (sources.length > MAX_CALENDARS) return fail(`Up to ${MAX_CALENDARS} calendars at a time.`);

  const { events, due, warnings, loadedCount } = await loadCalendars(sources, from, to, tz);
  if (loadedCount === 0) return fail(warnings.join(" "));

  // 2. Home
  const home = "address" in b.home ? await geocodeAddress(b.home.address) : b.home;
  if (!home) return fail("Couldn't find that home address. Try adding the city.");

  // 3. Class locations
  const coords: (LatLon | null)[] = [];
  for (const ev of events) coords.push(ev.geo ?? (ev.location ? await geocodeLocation(ev.location) : null));

  // 4. Weather for every point we know
  const forecast = await getForecasts([home, ...coords.filter((c): c is LatLon => !!c)]).catch(
    () => (() => null) as (p: LatLon, at: Date) => Weather | null,
  );

  // 5. Routes + leave-by, chaining back-to-back classes
  const classes: PlannedClass[] = [];
  let prev: { end: Date; coords: LatLon } | null = null;
  for (const [i, ev] of events.entries()) {
    const start = new Date(ev.start);
    const end = new Date(ev.end);
    const here = coords[i];
    const pc: PlannedClass = {
      id: ev.id,
      title: ev.title,
      source: ev.source,
      location: ev.location,
      start: ev.start,
      end: ev.end,
      coords: here,
      from: null,
      route: null,
      leaveBy: null,
      travelMin: null,
      lateByMin: 0,
      weather: here ? forecast(here, start) : null,
      bring: [],
    };

    if (!here) {
      pc.note = !ev.location ? "No location in the calendar." : isVirtual(ev.location) ? "Online class." : "Couldn't find this location on the map.";
    } else {
      const chained = prev && startsFromPrevious(prev.end, start) ? prev : null;
      const origin = chained ? chained.coords : home;
      pc.from = chained ? "previous class" : "home";
      pc.route = await getRoute(origin, here, b.mode);
      const departWeather = forecast(origin, new Date(start.getTime() - pc.route.seconds * 1000));
      const plan = planLeave(start, pc.route.seconds, departWeather ?? pc.weather, chained?.end);
      pc.leaveBy = plan.leaveBy.toISOString();
      pc.travelMin = plan.travelMin;
      pc.lateByMin = plan.lateByMin;
      prev = { end, coords: here };
    }
    pc.bring = ruleBring([pc.weather], ev.notes);
    classes.push(pc);
  }

  // 6. AI brief + bring list
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  const fmtDay = (day: string) =>
    new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${day}T12:00:00Z`));
  const dueOut: DueItem[] = due.map((d) => ({ id: d.id, title: d.title, source: d.source, start: d.start, allDay: d.allDay }));
  const ai = await aiPlan(
    classes.map((c, i) => ({
      id: c.id,
      title: c.title,
      notes: events[i].notes,
      start: fmt(c.start),
      leaveBy: c.leaveBy ? fmt(c.leaveBy) : "n/a",
      travelMin: c.travelMin ?? 0,
      lateByMin: c.lateByMin,
      weather: c.weather
        ? `${cToF(c.weather.tempC)}°F, feels ${cToF(c.weather.feelsC)}°F, rain ${c.weather.precipProb}%, wind ${kmhToMph(c.weather.windKmh)} mph`
        : "unknown",
      ruleBring: c.bring,
    })),
    dueOut.map((d) => ({ title: d.title, due: d.allDay ? `${fmtDay(d.start)} (all day)` : fmt(d.start) })),
  );
  if (ai.ok) for (const c of classes) if (ai.bring[c.id]?.length) c.bring = ai.bring[c.id];

  // Multi-day plans get the "Reality Check" summary.
  const week = to.getTime() - from.getTime() > 1.5 * 86_400_000 ? weekSummary(classes, tz) : undefined;

  return NextResponse.json({ home, classes, due: dueOut, week, brief: ai.ok ? ai.brief : null, aiUsed: ai.ok, aiProvider: ai.ok ? ai.provider : undefined, aiError: ai.ok ? undefined : ai.reason, warnings } satisfies PlanResponse, {
    headers: { "cache-control": "no-store" },
  });
}
