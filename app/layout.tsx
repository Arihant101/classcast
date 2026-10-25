import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClassCast",
  description: "When to leave, what to bring, and how to get to class. Built from your calendar and the forecast.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
