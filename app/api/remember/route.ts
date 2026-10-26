import { NextRequest, NextResponse } from "next/server";
import { REMEMBER_COOKIE, REMEMBER_MAX_AGE, REMEMBER_PATH, cleanLinks, decodeLinks, encodeLinks } from "@/lib/remember";

const noStore = { "cache-control": "no-store" };

/** Returns the saved links (empty if none). */
export function GET(req: NextRequest) {
  return NextResponse.json({ links: decodeLinks(req.cookies.get(REMEMBER_COOKIE)?.value) }, { headers: noStore });
}

/** Saves links for 15 days. */
export async function POST(req: NextRequest) {
  // JSON-only, plus SameSite=Strict on the cookie, keeps other sites from writing it.
  if (!req.headers.get("content-type")?.includes("application/json")) return NextResponse.json({ error: "Expected JSON." }, { status: 415 });
  const body = (await req.json().catch(() => null)) as { links?: unknown } | null;
  const links = cleanLinks(body?.links);
  if (!links) return NextResponse.json({ error: "No valid calendar links to save." }, { status: 400 });
  const res = NextResponse.json({ links }, { headers: noStore });
  res.cookies.set(REMEMBER_COOKIE, encodeLinks(links), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: REMEMBER_PATH,
    maxAge: REMEMBER_MAX_AGE,
  });
  return res;
}

/** Forgets the saved links. */
export function DELETE() {
  const res = NextResponse.json({ links: [] }, { headers: noStore });
  res.cookies.set(REMEMBER_COOKIE, "", { httpOnly: true, sameSite: "strict", path: REMEMBER_PATH, maxAge: 0 });
  return res;
}
