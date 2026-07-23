import { createFileRoute, Link } from "@tanstack/react-router";
import { CircleDot } from "lucide-react";

export const Route = createFileRoute("/status")({
  head: () => ({
    meta: [
      { title: "Service notices — Bookzenvo" },
      {
        name: "description",
        content: "Service notices and incident updates for Bookzenvo.",
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

function StatusPage() {
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
            Service notices
          </span>
        </div>

        <div className="rounded-xl border border-border bg-white px-6 py-6 md:px-8 md:py-7 flex items-center gap-4 mb-8">
          <CircleDot className="h-8 w-8 shrink-0 text-[color:var(--gold-deep)]" />
          <div>
            <h1 className="font-display font-medium text-[1.5rem] md:text-[1.7rem] leading-tight">
              No active incident notices
            </h1>
            <p className="text-[.9rem] text-muted-foreground mt-1">
              We will post an update here when we are aware of a platform-wide issue.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-white px-6 py-6 md:px-8 md:py-7">
          <h2 className="font-display text-[1.2rem]">How this page works</h2>
          <p className="text-[.9rem] text-muted-foreground mt-3 leading-relaxed max-w-[64ch]">
            This is a manually maintained notice board, not an automated health monitor. If something in your
            Bookzenvo account does not look right, please visit the help centre and let us know.
          </p>
          <Link
            to="/help"
            className="inline-flex mt-5 text-[.9rem] font-medium text-[color:var(--gold-deep)] hover:text-foreground transition-colors"
          >
            Visit the help centre →
          </Link>
        </div>
      </main>

      <footer className="border-t border-border py-8">
        <div className="max-w-[860px] mx-auto px-6 text-[.85rem] text-muted-foreground">
          © {new Date().getFullYear()} Bookzenvo
        </div>
      </footer>
    </div>
  );
}
