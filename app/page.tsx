"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import ClassCard, { type Units } from "@/components/ClassCard";
import type { PlanResponse } from "@/app/api/plan/route";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CalendarCheck, FileDown, Mail, MapPin, Plus, Send, Upload, X } from "lucide-react";

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

// Uses the browser's print dialog ("Save as PDF"); the print styles in globals.css hide the form and map.
function saveAsPdf(when: When) {
  const title = document.title;
  document.title = `ClassCast ${labelFor(when)}`;
  window.addEventListener("afterprint", () => (document.title = title), { once: true });
  window.print();
}

// Plain-text version of the plan for email. Kept short so mailto/Gmail links stay under URL limits.
function planText(plan: PlanResponse, when: When) {
  const t = (iso: string) =>
    new Date(iso).toLocaleString([], { ...(when === "week" ? { weekday: "short" } : {}), hour: "numeric", minute: "2-digit" });
  const lines = [`ClassCast plan ${labelFor(when)}`, ""];
  if (plan.brief) lines.push(plan.brief, "");
  if (plan.classes.length) {
    lines.push("Classes");
    for (const c of plan.classes) {
      const leave = c.leaveBy ? ` (leave by ${t(c.leaveBy)}, ${c.travelMin} min)` : "";
      lines.push(`- ${t(c.start)} ${c.title}${c.location ? ` @ ${c.location}` : ""}${leave}`);
      if (c.bring.length) lines.push(`  Bring: ${c.bring.join(", ")}`);
    }
    lines.push("");
  }
  if (plan.due.length) {
    lines.push("Due");
    for (const d of plan.due) lines.push(`- ${d.title} (${dueWhen(d)})`);
  }
  const text = lines.join("\n").trim();
  return text.length > 1800 ? text.slice(0, 1780) + "\n…(trimmed)" : text;
}

function emailLinks(plan: PlanResponse, when: When) {
  const subject = `ClassCast plan ${labelFor(when)}`;
  const body = planText(plan, when);
  const q = (k: string, v: string) => `${k}=${encodeURIComponent(v)}`;
  return {
    mailto: `mailto:?${q("subject", subject)}&${q("body", body)}`,
    gmail: `https://mail.google.com/mail/?view=cm&fs=1&${q("su", subject)}&${q("body", body)}`,
  };
}

const dueWhen = (d: { start: string; allDay: boolean }) =>
  d.allDay
    ? new Date(d.start + "T00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })
    : new Date(d.start).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const dayHeading = (iso: string) => new Date(iso).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });

const pill = (on: boolean) => cn(buttonVariants({ variant: on ? "default" : "secondary", size: "sm" }), "rounded-full");

export default function Page() {
  const [links, setLinks] = useState<string[]>([""]);
  const [files, setFiles] = useState<{ name: string; text: string }[]>([]);
  const [dragging, setDragging] = useState(false);
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
    const picked = Array.from(list);
    const ics = picked.filter((f) => /\.ics$/i.test(f.name) || f.type === "text/calendar");
    if (ics.length < picked.length) return setError("Only .ics calendar files can be added.");
    const added: { name: string; text: string }[] = [];
    for (const f of ics) {
      if (f.size > 2 * 1024 * 1024) return setError(`${f.name} is over 2 MB.`);
      added.push({ name: f.name, text: await f.text() });
    }
    if (calendarCount + added.length > MAX_CALENDARS) return setError(`Up to ${MAX_CALENDARS} calendars at a time.`);
    setFiles((cur) => [...cur, ...added]);
    setError("");
  }

  // Drop .ics files, or a calendar link dragged from another tab.
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) return onFiles(e.dataTransfer.files);
    const url = (e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain")).split("\n")[0].trim();
    if (!/^(https?|webcal):\/\//i.test(url)) return setError("Drop a .ics file or a calendar link.");
    if (calendarCount >= MAX_CALENDARS) return setError(`Up to ${MAX_CALENDARS} calendars at a time.`);
    setLinks((cur) => {
      const empty = cur.findIndex((l) => !l.trim());
      return empty === -1 ? [...cur, url] : cur.map((l, i) => (i === empty ? url : l));
    });
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
        <p className="text-muted-foreground">When to leave, what to bring, and how to get there.</p>
      </header>

      <Card className="print:hidden">
      <CardContent>
      <form onSubmit={submit} className="space-y-5">
        <div
          className={cn("space-y-2 rounded-lg transition", dragging && "bg-primary/5 outline-2 outline-offset-4 outline-primary outline-dashed")}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={onDrop}
        >
          <Label htmlFor="ical-0">Class calendars (iCal links)</Label>
          {links.map((link, i) => (
            <div key={i} className="flex gap-2">
              <Input
                id={`ical-${i}`}
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
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove calendar link ${i + 1}`}
                  onClick={() => setLinks((cur) => cur.filter((_, j) => j !== i))}
                >
                  <X />
                </Button>
              )}
            </div>
          ))}
          {files.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`}>
                  <Badge className="pr-1">
                    📄 {f.name}
                    <button type="button" aria-label={`Remove ${f.name}`} className="rounded-full p-0.5 text-muted-foreground hover:text-foreground" onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}>
                      <X className="size-3" />
                    </button>
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          {links.length + files.length < MAX_CALENDARS && (
            <label
              className={cn(
                "flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed px-3 py-4 text-sm transition-colors hover:bg-muted/50",
                dragging ? "border-primary text-primary" : "text-muted-foreground",
              )}
            >
              <Upload className="size-5" />
              <span>{dragging ? "Drop to add" : "Drag .ics files or a calendar link here"}</span>
              <span className="text-xs">or click to choose files</span>
              <input
                type="file"
                accept=".ics,text/calendar"
                multiple
                className="sr-only"
                onChange={(e) => {
                  onFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          )}
          {links.length + files.length < MAX_CALENDARS && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setLinks((cur) => [...cur, ""])}>
              <Plus /> Add another link
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Up to {MAX_CALENDARS} calendars. Links are only used for this request and never saved.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Starting from</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={useMyLocation}>
              <MapPin /> {locating ? "Locating…" : gps ? "Using your location" : "Use my location"}
            </Button>
            {gps && (
              <Button type="button" variant="link" size="sm" onClick={() => setGps(null)}>
                Clear
              </Button>
            )}
          </div>
          {!gps && (
            <Input placeholder="or type your address (e.g. 123 College Ave, State College)" value={address} onChange={(e) => setAddress(e.target.value)} />
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
                className={pill(when.length === 10)}
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

        <Button type="submit" size="lg" disabled={loading} className="w-full">
          <CalendarCheck /> {loading ? "Planning…" : when === "week" ? "Plan my week" : "Plan my day"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>
      </CardContent>
      </Card>

      {plan && (
        <section className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
            <h2 className="font-semibold">Your plan {labelFor(planWhen)}</h2>
            <div className="flex flex-wrap gap-2 text-sm">
              <Button type="button" variant="outline" size="sm" onClick={() => saveAsPdf(planWhen)}>
                <FileDown /> Save as PDF
              </Button>
              <a href={emailLinks(plan, planWhen).gmail} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Send /> Gmail
              </a>
              <a href={emailLinks(plan, planWhen).mailto} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Mail /> Email
              </a>
            </div>
          </div>
          <h2 className="hidden text-xl font-semibold print:block">ClassCast plan {labelFor(planWhen)}</h2>
          {plan.warnings.length > 0 && (
            <ul className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              {plan.warnings.map((w) => (
                <li key={w}>⚠️ {w}</li>
              ))}
            </ul>
          )}
          {plan.classes.length === 0 && plan.due.length === 0 ? (
            <p className="text-center text-muted-foreground">Nothing on your calendar {labelFor(planWhen)}. Enjoy 🎉</p>
          ) : (
            <>
              <div className="rounded-xl bg-primary p-4 text-primary-foreground">
                {plan.classes.length === 0 && <p className="text-lg font-semibold">No classes {labelFor(planWhen)}</p>}
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
              {plan.due.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>📝 Due {labelFor(planWhen)}</CardTitle>
                  </CardHeader>
                  <CardContent>
                  <ul className="space-y-1 text-sm">
                    {plan.due.map((d) => (
                      <li key={d.id} className="flex justify-between gap-3">
                        <span>
                          {d.title}
                          {new Set(plan.due.map((x) => x.source)).size > 1 && <span className="text-xs text-muted-foreground"> · {d.source}</span>}
                        </span>
                        <span className="shrink-0 text-muted-foreground">{dueWhen(d)}</span>
                      </li>
                    ))}
                  </ul>
                  </CardContent>
                </Card>
              )}
              {plan.classes.length > 0 && (
                <div className="print:hidden">
                  <RouteMap plan={plan} />
                </div>
              )}
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

      <footer className="mt-10 print:hidden text-center text-xs text-muted-foreground">
        Weather: Open-Meteo · Maps: © OpenStreetMap · Routes: openrouteservice · AI: Gemini
        <span className="mx-1">·</span>
        <Link href="/about" className="underline hover:text-foreground">
          About
        </Link>
      </footer>
    </main>
  );
}
