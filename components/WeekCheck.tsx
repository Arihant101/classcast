import type { WeekSummary } from "@/lib/weekSummary";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const hrs = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ""}` : `${min}m`);

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {children.length ? (
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm marker:text-highlight">{children}</ul>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

export default function WeekCheck({ week }: { week: WeekSummary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>🗓️ Reality Check</CardTitle>
        <CardDescription>Tight turnarounds and busy days, spotted before the week starts.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Section title="📈 Busiest day" empty="No classes this week.">
          {week.busiest
            ? [
                <li key="b">
                  <span className="font-medium">{week.busiest.day}</span>: {week.busiest.classes} classes, {week.busiest.hours} h in class
                </li>,
              ]
            : []}
        </Section>
        <Section title="⚠️ Risky back-to-backs" empty="None. Every switch has breathing room.">
          {week.risky.map((r) => (
            <li key={`${r.day}-${r.to}`}>
              <span className="font-medium">{r.day}</span>: {r.from} → {r.to}, {r.gapMin} min gap for a {r.travelMin} min trip
              {r.slackMin < 0 && <span className="text-destructive"> (about {-r.slackMin} min late)</span>}
            </li>
          ))}
        </Section>
        <Section title="🌧️ Rainy days" empty="No rain in the forecast for your classes.">
          {week.rainyDays.map((d) => (
            <li key={d.day}>
              <span className="font-medium">{d.day}</span>: {d.snow ? "snow" : "rain"} around {d.classes} {d.classes === 1 ? "class" : "classes"}
            </li>
          ))}
        </Section>
        <Section title="🕒 Free windows worth using" empty="No breaks of 90+ minutes between classes.">
          {week.freeWindows.map((w) => (
            <li key={`${w.day}-${w.start}`}>
              <span className="font-medium">{w.day}</span>: {time(w.start)}–{time(w.end)} ({hrs(w.minutes)})
            </li>
          ))}
        </Section>
      </CardContent>
    </Card>
  );
}
