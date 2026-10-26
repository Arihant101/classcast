import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, GET, POST } from "@/app/api/remember/route";
import { cleanLinks, decodeLinks, encodeLinks } from "@/lib/remember";

const req = ({ method = "GET", body, cookie }: { method?: string; body?: string; cookie?: string } = {}) =>
  new NextRequest("http://localhost/api/remember", {
    method,
    body,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
  });

describe("cleanLinks", () => {
  it("keeps up to 5 unique calendar links and drops junk", () => {
    const links = ["webcal://a.example/x.ics", " https://b.example/y.ics ", "https://b.example/y.ics", "javascript:alert(1)", 42, ...Array(6).fill(0).map((_, i) => `https://c${i}.example`)];
    expect(cleanLinks(links)).toEqual(["webcal://a.example/x.ics", "https://b.example/y.ics", "https://c0.example", "https://c1.example", "https://c2.example"]);
  });
  it("rejects empty or oversized input", () => {
    expect(cleanLinks([])).toBeNull();
    expect(cleanLinks("https://a.example")).toBeNull();
    expect(cleanLinks(Array.from({ length: 5 }, (_, i) => `https://x${i}.example/${"a".repeat(900)}`))).toBeNull();
  });
  it("round-trips through the cookie encoding and ignores tampered values", () => {
    expect(decodeLinks(encodeLinks(["https://a.example/x.ics"]))).toEqual(["https://a.example/x.ics"]);
    expect(decodeLinks("%7Bnot-json")).toEqual([]);
  });
});

describe("/api/remember", () => {
  it("saves links in an HttpOnly, SameSite=Strict cookie scoped to the route", async () => {
    const res = await POST(req({ method: "POST", body: JSON.stringify({ links: ["https://a.example/x.ics"] }) }));
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toMatch(/^cc_links=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=strict/i);
    expect(cookie).toMatch(/Path=\/api\/remember/);
    expect(cookie).toMatch(/Max-Age=1296000/);

    const value = cookie.split(";")[0];
    expect(await (await GET(req({ cookie: value }))).json()).toEqual({ links: ["https://a.example/x.ics"] });
  });
  it("refuses non-JSON posts and invalid links", async () => {
    const form = new NextRequest("http://localhost/api/remember", { method: "POST", body: "links=x", headers: { "content-type": "application/x-www-form-urlencoded" } });
    expect((await POST(form)).status).toBe(415);
    expect((await POST(req({ method: "POST", body: JSON.stringify({ links: ["ftp://x"] }) }))).status).toBe(400);
  });
  it("forgets by expiring the cookie", async () => {
    expect(DELETE().headers.get("set-cookie")).toMatch(/cc_links=;.*Max-Age=0/);
  });
});
