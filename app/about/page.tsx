import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About · ClassCast",
  description: "Why we built ClassCast, how it works, and what we learned along the way.",
};

const features = [
  { title: "Leave-by time", body: "When to head out so you arrive on time." },
  { title: "Walking route", body: "Your path between buildings, on a map." },
  { title: "Bring list", body: "Umbrella, boots, or nothing extra." },
  { title: "Daily brief", body: "A short AI summary of your day." },
  { title: "Due list", body: "Canvas assignments and deadlines, kept apart from your classes." },
  { title: "Save or share", body: "Save your plan as a PDF, or send it with Gmail or email." },
];

const stack = [
  { label: "Stack", body: "Next.js on Vercel, with code in GitHub." },
  {
    label: "Data",
    body: "The calendar link supplies the locations. Open-Meteo gives the forecast. OpenRouteService gives routes. OpenStreetMap gives geocoding and map tiles.",
  },
  {
    label: "AI",
    body: "Gemini (or Claude as a fallback) writes the bring list and brief. The code does the time math, so the AI can't invent leave times.",
  },
];

const challenges = [
  {
    title: "Security",
    body: "The server fetches any calendar URL a user enters, which is an SSRF risk. We blocked internal IPs and checked every redirect.",
  },
  {
    title: "Prompt injection",
    body: "Calendar text is untrusted, so we treat it that way before it reaches the AI.",
  },
  {
    title: "Map tiles blocked",
    body: "Our privacy header stripped the Referer that OpenStreetMap requires. Sending only the site origin fixed it.",
  },
  {
    title: "Deploy error",
    body: "Vercel built the empty main branch. Merging the PR fixed it.",
  },
  {
    title: "Canvas feeds",
    body: "Canvas assignments are all-day or zero-length events, so they were dropped or showed up as fake classes. We split them into a Due list and matched all-day items by your own time zone.",
  },
  {
    title: "Live APIs",
    body: "The build sandbox blocked the weather and map APIs, so we tested with mock data first.",
  },
];

const lessons = [
  "Keep API keys server-side.",
  "Treat user URLs and calendar text as hostile input.",
  "Let code do the math and AI do the language.",
  "Real calendar feeds are messier than the spec: test with the shapes people actually use.",
];

const card = "rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10";
const section = "mt-6 space-y-3";
const heading = "text-xl font-semibold";

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6">
        <Link href="/" className="text-sm text-primary hover:underline">
          ← Back to ClassCast
        </Link>
        <h1 className="mt-2 text-3xl font-bold">About ClassCast ☔</h1>
        <p className="text-muted-foreground">When do I leave, which route, and what do I bring?</p>
      </header>

      <section className={section} aria-labelledby="inspiration">
        <h2 id="inspiration" className={heading}>Inspiration</h2>
        <p>
          Students juggle back-to-back classes across campus, and rain or snow changes how long the walk takes. I
          wanted one link to answer: when do I leave, which route, and what do I bring?
        </p>
      </section>

      <section className={section} aria-labelledby="what-it-does">
        <h2 id="what-it-does" className={heading}>What it does</h2>
        <p>
          Paste up to 5 calendar links (like LionPATH and Canvas), or drag in .ics files. ClassCast reads each
          event&rsquo;s location, checks the weather, and gives you:
        </p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {features.map((f) => (
            <li key={f.title} className={card}>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className={section} aria-labelledby="how-we-built-it">
        <h2 id="how-we-built-it" className={heading}>How we built it</h2>
        <dl className={`${card} divide-y divide-border py-0`}>
          {stack.map((s) => (
            <div key={s.label} className="grid gap-1 py-3 sm:grid-cols-[5rem_1fr] sm:gap-3">
              <dt className="font-semibold">{s.label}</dt>
              <dd>{s.body}</dd>
            </div>
          ))}
        </dl>

        <h3 className="pt-2 font-semibold">Leave-by formula</h3>
        <div
          role="math"
          aria-label="t leave equals t class minus t travel minus t buffer minus t weather"
          className="flex flex-wrap items-baseline gap-2 rounded-xl border-l-4 border-primary bg-primary/10 px-4 py-3 font-serif text-lg italic"
        >
          <span>t<sub className="not-italic">leave</sub></span>
          <span className="not-italic text-muted-foreground">=</span>
          <span>t<sub className="not-italic">class</sub></span>
          <span className="not-italic text-muted-foreground">&minus;</span>
          <span>t<sub className="not-italic">travel</sub></span>
          <span className="not-italic text-muted-foreground">&minus;</span>
          <span>t<sub className="not-italic">buffer</sub></span>
          <span className="not-italic text-muted-foreground">&minus;</span>
          <span>t<sub className="not-italic">weather</sub></span>
        </div>
        <p className="text-sm text-muted-foreground">With a 5 minute buffer, plus 15% more travel time in rain and 25% in snow.</p>
      </section>

      <section className={section} aria-labelledby="challenges">
        <h2 id="challenges" className={heading}>Challenges</h2>
        <ul className="list-disc space-y-2 pl-5">
          {challenges.map((c) => (
            <li key={c.title}>
              <strong>{c.title}:</strong> {c.body}
            </li>
          ))}
        </ul>
      </section>

      <section className={section} aria-labelledby="learned">
        <h2 id="learned" className={heading}>What we learned</h2>
        <ol className="list-decimal space-y-2 pl-5">
          {lessons.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ol>
      </section>
    </main>
  );
}
