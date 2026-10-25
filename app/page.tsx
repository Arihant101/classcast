"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import ClassCard, { type Units } from "@/components/ClassCard";
import type { PlanResponse } from "@/app/api/plan/route";

// Leaflet touches `window`, so render it client-side only.
const RouteMap = dynamic(() => import("@/components/RouteMap"), { ssr: false });

type Mode = "walk" | "bike" | "drive";
type Home = { lat: number; lon: number } | null;

// "0".."6" = days from today, "week" = next 7 days, "YYYY-MM-DD" = a picked date
type When = string;

const midnight = (offset = 0) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
};

const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function rangeFor(when: When) {
  let from: Date;
  let days = 1;
  if (when === "week") {
    from = midnight();
    days = 7;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(when)) {
    const [y, m, d] = when.split("-").map(Number);
    from = new Date(y, m - 1, d);
  } else {
    from = midnight(Number(when));
  }
  const to = new Date(from);
  to.setDate(to.getDate() + days);
  return { from: from.toISOString(), to: to.toISOString() };
}

function labelFor(when: When) {
  if (when === "week") return "this week";
  if (when === "0") return "today";
  if (when === "1") return "tomorrow";
  const d = when.length === 10 ? new Date(when + "T00:00") : midnight(Number(when));
  return "on " + d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

// Weekday labels depend on the viewer's clock, so they're only built in the browser
// (the page is prerendered at build time).
function dayChips(inBrowser: boolean) {
  return Array.from({ length: inBrowser ? 7 : 2 }, (_, i) => ({
    value: String(i),
    label:
      i === 0 ? "Today" : i === 1 ? "Tomorrow" : `${midnight(i).toLocaleDateString([], { weekday: "short" })} ${midnight(i).getDate()}`,
  }));
}

const subscribeNoop = () => () => {};

const MAX_CALENDARS = 5;

const dayHeading = (iso: string) => new Date(iso).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });

const input =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";
const pill = (on: boolean) =>
  `rounded-full px-3 py-1 text-sm ${on ? "bg-blue-600 text-white" : "bg-slate-200 dark:bg-slate-800"}`;

export default function Page() {
  const [links, setLinks] = useState<string[]>([""]);
  const [files, setFiles] = useState<{ name: string; text: string }[]>([]);
  const [gps, setGps] = useState<Home>(null);
  const [address, setAddress] = useState("");
  const [locating, setLocating] = useState(false);
  const [mode, setMode] = useState<Mode>("walk");
  const [when, setWhen] = useState<When>("0");
  const inBrowser = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const [units, setUnits] = useState<Units>("F");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [planMode, setPlanMode] = useState<Mode>("walk");
  const [planWhen, setPlanWhen] = useState<When>("0");

  function useMyLocation() {
    if (!navigator.geolocation) return setError("Your browser can't share location. Type your address instead.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setGps({ lat: p.coords.latitude, lon: p.coords.longitude });
        setLocating(false);
        setError("");
      },
      () => {
        setLocating(false);
        setError("Location was blocked. Type your address instead.");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  const filledLinks = links.map((l) => l.trim()).filter(Boolean);
  const calendarCount = filledLinks.length + files.length;

  async function onFiles(list: FileList | null) {
    if (!list) return;
    const added: { name: string; text: string }[] = [];
    for (const f of Array.from(list)) {
      if (f.size > 2 * 1024 * 1024) return setError(`${f.name} is over 2 MB.`);
      added.push({ name: f.name, text: await f.text() });
    }
    if (calendarCount + added.length > MAX_CALENDARS) return setError(`Up to ${MAX_CALENDARS} calendars at a time.`);
    setFiles((cur) => [...cur, ...added]);
    setError("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (calendarCount === 0) return setError("Paste a calendar link or upload a .ics file.");
    if (calendarCount > MAX_CALENDARS) return setError(`Up to ${MAX_CALENDARS} calendars at a time.`);
    if (!gps && address.trim().length < 3) return setError("Use your location or type a home address.");

    setLoading(true);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          calendars: [
            ...filledLinks.map((url, i) => ({ label: `Calendar ${i + 1}`, url })),
            ...files.map((f) => ({ label: f.name.replace(/\.ics$/i, "").slice(0, 40), ics: f.text })),
          ],
          home: gps ?? { address: address.trim() },
          mode,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ...rangeFor(when),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setPlan(data);
      setPlanMode(mode);
      setPlanWhen(when);
    } catch (err) {
      setPlan(null);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const first = plan?.classes.find((c) => c.leaveBy);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">ClassCast ☔</h1>
        <p className="text-slate-500">When to leave, what to bring, and how to get there.</p>
      </header>

      <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="ical-0">
            Class calendars (iCal links)
          </label>
          {links.map((link, i) => (
            <div key={i} className="flex gap-2">
              <input
                id={`ical-${i}`}
                className={input}
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                aria-label={`Calendar link ${i + 1}`}
                placeholder="https://… or webcal://…"
                value={link}
                onChange={(e) => setLinks((cur) => cur.map((l, j) => (j === i ? e.target.value : l)))}
              />
              {links.length > 1 && (
                <button
                  type="button"
                  aria-label={`Remove calendar link ${i + 1}`}
                  className="rounded-lg px-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  onClick={() => setLinks((cur) => cur.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {files.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs dark:bg-slate-800">
                  📄 {f.name}
                  <button type="button" aria-label={`Remove ${f.name}`} className="text-slate-500" onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-slate-500">
            {links.length + files.length < MAX_CALENDARS && (
              <>
                <button type="button" className="text-blue-600 underline" onClick={() => setLinks((cur) => [...cur, ""])}>
                  + add another link
                </button>
                {" or "}
                <label className="cursor-pointer text-blue-600 underline">
                  upload .ics files
                  <input
                    type="file"
                    accept=".ics,text/calendar"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      onFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
                {". "}
              </>
            )}
            Up to {MAX_CALENDARS} calendars. Links are only used for this request and never saved.
          </p>
        </div>

        <div className="space-y-2">
          <span className="block text-sm font-medium">Starting from</span>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={useMyLocation} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white dark:bg-slate-100 dark:text-slate-900">
              {locating ? "Locating…" : gps ? "📍 Using your location" : "📍 Use my location"}
            </button>
            {gps && (
              <button type="button" className="text-xs text-slate-500 underline" onClick={() => setGps(null)}>
                clear
              </button>
            )}
          </div>
          {!gps && (
            <input className={input} placeholder="or type your address (e.g. 123 College Ave, State College)" value={address} onChange={(e) => setAddress(e.target.value)} />
          )}
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="flex gap-1" role="group" aria-label="Travel mode">
            {(["walk", "bike", "drive"] as Mode[]).map((m) => (
              <button type="button" key={m} className={pill(mode === m)} onClick={() => setMode(m)}>
                {{ walk: "🚶 Walk", bike: "🚲 Bike", drive: "🚗 Drive" }[m]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Day">
            {dayChips(inBrowser).map((d) => (
              <button type="button" key={d.value} className={pill(when === d.value)} onClick={() => setWhen(d.value)}>
                {d.label}
              </button>
            ))}
            <button type="button" className={pill(when === "week")} onClick={() => setWhen("week")}>
              This week
            </button>
            {inBrowser && (
              <input
                type="date"
                aria-label="Pick a date"
                className={`${pill(when.length === 10)} border-0`}
                min={isoDate(midnight())}
                max={isoDate(midnight(15))}
                value={when.length === 10 ? when : ""}
                onChange={(e) => e.target.value && setWhen(e.target.value)}
              />
            )}
          </div>
          <div className="flex gap-1" role="group" aria-label="Units">
            {(["F", "C"] as Units[]).map((u) => (
              <button type="button" key={u} className={pill(units === u)} onClick={() => setUnits(u)}>
                °{u}
              </button>
            ))}
          </div>
        </div>

        <button disabled={loading} className="w-full rounded-lg bg-blue-600 py-2.5 font-semibold text-white disabled:opacity-60">
          {loading ? "Planning…" : when === "week" ? "Plan my week" : "Plan my day"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      {plan && (
        <section className="mt-6 space-y-4">
          {plan.warnings.length > 0 && (
            <ul className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              {plan.warnings.map((w) => (
                <li key={w}>⚠️ {w}</li>
              ))}
            </ul>
          )}
          {plan.classes.length === 0 ? (
            <p className="text-center text-slate-500">No classes {labelFor(planWhen)}. Enjoy 🎉</p>
          ) : (
            <>
              <div className="rounded-xl bg-blue-600 p-4 text-white">
                {first && (
                  <p className="text-lg font-semibold">
                    First leave-by:{" "}
                    {new Date(first.leaveBy!).toLocaleString([], {
                      ...(planWhen === "week" ? { weekday: "short" } : {}),
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                )}
                {plan.brief && <p className="mt-1 text-sm opacity-90">{plan.brief}</p>}
                {plan.aiProvider && <p className="mt-1 text-xs opacity-70">✨ Brief by {plan.aiProvider === "gemini" ? "Gemini" : "Claude"}</p>}
                {!plan.aiUsed && <p className="mt-1 text-xs opacity-80">AI brief unavailable: {plan.aiError ?? "unknown error"} Showing the basics.</p>}
              </div>
              <RouteMap plan={plan} />
              {plan.classes.map((c, i) => {
                const newDay = planWhen === "week" && (i === 0 || dayHeading(c.start) !== dayHeading(plan.classes[i - 1].start));
                return (
                  <div key={c.id} className="space-y-4">
                    {newDay && <h2 className="pt-2 text-lg font-semibold">{dayHeading(c.start)}</h2>}
                    <ClassCard c={c} units={units} index={i} mode={planMode} showSource={new Set(plan.classes.map((x) => x.source)).size > 1} />
                  </div>
                );
              })}
            </>
          )}
        </section>
      )}

      <footer className="mt-10 text-center text-xs text-slate-400">
        Weather: Open-Meteo · Maps: © OpenStreetMap · Routes: openrouteservice · AI: Gemini
        <span className="mx-1">·</span>
        <Link href="/about" className="underline hover:text-slate-600 dark:hover:text-slate-300">
          About
        </Link>
      </footer>
    </main>
  );
}
