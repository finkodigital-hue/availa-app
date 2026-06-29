import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CalendarCheck, Sparkles, Globe } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Atelier — Bookings made beautiful" },
      { name: "description", content: "Multi-tenant booking platform for salons, studios and service businesses. Calendars, customers, and a stunning booking page out of the box." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="font-display text-xl">Atelier<span className="text-primary">.</span></div>
        <nav className="flex items-center gap-2 text-sm">
          <Link to="/auth" className="px-4 py-2 rounded-xl hover:bg-card">Sign in</Link>
          <Link to="/auth" search={{ mode: "signup" } as any} className="px-4 py-2 rounded-xl bg-foreground text-background">Start free</Link>
        </nav>
      </header>

      <section className="max-w-4xl mx-auto px-6 pt-16 pb-24 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-xs text-secondary-foreground mb-6">
          <Sparkles className="h-3 w-3" /> Built for modern studios
        </div>
        <h1 className="font-display text-5xl md:text-7xl leading-[1.05]">
          Bookings,<br />
          <span className="italic text-primary">made beautiful.</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto">
          One workspace for your calendar, customers, services and staff — with a public booking page that matches your brand.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link to="/auth" search={{ mode: "signup" } as any} className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground hover:opacity-90">
            Create your workspace <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to="/auth" className="px-5 py-3 rounded-xl border hover:bg-card">Sign in</Link>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-24 grid md:grid-cols-3 gap-4">
        {[
          { icon: CalendarCheck, title: "Smart calendar", body: "Daily, weekly and monthly views with double-booking protection baked in." },
          { icon: Globe, title: "Public booking page", body: "Every business gets a branded /book/your-slug page. No customer accounts needed." },
          { icon: Sparkles, title: "Built to scale", body: "Multi-tenant from day one. Strict row-level security keeps every workspace isolated." },
        ].map((f) => (
          <div key={f.title} className="rounded-2xl border bg-card p-6">
            <f.icon className="h-5 w-5 text-primary" />
            <h3 className="font-display text-xl mt-4">{f.title}</h3>
            <p className="text-sm text-muted-foreground mt-2">{f.body}</p>
          </div>
        ))}
      </section>

      <footer className="border-t py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Atelier
      </footer>
    </div>
  );
}
