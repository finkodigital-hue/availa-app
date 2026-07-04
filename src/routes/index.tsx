import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarCheck,
  Sparkles,
  Globe,
  ShieldCheck,
  Zap,
  BarChart3,
  Users,
  Check,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Chairly — Bookings made beautiful" },
      {
        name: "description",
        content:
          "The modern booking platform for studios, salons and service businesses. Calendars, customers, branded booking pages — out of the box.",
      },
      { property: "og:title", content: "Chairly — Bookings made beautiful" },
      {
        property: "og:description",
        content:
          "Run your service business with a calendar, customer list and branded booking page that feels like yours.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background grain">
      {/* Nav */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-background/70 border-b border-border/60">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="font-display text-xl tracking-tight">
            Chairly<span className="text-primary">.</span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </nav>
          <div className="flex items-center gap-2 text-sm">
            <Link to="/portal" className="hidden sm:inline-flex px-3.5 py-2 rounded-xl text-muted-foreground hover:text-foreground transition-colors">
              My bookings
            </Link>
            <Link to="/auth" className="px-3.5 py-2 rounded-xl hover:bg-card transition-colors">
              Sign in
            </Link>
            <Link
              to="/auth"
              search={{ mode: "signup" } as any}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-foreground text-background hover:opacity-90 transition-opacity"
            >
              Start free <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 mesh-bg pointer-events-none" />
        <div className="relative max-w-5xl mx-auto px-6 pt-24 pb-28 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border bg-card/70 backdrop-blur text-xs text-muted-foreground mb-7 animate-rise">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            Now in private beta — invite friends
          </div>
          <h1 className="font-display text-5xl sm:text-6xl md:text-7xl leading-[1.02] text-balance animate-rise stagger-1">
            Bookings,
            <br />
            <span className="italic text-primary">made beautiful.</span>
          </h1>
          <p className="mt-7 text-lg text-muted-foreground max-w-xl mx-auto text-pretty animate-rise stagger-2">
            One workspace for your calendar, customers, services and staff —
            with a branded booking page your clients will actually want to use.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3 animate-rise stagger-3">
            <Link
              to="/auth"
              search={{ mode: "signup" } as any}
              className="group inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground shadow-glow hover:opacity-95 transition-all"
            >
              Create your workspace
              <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <a
              href="#features"
              className="px-5 py-3 rounded-xl border bg-card hover:bg-secondary transition-colors"
            >
              See how it works
            </a>
          </div>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground animate-rise stagger-4">
            <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-success" /> Free for solo</span>
            <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-success" /> No card required</span>
            <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-success" /> Set up in 3 minutes</span>
          </div>

          {/* Product preview card */}
          <div className="relative mt-16 mx-auto max-w-4xl animate-rise stagger-5">
            <div className="absolute -inset-x-10 -inset-y-6 bg-primary/10 blur-3xl rounded-[3rem]" />
            <div className="relative rounded-3xl border bg-card shadow-elegant overflow-hidden">
              <div className="h-9 flex items-center gap-1.5 px-4 border-b bg-muted/40">
                <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-chart-3" />
                <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
                <span className="ml-3 text-[11px] text-muted-foreground">luma.app/dashboard</span>
              </div>
              <div className="grid sm:grid-cols-3 gap-4 p-6">
                {[
                  { k: "Today", v: "12 bookings", trend: "+18%" },
                  { k: "Revenue", v: "$2,840", trend: "+24%" },
                  { k: "New clients", v: "5", trend: "+2" },
                ].map((c) => (
                  <div key={c.k} className="rounded-2xl border bg-background p-4 text-left">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{c.k}</div>
                    <div className="font-display text-2xl mt-2">{c.v}</div>
                    <div className="text-xs text-success mt-1">{c.trend}</div>
                  </div>
                ))}
              </div>
              <div className="px-6 pb-6">
                <div className="rounded-2xl border bg-background p-4">
                  <div className="flex items-end gap-1.5 h-24">
                    {[40, 65, 50, 80, 45, 90, 70, 95, 60, 110, 75, 85, 100, 120].map((h, i) => (
                      <div key={i} className="flex-1 rounded-t-md bg-primary/80" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Logos / social proof */}
      <section className="border-y bg-card/40">
        <div className="max-w-5xl mx-auto px-6 py-10 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Trusted by studios in 14 countries
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 opacity-70">
            {["Maison Coiffure", "Studio Aoyama", "Field & Bloom", "Northside Barbers", "Lume Skin", "Nordic Nails"].map(
              (n) => (
                <span key={n} className="font-display text-lg text-muted-foreground">
                  {n}
                </span>
              ),
            )}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-6 py-28">
        <div className="max-w-2xl">
          <span className="text-xs uppercase tracking-[0.2em] text-primary">Features</span>
          <h2 className="font-display text-4xl md:text-5xl mt-3 text-balance">
            Everything you need to take bookings — nothing you don't.
          </h2>
        </div>
        <div className="mt-14 grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { icon: CalendarCheck, title: "Smart calendar", body: "Daily, weekly and monthly views with double-booking protection baked in." },
            { icon: Globe, title: "Branded booking page", body: "Every business gets a /book/your-slug with your colors, logo and copy." },
            { icon: BarChart3, title: "Live analytics", body: "Revenue, repeat rates and most-loved services — refreshed in real time." },
            { icon: Users, title: "Customer CRM", body: "Notes, contact details and full booking history for every client." },
            { icon: ShieldCheck, title: "Multi-tenant secure", body: "Strict row-level security keeps every workspace fully isolated." },
            { icon: Zap, title: "Fast to set up", body: "From signup to your first booking page in under three minutes." },
          ].map((f, i) => (
            <div
              key={f.title}
              className={`rounded-2xl border bg-card p-6 card-hover animate-rise stagger-${(i % 6) + 1}`}
            >
              <div className="h-10 w-10 rounded-xl bg-secondary grid place-items-center text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-display text-xl mt-5">{f.title}</h3>
              <p className="text-sm text-muted-foreground mt-2 text-pretty">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Big quote */}
      <section className="bg-secondary/60 border-y">
        <div className="max-w-3xl mx-auto px-6 py-24 text-center">
          <Sparkles className="h-6 w-6 text-primary mx-auto" />
          <p className="mt-6 font-display text-3xl md:text-4xl leading-snug text-balance">
            "We moved from spreadsheets to Chairly and immediately doubled
            our online bookings. It just <span className="italic text-primary">feels right</span>."
          </p>
          <div className="mt-6 text-sm text-muted-foreground">
            — Mia Tanaka, founder of Studio Aoyama
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-5xl mx-auto px-6 py-28">
        <div className="text-center max-w-xl mx-auto">
          <span className="text-xs uppercase tracking-[0.2em] text-primary">Pricing</span>
          <h2 className="font-display text-4xl md:text-5xl mt-3 text-balance">Simple, honest pricing.</h2>
        </div>
        <div className="mt-12 grid md:grid-cols-3 gap-4">
          {[
            { name: "Solo", price: "Free", body: "Perfect for individuals", features: ["1 staff", "Unlimited bookings", "Branded page"] },
            { name: "Studio", price: "$29", suffix: "/mo", body: "Growing teams", features: ["Up to 10 staff", "Analytics", "Email reminders", "Priority support"], featured: true },
            { name: "Enterprise", price: "Custom", body: "Multi-location", features: ["Unlimited staff", "SSO", "Dedicated CSM"] },
          ].map((p) => (
            <div
              key={p.name}
              className={`relative rounded-3xl border p-7 card-hover ${
                p.featured ? "bg-foreground text-background shadow-elegant" : "bg-card"
              }`}
            >
              {p.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-widest bg-primary text-primary-foreground rounded-full px-2.5 py-1">
                  Most popular
                </span>
              )}
              <div className="font-display text-xl">{p.name}</div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="font-display text-4xl">{p.price}</span>
                {p.suffix && <span className="text-sm opacity-70">{p.suffix}</span>}
              </div>
              <p className={`text-sm mt-1 ${p.featured ? "opacity-70" : "text-muted-foreground"}`}>{p.body}</p>
              <ul className="mt-6 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className={`h-4 w-4 ${p.featured ? "text-primary" : "text-success"}`} />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/auth"
                search={{ mode: "signup" } as any}
                className={`mt-7 block text-center px-4 py-2.5 rounded-xl text-sm ${
                  p.featured ? "bg-primary text-primary-foreground" : "bg-secondary"
                }`}
              >
                Get started
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-5xl mx-auto px-6 pb-28">
        <div className="relative rounded-3xl bg-foreground text-background p-12 md:p-16 overflow-hidden">
          <div className="absolute inset-0 mesh-bg opacity-50 pointer-events-none" />
          <div className="relative">
            <h2 className="font-display text-4xl md:text-5xl text-balance">
              Ready to take your first <span className="italic text-primary">beautiful</span> booking?
            </h2>
            <p className="mt-4 text-sm md:text-base opacity-70 max-w-md">
              Spin up your workspace in minutes. No credit card. Cancel anytime.
            </p>
            <Link
              to="/auth"
              search={{ mode: "signup" } as any}
              className="mt-8 inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground shadow-glow"
            >
              Start free <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="font-display text-base text-foreground">
            Chairly<span className="text-primary">.</span>
          </div>
          <div>© {new Date().getFullYear()} Chairly — Made with care.</div>
          <div className="flex gap-5">
            <a href="#" className="hover:text-foreground">Privacy</a>
            <a href="#" className="hover:text-foreground">Terms</a>
            <a href="#" className="hover:text-foreground">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
