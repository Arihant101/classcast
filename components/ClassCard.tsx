import type { PlannedClass } from "@/app/api/plan/route";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { Weather } from "@/lib/weather";

export type Units = "F" | "C";

// WMO codes -> emoji + words
function describe(code: number): [string, string] {
  if (code === 0) return ["☀️", "Clear"];
  if (code <= 2) return ["🌤️", "Partly cloudy"];
  if (code === 3) return ["☁️", "Cloudy"];
  if (code <= 48) return ["🌫️", "Fog"];
  if (code <= 57) return ["🌦️", "Drizzle"];
  if (code <= 67 || (code >= 80 && code <= 82)) return ["🌧️", "Rain"];
  if (code <= 77 || code === 85 || code === 86) return ["🌨️", "Snow"];
  return ["⛈️", "Storms"];
}

export const temp = (c: number, u: Units) => `${Math.round(u === "F" ? (c * 9) / 5 + 32 : c)}°${u}`;
const wind = (kmh: number, u: Units) => (u === "F" ? `${Math.round(kmh / 1.609)} mph` : `${Math.round(kmh)} km/h`);
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function WeatherLine({ w, units }: { w: Weather; units: Units }) {
  const [icon, label] = describe(w.code);
  return (
    <p className="text-sm text-muted-foreground">
      {icon} {label} · {temp(w.tempC, units)} (feels {temp(w.feelsC, units)}) · 💧 {w.precipProb}% · 💨 {wind(w.windKmh, units)}
    </p>
  );
}

const MODE_ICON = { walk: "🚶", bike: "🚲", drive: "🚗" } as const;

export default function ClassCard({
  c,
  units,
  index,
  mode,
  showSource = false,
}: {
  c: PlannedClass;
  units: Units;
  index: number;
  mode: keyof typeof MODE_ICON;
  showSource?: boolean;
}) {
  return (
    <Card className="block px-4">
    <article>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">
            <span className="mr-2 text-muted-foreground">{index + 1}.</span>
            {c.title}
          </h3>
          <p className="text-sm text-muted-foreground">
            {time(c.start)}–{time(c.end)} · {c.location || "no location"}
          </p>
          {showSource && <p className="mt-0.5 text-xs text-muted-foreground">📅 {c.source}</p>}
        </div>
        {c.leaveBy && (
          <div className="shrink-0 text-right">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Leave by</p>
            <p className="text-2xl font-bold text-highlight">{time(c.leaveBy)}</p>
          </div>
        )}
      </div>

      {c.lateByMin > 0 && (
        <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          ⚠️ Your previous class ends too late. You&apos;ll be about {c.lateByMin} min late.
        </p>
      )}
      {c.note && <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">{c.note}</p>}

      <div className="mt-3 space-y-1">
        {c.route && (
          <p className="text-sm">
            {MODE_ICON[mode]} {c.travelMin} min from {c.from} · {(c.route.meters / 1609).toFixed(1)} mi
            {c.route.estimated && <span className="text-muted-foreground"> (estimate)</span>}
          </p>
        )}
        {c.weather ? <WeatherLine w={c.weather} units={units} /> : c.coords && <p className="text-sm text-muted-foreground">No forecast yet for this time.</p>}
      </div>

      {c.bring.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {c.bring.map((b) => (
            <li key={b}>
              <Badge className="h-auto py-0.5 whitespace-normal">{b}</Badge>
            </li>
          ))}
        </ul>
      )}
    </article>
    </Card>
  );
}
