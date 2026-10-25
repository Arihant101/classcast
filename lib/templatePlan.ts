// No-AI fallback: builds the daily brief and bring list from the computed plan with plain rules,
// so the app is fully usable without any paid API key.
import { isSnow, isWet, type Weather } from "./weather";

export type TemplateClass = {
  id: string;
  title: string;
  start: string; // formatted local time, e.g. "Mon 9:05 AM"
  leaveBy: string | null;
  lateByMin: number;
  weather: Weather | null;
  bring: string[]; // rule-based items from ruleBring
};

// Course-name hints -> one extra item. First match wins.
const SUBJECT_ITEMS: [RegExp, string][] = [
  [/\b(math|calc|stat|physics|phys|econ|engr|e ?mch|finance|acctg)\b/i, "Calculator"],
  [/\b(cmpsc|cmpen|cse|cs|ist|ds|programming|software|computer)\b/i, "Laptop + charger"],
  [/\b(chem|biol?|bio|lab)\b/i, "Lab notebook"],
  [/\b(art|draw|design|arch)\b/i, "Sketchbook"],
  [/\b(kines|pe|yoga|gym|swim)\b/i, "Gym clothes"],
];

export function templateBring(title: string, rule: string[]): string[] {
  const out = [...rule];
  const hint = SUBJECT_ITEMS.find(([re]) => re.test(title))?.[1];
  if (hint && !out.some((s) => s.toLowerCase().includes(hint.split(" ")[0].toLowerCase()))) out.push(hint);
  if (out.length < 5) out.push("Notebook + pen");
  return out.slice(0, 5);
}

const cToF = (c: number) => Math.round((c * 9) / 5 + 32);

function weatherNote(classes: TemplateClass[]): string {
  const known = classes.filter((c) => c.weather);
  const snow = known.find((c) => isSnow(c.weather!.code));
  if (snow) return `Snow around your ${snow.start} class, so wear boots and leave a little early.`;
  const wet = known.find((c) => isWet(c.weather!));
  if (wet) return `Rain is likely around ${wet.start}; grab an umbrella.`;
  if (!known.length) return "";
  const feels = known.map((c) => cToF(c.weather!.feelsC));
  const lo = Math.min(...feels);
  const hi = Math.max(...feels);
  if (lo < 32) return `It feels like ${lo}°F out, so bundle up.`;
  if (hi > 85) return `It gets up to ${hi}°F, so bring water.`;
  return `Weather looks fine (feels ${lo === hi ? lo : `${lo}–${hi}`}°F).`;
}

export function templateBrief(classes: TemplateClass[], due: { title: string; due: string }[]): string {
  const parts: string[] = [];
  const first = classes.find((c) => c.leaveBy);
  if (first) parts.push(`Leave by ${first.leaveBy} for ${first.title} at ${first.start}.`);
  else if (classes.length) parts.push(`First up: ${classes[0].title} at ${classes[0].start}.`);
  const w = weatherNote(classes);
  if (w) parts.push(w);
  const late = classes.find((c) => c.lateByMin > 0);
  if (late) parts.push(`Heads up: the gap before ${late.title} is too short, so you'll be about ${late.lateByMin} min late.`);
  if (due.length) {
    const soon = due.slice(0, 2).map((d) => `${d.title.replace(/\s*\[[^\]]*\]\s*$/, "")} (${d.due})`);
    parts.push(`Due soon: ${soon.join(" and ")}.`);
  }
  return parts.join(" ").slice(0, 600);
}
