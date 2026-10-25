import { afterEach, describe, expect, it, vi } from "vitest";
import { aiPlan, type AiInput } from "@/lib/ai";

const input: AiInput = [
  { id: "a", title: "MATH 230", notes: "", start: "Mon 9:05 AM", leaveBy: "Mon 8:48 AM", travelMin: 12, lateByMin: 0, weather: "37°F", ruleBring: ["Umbrella"] },
];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("aiPlan", () => {
  it("explains a missing key", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(await aiPlan(input)).toEqual({ ok: false, reason: expect.stringMatching(/No AI key/) });
  });

  it("uses Gemini when its key is set and validates the JSON", async () => {
    vi.stubEnv("GEMINI_API_KEY", ' "AIzaTEST" ');
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("AIzaTEST");
      const reply = { brief: "Leave by 8:48 AM.", classes: [{ id: "a", bring: ["Umbrella", "Calculator"] }, { id: "zzz", bring: ["x"] }] };
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] }, finishReason: "STOP" }] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await aiPlan(input);
    expect(r).toEqual({ ok: true, provider: "gemini", brief: "Leave by 8:48 AM.", bring: { a: ["Umbrella", "Calculator"] } });
  });

  it("reports Gemini errors in plain words", async () => {
    vi.stubEnv("GEMINI_API_KEY", "AIzaTEST");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { message: "quota" } }, { status: 429 })));
    expect(await aiPlan(input)).toEqual({ ok: false, reason: expect.stringMatching(/quota/) });
  });

  it("rejects malformed model output", async () => {
    vi.stubEnv("GEMINI_API_KEY", "AIzaTEST");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ candidates: [{ content: { parts: [{ text: '{"brief": 5}' }] }, finishReason: "STOP" }] })));
    expect(await aiPlan(input)).toEqual({ ok: false, reason: expect.stringMatching(/couldn't be read/) });
  });

  it("falls through to Groq when Gemini fails", async () => {
    vi.stubEnv("GEMINI_API_KEY", "AIzaTEST");
    vi.stubEnv("GROQ_API_KEY", "gsk_TEST");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        if (url.includes("googleapis")) return Response.json({ error: { message: "billing required" } }, { status: 403 });
        expect((init.headers as Record<string, string>).authorization).toBe("Bearer gsk_TEST");
        const reply = { brief: "Leave by 8:48 AM.", classes: [{ id: "a", bring: ["Calculator"] }] };
        return Response.json({ choices: [{ message: { content: JSON.stringify(reply) } }] });
      }),
    );
    expect(await aiPlan(input)).toEqual({ ok: true, provider: "groq", brief: "Leave by 8:48 AM.", bring: { a: ["Calculator"] } });
  });
});
