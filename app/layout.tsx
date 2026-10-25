import type { Metadata } from "next";
import { connection } from "next/server";
import { Analytics } from "@vercel/analytics/next";
import "@fontsource-variable/inter";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClassCast",
  description: "When to leave, what to bring, and how to get to class. Built from your calendar and the forecast.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Render per request so Next.js can stamp each page's scripts with the CSP nonce from proxy.ts.
  await connection();
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
