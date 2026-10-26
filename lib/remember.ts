// "Remember me" for calendar links. The links live in an HttpOnly cookie scoped to /api/remember:
// page scripts can't read it (so XSS can't steal it), and it's only sent to that one route,
// never with page loads, the plan request, or analytics.
export const REMEMBER_COOKIE = "cc_links";
export const REMEMBER_PATH = "/api/remember";
export const REMEMBER_MAX_AGE = 15 * 24 * 60 * 60; // 15 days
const MAX_LINKS = 5;
const MAX_COOKIE = 3800; // browsers cap a cookie at ~4 KB

/** Keeps only plausible calendar links. Returns null if nothing usable or too big for a cookie. */
export function cleanLinks(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  const links = [
    ...new Set(
      input
        .filter((l): l is string => typeof l === "string")
        .map((l) => l.trim())
        .filter((l) => l.length <= 1000 && /^(https?|webcal):\/\/[^\s]+$/i.test(l)),
    ),
  ].slice(0, MAX_LINKS);
  if (!links.length || encodeLinks(links).length > MAX_COOKIE) return null;
  return links;
}

export const encodeLinks = (links: string[]) => encodeURIComponent(JSON.stringify(links));

export function decodeLinks(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    return cleanLinks(JSON.parse(decodeURIComponent(raw))) ?? [];
  } catch {
    return [];
  }
}
