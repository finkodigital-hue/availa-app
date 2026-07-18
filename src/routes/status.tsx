import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/status")({
  head: () => ({
    meta: [
      { title: "System status — Bookzenvo" },
      {
        name: "description",
        content: "Current availability of Bookzenvo's booking pages, calendar, customer portal and platform.",
      },
    ],
  }),
  component: StatusPage,
});

function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-semibold tracking-tight ${className}`}>
      Bookzenvo<span className="text-[color:var(--gold-deep)]">.</span>
    </span>
  );
}

function Mark() {
  return (
    <span className="precision-mark" aria-hidden>
      <span />
      <span />
      <span />
    </span>
  );
}

type ComponentStatus = "operational" | "degraded" | "outage";

const COMPONENTS: { name: string; description: string; status: ComponentStatus }[] = [
  {
    name: "Public booking pages",
    description: "Client-facing /book pages — browsing services and creating bookings.",
    status: "operational",
  },
  {
    name: "Calendar & scheduling",
    description: "The admin calendar, staff availability and booking management.",
    status: "operational",
  },
  {
    name: "Customer portal",
    description: "Client sign-in, upcoming bookings and profile management.",
    status: "operational",
  },
  {
    name: "Platform & data",
    description: "Core database, authentication and file storage.",
    status: "operational",
  },
];

const STATUS_META: Record<ComponentStatus, { label: string; dot: string; text: string }> = {
  operational: { label: "Operational", dot: "oklch(0.62 0.15 155)", text: "text-[color:var(--confirmed)]" },
  degraded: { label: "Degraded performance", dot: "oklch(0.75 0.15 85)", text: "text-[color:var(--pending)]" },
  outage: { label: "Outage", dot: "oklch(0.6 0.2 25)", text: "text-destructive" },
};

function StatusPage() {
  const overall: ComponentStatus = COMPONENTS.some((c) => c.status === "outage")
    ? "outage"
    : COMPONENTS.some((c) => c.status === "degraded")
      ? "degraded"
      : "operational";

  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  useEffect(() => {
    setCheckedAt(new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" }));
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <header className="border-b border-border">
        <div className="max-w-[860px] mx-auto px-6 h-20 flex items-center justify-between">
          <Link to="/">
            <Wordmark className="text-[1.5rem]" />
          </Link>
          <Link to="/" className="text-[.9rem] font-medium text-muted-foreground hover:text-foreground transition-colors">
            Back to home
          </Link>
        </div>
      </header>

      <main className="max-w-[860px] mx-auto px-6 py-16 md:py-20">
        <div className="flex items-center mb-4">
          <Mark />
          <span className="text-[.7rem] font-semibold tracking-[0.16em] uppercase text-[color:var(--gold-deep)]">
            System status
          </span>
        </div>

        <div className="rounded-xl border border-border bg-white px-6 py-6 md:px-8 md:py-7 flex items-center gap-4 mb-10">
          <CheckCircle2
            className="h-8 w-8 shrink-0"
            style={{ color: STATUS_META[overall].dot }}
          />
          <div>
            <h1 className="font-display font-medium text-[1.5rem] md:text-[1.7rem] leading-tight">
              {overall === "operational"
                ? "All systems operational"
                : overall === "degraded"
                  ? "Some systems are degraded"
                  : "We're experiencing an outage"}
            </h1>
            {checkedAt && (
              <p className="text-[.85rem] text-muted-foreground mt-1">Last checked {checkedAt}</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border overflow-hidden bg-white">
          {COMPONENTS.map((c, i) => (
            <div
              key={c.name}
              className={`flex items-center justify-between gap-4 px-6 py-5 ${i > 0 ? "border-t border-border" : ""}`}
            >
              <div className="min-w-0">
                <div className="font-medium text-[.95rem]">{c.name}</div>
                <div className="text-[.85rem] text-muted-foreground mt-0.5">{c.description}</div>
              </div>
              <span className={`inline-flex items-center gap-2 text-[.85rem] font-medium shrink-0 ${STATUS_META[c.status].text}`}>
                <span className="h-2 w-2 rounded-full" style={{ background: STATUS_META[c.status].dot }} />
                {STATUS_META[c.status].label}
              </span>
            </div>
          ))}
        </div>

        <p className="text-[.85rem] text-muted-foreground mt-8 max-w-[60ch]">
          This page reflects the current availability of Bookzenvo's core systems. It isn't a feature
          roadmap — if you're looking for what's shipping next, get in touch and we'll point you to it.
        </p>
      </main>

      <footer className="border-t border-border py-8">
        <div className="max-w-[860px] mx-auto px-6 text-[.85rem] text-muted-foreground">
          © {new Date().getFullYear()} Bookzenvo
        </div>
      </footer>
    </div>
  );
}
