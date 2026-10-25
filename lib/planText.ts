// Date ranges, labels and the plain-text plan used for email. Browser-local time throughout.
import type { PlanResponse } from "@/app/api/plan/route";

// "0".."6" = days from today, "week" = next 7 days, "YYYY-MM-DD" = a picked date
export type When = string;

export const midnight = (offset = 0) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
};

export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function rangeFor(when: When) {
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

export function labelFor(when: When) {
  if (when === "week") return "this week";
  if (when === "0") return "today";
  if (when === "1") return "tomorrow";
  const d = when.length === 10 ? new Date(when + "T00:00") : midnight(Number(when));
  return "on " + d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

// Canvas titles look like "Homework 5 [CMPSC 360 Fall 2026]"; pull the course out of the brackets.
export function splitCourse(title: string) {
  const m = title.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
  return m ? { name: m[1], course: m[2] } : { name: title, course: "" };
}

// Plain-text version of the plan for email. Kept short so mailto/Gmail links stay under URL limits.
export function planText(plan: PlanResponse, when: When) {
  const t = (iso: string) =>
    new Date(iso).toLocaleString([], { ...(when === "week" ? { weekday: "short" } : {}), hour: "numeric", minute: "2-digit" });
  const lines = [`ClassCast plan ${labelFor(when)}`, ""];
  if (plan.brief) lines.push(plan.brief, "");
  if (plan.week) {
    const w = plan.week;
    const hm = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    lines.push("Reality Check");
    if (w.busiest) lines.push(`• Busiest day: ${w.busiest.day} (${w.busiest.classes} classes, ${w.busiest.hours} h)`);
    for (const r of w.risky) lines.push(`• Risky: ${r.day} ${r.from} → ${r.to}, ${r.gapMin} min gap for a ${r.travelMin} min trip`);
    for (const d of w.rainyDays) lines.push(`• ${d.snow ? "Snow" : "Rain"}: ${d.day}`);
    for (const f of w.freeWindows) lines.push(`• Free: ${f.day} ${hm(f.start)}–${hm(f.end)}`);
    lines.push("");
  }
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
    for (const d of plan.due) {
      const { name, course } = splitCourse(d.title);
      lines.push(`• ${name}${course ? ` (${course})` : ""}, due ${dueWhen(d)}`);
    }
  }
  const text = lines.join("\n").trim();
  return text.length > 1800 ? text.slice(0, 1780) + "\n…(trimmed)" : text;
}

export function emailLinks(plan: PlanResponse, when: When) {
  const subject = `ClassCast plan ${labelFor(when)}`;
  const body = planText(plan, when);
  const q = (k: string, v: string) => `${k}=${encodeURIComponent(v)}`;
  return {
    mailto: `mailto:?${q("subject", subject)}&${q("body", body)}`,
    gmail: `https://mail.google.com/mail/?view=cm&fs=1&${q("su", subject)}&${q("body", body)}`,
  };
}

export const dueWhen = (d: { start: string; allDay: boolean }) =>
  d.allDay
    ? new Date(d.start + "T00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })
    : new Date(d.start).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

