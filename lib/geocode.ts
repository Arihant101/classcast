// Turns messy calendar locations ("Thomas 101", "HUB-Robeson Center") into coordinates.
// Order: iCal GEO -> cache -> Nominatim (biased to campus) -> Open-Meteo geocoding (city names).
export type LatLon = { lat: number; lon: number };

// Penn State University Park. Override with CAMPUS_CENTER="lat,lon" for another school.
const [CAMPUS_LAT, CAMPUS_LON] = (process.env.CAMPUS_CENTER ?? "40.7982,-77.8599").split(",").map(Number);
const UA = "ClassCast/0.1 (HackPSU student project)";

const cache = new Map<string, LatLon | null>();
let lastNominatim = 0;

const VIRTUAL = /(https?:\/\/|zoom|teams\.microsoft|meet\.google|webex|online|virtual|remote)/i;

export function isVirtual(location: string) {
  return VIRTUAL.test(location);
}

/** Query variants to try, most specific first. Exported for tests. */
export function candidates(location: string): string[] {
  const clean = location.replace(/\s+/g, " ").trim();
  const noRoom = clean
    .replace(/\b(room|rm\.?)\s*\w+/gi, "")
    .replace(/[\s,#-]+\d+[a-z]?\s*$/i, "")
    .trim();
  const out = [clean, noRoom, `${noRoom} Building`];
  return [...new Set(out.filter((s) => s.length > 1))];
}

async function nominatim(q: string): Promise<LatLon | null> {
  // Usage policy: max 1 request/second.
  const wait = lastNominatim + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatim = Date.now();

  const d = 0.05; // ~5 km box around campus, preferred but not required
  const params = new URLSearchParams({
    q,
    format: "jsonv2",
    limit: "1",
    viewbox: `${CAMPUS_LON - d},${CAMPUS_LAT + d},${CAMPUS_LON + d},${CAMPUS_LAT - d}`,
    bounded: "1",
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { "user-agent": UA },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;
  const [hit] = (await res.json()) as { lat: string; lon: string }[];
  return hit ? { lat: Number(hit.lat), lon: Number(hit.lon) } : null;
}

async function nominatimFree(q: string): Promise<LatLon | null> {
  const wait = lastNominatim + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatim = Date.now();
  const params = new URLSearchParams({ q, format: "jsonv2", limit: "1" });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { "user-agent": UA },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;
  const [hit] = (await res.json()) as { lat: string; lon: string }[];
  return hit ? { lat: Number(hit.lat), lon: Number(hit.lon) } : null;
}

async function openMeteoGeocode(q: string): Promise<LatLon | null> {
  const params = new URLSearchParams({ name: q, count: "1" });
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { results?: { latitude: number; longitude: number }[] };
  const hit = data.results?.[0];
  return hit ? { lat: hit.latitude, lon: hit.longitude } : null;
}

/** Campus building / room names. With `fast`, skips Nominatim (and its 1 req/s throttle). */
export async function geocodeLocation(location: string, fast = false): Promise<LatLon | null> {
  const key = location.trim().toLowerCase();
  if (!key || isVirtual(location)) return null;
  if (cache.has(key)) return cache.get(key)!;

  let hit: LatLon | null = null;
  try {
    if (!fast) {
      for (const q of candidates(location)) {
        hit = await nominatim(q);
        if (hit) break;
      }
    }
    hit ??= await openMeteoGeocode(candidates(location).at(-2) ?? location);
  } catch {
    hit = null;
  }
  // A fast miss isn't cached, so a later request can still try Nominatim.
  if (hit || !fast) cache.set(key, hit);
  return hit;
}

/**
 * Geocodes many locations, each unique one once. Nominatim is throttled to 1 req/s, so once
 * `budgetMs` is spent the rest go to Open-Meteo in parallel. Keeps big week views under the
 * function time limit.
 */
export async function geocodeMany(locations: string[], budgetMs = 15_000): Promise<Map<string, LatLon | null>> {
  const deadline = Date.now() + budgetMs;
  const unique = [...new Set(locations.map((l) => l.trim()).filter(Boolean))];
  const out = new Map<string, LatLon | null>();
  const late: string[] = [];
  for (const loc of unique) {
    if (Date.now() < deadline) out.set(loc, await geocodeLocation(loc));
    else late.push(loc);
  }
  const hits = await Promise.all(late.map((loc) => geocodeLocation(loc, true)));
  late.forEach((loc, i) => out.set(loc, hits[i]));
  return out;
}

/** A typed home address (not limited to campus). */
export async function geocodeAddress(address: string): Promise<LatLon | null> {
  try {
    return (await nominatimFree(address)) ?? (await openMeteoGeocode(address));
  } catch {
    return null;
  }
}
