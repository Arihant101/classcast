import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Page not found | ClassCast",
  description: "This page does not exist. Head back to ClassCast to plan your day.",
};

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-4 py-8 text-center">
      <div className="text-6xl" aria-hidden="true">
        🌧️
      </div>
      <h1 className="mt-4 text-3xl font-bold">404: this page got rained out</h1>
      <p className="mt-2 text-muted-foreground">
        We could not find the page you were looking for. It may have moved, or the link might have a typo.
      </p>
      <Link
        href="/"
        className={cn(buttonVariants(), "mt-6")}
      >
        Back to ClassCast
      </Link>
    </main>
  );
}
