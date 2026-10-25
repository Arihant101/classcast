import { afterEach, describe, expect, it, vi } from "vitest";
import { geocodeMany } from "@/lib/geocode";

afterEach(() => vi.unstubAllGlobals());

describe("geocodeMany", () => {
  it("looks up each unique place once and skips Nominatim once the budget is spent", async () => {
    const hosts: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = new URL(url);
        hosts.push(u.hostname);
        return Response.json({ results: [{ latitude: 40.8, longitude: -77.86 }] });
      }),
    );
    const out = await geocodeMany(["Alpha Hall 1", "Alpha Hall 1", " Beta Lab ", "https://zoom.us/j/1"], 0);
    expect(hosts.every((h) => h === "geocoding-api.open-meteo.com")).toBe(true);
    expect(hosts).toHaveLength(2); // Alpha + Beta; Zoom is virtual
    expect(out.get("Beta Lab")).toEqual({ lat: 40.8, lon: -77.86 });
    expect(out.get("https://zoom.us/j/1")).toBeNull();
  });
});
