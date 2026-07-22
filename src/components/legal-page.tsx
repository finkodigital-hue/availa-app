import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

type LegalSection = { title: string; content: ReactNode };

export function LegalPage({
  eyebrow,
  title,
  intro,
  sections,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  sections: LegalSection[];
}) {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <header className="border-b border-border">
        <div className="max-w-[860px] mx-auto px-6 h-20 flex items-center justify-between">
          <Link to="/" className="font-display font-semibold tracking-tight text-[1.5rem]">
            Bookzenvo<span className="text-[color:var(--gold-deep)]">.</span>
          </Link>
          <Link
            to="/"
            className="text-[.9rem] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Back to home
          </Link>
        </div>
      </header>
      <main className="max-w-[760px] mx-auto px-6 py-16 md:py-20">
        <p className="text-[.7rem] font-semibold tracking-[0.16em] uppercase text-[color:var(--gold-deep)] mb-4">
          {eyebrow}
        </p>
        <h1 className="font-display font-medium text-[clamp(2.5rem,5vw,4rem)] leading-[0.98] tracking-tight">
          {title}
        </h1>
        <p className="mt-5 text-[1rem] leading-7 text-muted-foreground max-w-[62ch]">{intro}</p>
        <p className="mt-4 text-[.82rem] text-muted-foreground">Last updated: 23 July 2026</p>
        <div className="mt-12 space-y-9">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="font-display text-[1.7rem] leading-tight mb-3">{section.title}</h2>
              <div className="space-y-3 text-[.95rem] leading-7 text-muted-foreground">
                {section.content}
              </div>
            </section>
          ))}
        </div>
        <div className="mt-14 rounded-xl border border-border bg-white px-6 py-6">
          <h2 className="font-display text-[1.45rem]">Need help?</h2>
          <p className="mt-2 text-[.92rem] leading-6 text-muted-foreground">
            Visit the Help Centre and choose Contact support. We will get back to you as soon as we
            can.
          </p>
          <Link
            to="/help"
            className="inline-flex mt-4 text-[.9rem] font-semibold underline underline-offset-4 hover:text-[color:var(--gold-deep)]"
          >
            Go to Help Centre
          </Link>
        </div>
      </main>
      <footer className="border-t border-border py-8">
        <div className="max-w-[860px] mx-auto px-6 flex flex-wrap gap-x-6 gap-y-3 text-[.85rem] text-muted-foreground">
          <span>© {new Date().getFullYear()} Bookzenvo</span>
          <Link to="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link to="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <Link to="/cookie-policy" className="hover:text-foreground">
            Cookie policy
          </Link>
          <Link to="/help" className="hover:text-foreground">
            Contact
          </Link>
        </div>
      </footer>
    </div>
  );
}
