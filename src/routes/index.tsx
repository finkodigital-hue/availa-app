import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Chairly — Fill the chair. Run the business." },
      {
        name: "description",
        content:
          "A branded booking page, a calendar that refuses double-bookings, and a client book that remembers everyone — for salons, barbershops and rent-a-chair independents.",
      },
      { property: "og:title", content: "Chairly — Fill the chair. Run the business." },
      {
        property: "og:description",
        content:
          "A branded booking page, a no-clash calendar and a client book — whether you own the salon or rent one chair in it.",
      },
    ],
  }),
  component: Landing,
});

function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-bold tracking-tight ${className}`}>
      Chairly<span className="text-[color:var(--brass)]">.</span>
    </span>
  );
}

function ChairSvg() {
  return (
    <svg
      viewBox="0 0 260 320"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="A salon chair"
      className="w-full max-w-[360px] h-auto"
      style={{ filter: "drop-shadow(0 30px 40px color-mix(in oklab, var(--primary) 30%, transparent))" }}
    >
      <ellipse cx="130" cy="150" rx="118" ry="118" fill="#E7D6B4" opacity=".45" />
      <rect x="84" y="34" width="92" height="132" rx="34" fill="#8E2A38" />
      <rect x="84" y="34" width="92" height="132" rx="34" fill="url(#g1)" opacity=".25" />
      <rect x="112" y="58" width="36" height="4" rx="2" fill="#6E1F2B" opacity=".5" />
      <rect x="54" y="140" width="18" height="58" rx="9" fill="#6E1F2B" />
      <rect x="188" y="140" width="18" height="58" rx="9" fill="#6E1F2B" />
      <rect x="60" y="158" width="140" height="44" rx="20" fill="#8E2A38" />
      <rect x="60" y="158" width="140" height="16" rx="8" fill="#A8394A" opacity=".7" />
      <rect x="120" y="200" width="20" height="66" rx="6" fill="#1E1A17" />
      <rect x="94" y="228" width="72" height="12" rx="6" fill="#B8863B" />
      <rect x="122" y="228" width="16" height="12" rx="6" fill="#CFA05A" />
      <ellipse cx="130" cy="272" rx="60" ry="16" fill="#6E1F2B" />
      <ellipse cx="130" cy="268" rx="60" ry="16" fill="#8E2A38" />
      <defs>
        <linearGradient id="g1" x1="84" y1="34" x2="176" y2="166" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function Landing() {
  const steps = [
    {
      n: 1,
      title: "Build your page",
      body:
        "Add your services, your chairs, your hours. Pick your colour. It becomes a booking page at chairly.app/your-name.",
    },
    {
      n: 2,
      title: "Share your link",
      body:
        "Drop it in your Instagram bio, your DMs, on the front desk. One link, everything bookable.",
    },
    {
      n: 3,
      title: "Get booked",
      body:
        "Bookings land in your calendar, every client saves to your book, and no one can double-book the same slot.",
    },
  ];

  const features: {
    title: string;
    body: string;
    soon?: boolean;
    icon: React.ReactNode;
  }[] = [
    {
      title: "Branded booking page",
      body:
        "Your name, your colours, your services — a page clients actually want to use, no app to download.",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4" />
        </svg>
      ),
    },
    {
      title: "No-clash calendar",
      body:
        "Day, week and month views per chair. Two people can't grab the same slot — the calendar won't allow it.",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M8 2v4M16 2v4M3 10h18" />
          <circle cx="12" cy="16" r="2.4" />
        </svg>
      ),
    },
    {
      title: "Client book",
      body:
        "Every booking builds a client record — visit history, spend, notes. Walk-in becomes a regular, automatically.",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        </svg>
      ),
    },
    {
      title: "Payments & deposits",
      body:
        "Take deposits to kill no-shows, and see what you've collected and what's still owed at a glance.",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
        </svg>
      ),
    },
    {
      title: "Staff & chairs",
      body:
        "Add stylists or rent-a-chair independents. Each keeps their own schedule, their own clients, their own page.",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 2 4 7v10l8 5 8-5V7z" />
          <path d="M12 22V12M4 7l8 5 8-5" />
        </svg>
      ),
    },
    {
      title: "Switch from Fresha",
      soon: true,
      body:
        "Bring your services, staff and client list across in one upload. Leaving the old system won't cost you a thing.",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 3v12M8 11l4 4 4-4" />
          <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
      ),
    },
  ];

  const tiers: {
    name: string;
    price: string;
    per?: string;
    desc: string;
    features: string[];
    cta: string;
    featured?: boolean;
  }[] = [
    {
      name: "Solo",
      price: "Free",
      desc: "For one chair, one you.",
      features: ["One staff member", "Unlimited bookings", "Branded page & client book"],
      cta: "Start free",
    },
    {
      name: "Studio",
      price: "$29",
      per: "/mo",
      desc: "For a growing floor.",
      features: ["Up to 10 chairs", "Deposits & payments", "Email reminders", "Analytics & insights"],
      cta: "Start free",
      featured: true,
    },
    {
      name: "Multi-site",
      price: "Let's talk",
      desc: "For salons with locations.",
      features: ["Unlimited chairs", "Multiple locations", "Priority support"],
      cta: "Get in touch",
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-background/80 border-b border-border/60">
        <div className="max-w-6xl mx-auto px-6 h-[70px] flex items-center justify-between">
          <Wordmark className="text-2xl" />
          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground font-medium">
            <a href="#how" className="hover:text-foreground transition-colors">How it works</a>
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              to="/auth"
              className="hidden sm:inline-flex text-sm font-semibold text-foreground px-2 py-2 hover:opacity-80"
            >
              Sign in
            </Link>
            <Link
              to="/auth"
              search={{ mode: "signup" } as any}
              className="group inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground font-semibold text-sm px-5 py-2.5 shadow-[0_10px_22px_-10px_color-mix(in_oklab,var(--primary)_70%,transparent)] hover:opacity-95 transition"
            >
              Start free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(80% 120% at 88% -10%, color-mix(in oklab, var(--brass) 16%, transparent), transparent 55%), radial-gradient(70% 90% at 8% 8%, color-mix(in oklab, var(--primary) 7%, transparent), transparent 60%)",
          }}
        />
        <div className="relative max-w-6xl mx-auto px-6 grid lg:grid-cols-[1.15fr_.85fr] gap-12 items-center py-16 lg:py-24">
          <div>
            <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide text-primary bg-[color:color-mix(in_oklab,var(--primary)_8%,var(--background))] border border-[color:color-mix(in_oklab,var(--primary)_16%,transparent)] rounded-full px-3 py-1.5 mb-6">
              <span className="relative h-1.5 w-1.5 rounded-full bg-primary">
                <span className="absolute -inset-1 rounded-full border border-primary/40 animate-ping" />
              </span>
              Now onboarding the first salons
            </span>
            <h1 className="font-display font-bold tracking-tight leading-[0.98] text-[clamp(2.9rem,6.5vw,4.9rem)] mb-6">
              Fill the chair.
              <span className="block text-primary">Run the business.</span>
            </h1>
            <p className="text-muted-foreground text-[clamp(1.05rem,1.6vw,1.22rem)] max-w-[33ch] mb-8">
              A branded booking page, a calendar that refuses double-bookings, and a client book
              that remembers everyone — whether you own the salon or rent one chair in it.
            </p>
            <div className="flex flex-wrap gap-3 items-center">
              <Link
                to="/auth"
                search={{ mode: "signup" } as any}
                className="group inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground font-semibold text-[.95rem] px-5 py-3 shadow-[0_10px_22px_-10px_color-mix(in_oklab,var(--primary)_70%,transparent)] hover:opacity-95 transition"
              >
                Create your booking page
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-transparent text-foreground font-semibold text-[.95rem] px-5 py-3 hover:bg-card transition"
              >
                See a live example
              </a>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>Free for one chair</span>
              <span className="h-1 w-1 rounded-full bg-border" />
              <span>No card needed</span>
              <span className="h-1 w-1 rounded-full bg-border" />
              <span>Live in minutes</span>
            </div>
          </div>

          <div className="relative grid place-items-center min-h-[340px]">
            <ChairSvg />
            <div
              aria-hidden
              className="absolute bottom-3 right-0 sm:-right-1 w-56 rounded-2xl border border-border bg-card p-4 shadow-[0_28px_60px_-22px_color-mix(in_oklab,var(--primary)_28%,transparent)]"
              style={{ animation: "chairly-float 5s ease-in-out infinite" }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="h-8 w-8 rounded-full grid place-items-center font-display font-bold text-sm bg-[#E7D6B4] text-[#6E1F2B]">
                  R
                </div>
                <div>
                  <div className="font-semibold text-sm leading-tight">Rosa booked in</div>
                  <div className="text-[.72rem] text-muted-foreground">Signature Cut · Fri 2:00 PM</div>
                </div>
              </div>
              <div className="flex justify-between items-center text-xs pt-2 border-t border-border">
                <span className="text-muted-foreground">Chair 2 · Camille</span>
                <span className="text-[.68rem] font-semibold rounded-full px-2 py-0.5 bg-[#e7f4ec] text-[#2c7a4b]">
                  Confirmed
                </span>
              </div>
            </div>
          </div>
        </div>
        <style>{`@keyframes chairly-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style>
      </section>

      {/* How it works */}
      <section id="how" className="py-20 md:py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-[.78rem] font-bold tracking-[0.14em] uppercase text-[color:var(--brass)] mb-3">
            Up and running
          </div>
          <h2 className="font-display font-bold tracking-tight leading-[1.05] text-[clamp(1.9rem,3.6vw,2.7rem)] max-w-[20ch]">
            Three steps from sign-up to your first booking.
          </h2>
          <div className="mt-12 grid md:grid-cols-3 gap-5">
            {steps.map((s, i) => (
              <div
                key={s.n}
                className="relative rounded-2xl border border-border bg-card p-7 shadow-[0_1px_2px_rgba(30,26,23,.04),0_12px_28px_-14px_rgba(30,26,23,.18)]"
              >
                <div className="font-display font-bold text-white bg-primary w-9 h-9 rounded-xl grid place-items-center mb-4">
                  {s.n}
                </div>
                <h3 className="font-display font-semibold text-xl tracking-tight mb-2">{s.title}</h3>
                <p className="text-muted-foreground text-[.96rem]">{s.body}</p>
                {i < steps.length - 1 && (
                  <span aria-hidden className="hidden md:block absolute top-11 -right-4 w-8 h-0.5 bg-border" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 md:py-24 border-y border-border bg-[color:color-mix(in_oklab,var(--background)_92%,var(--foreground)_8%)]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-[.78rem] font-bold tracking-[0.14em] uppercase text-[color:var(--brass)] mb-3">
            What's inside
          </div>
          <h2 className="font-display font-bold tracking-tight leading-[1.05] text-[clamp(1.9rem,3.6vw,2.7rem)] max-w-[20ch]">
            Everything the chair needs. Nothing it doesn't.
          </h2>
          <p className="text-muted-foreground text-lg max-w-[44ch] mt-4">
            Built for one-chair independents and busy salon floors alike — the same tools, priced
            for where you are.
          </p>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-border bg-background p-6 transition hover:-translate-y-1 hover:shadow-[0_1px_2px_rgba(30,26,23,.04),0_12px_28px_-14px_rgba(30,26,23,.18)]"
              >
                <div className="w-11 h-11 rounded-xl grid place-items-center text-primary mb-4 bg-[color:color-mix(in_oklab,var(--primary)_10%,var(--background))]">
                  {f.icon}
                </div>
                <h3 className="font-display font-semibold text-lg tracking-tight mb-1.5 flex items-center gap-2">
                  {f.title}
                  {f.soon && (
                    <span className="text-[.62rem] font-bold uppercase tracking-wider text-[color:var(--brass)] border border-[#E7D6B4] bg-[color:color-mix(in_oklab,var(--brass)_8%,transparent)] rounded px-1.5 py-0.5">
                      Soon
                    </span>
                  )}
                </h3>
                <p className="text-muted-foreground text-[.93rem]">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 md:py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-[.78rem] font-bold tracking-[0.14em] uppercase text-[color:var(--brass)] mb-3">
            Pricing
          </div>
          <h2 className="font-display font-bold tracking-tight leading-[1.05] text-[clamp(1.9rem,3.6vw,2.7rem)] max-w-[20ch]">
            Free while it's just you. Fair when you grow.
          </h2>
          <div className="mt-12 grid md:grid-cols-3 gap-5 items-stretch max-w-[420px] md:max-w-none mx-auto">
            {tiers.map((t) => {
              const featured = !!t.featured;
              return (
                <div
                  key={t.name}
                  className={`relative rounded-3xl p-8 flex flex-col border ${
                    featured
                      ? "bg-foreground text-background border-foreground shadow-[0_2px_6px_rgba(30,26,23,.05),0_28px_60px_-22px_color-mix(in_oklab,var(--primary)_28%,transparent)]"
                      : "bg-card border-border"
                  }`}
                >
                  {featured && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[.68rem] font-bold uppercase tracking-wider bg-[color:var(--brass)] text-[#1E1A17] rounded-full px-3 py-1">
                      Most popular
                    </span>
                  )}
                  <div className="font-display font-semibold text-xl">{t.name}</div>
                  <div className="font-display font-bold text-[2.5rem] tracking-tight leading-none mt-3 mb-1">
                    {t.price}
                    {t.per && (
                      <span
                        className={`text-base font-medium ${
                          featured ? "text-white/60" : "text-muted-foreground"
                        }`}
                      >
                        {t.per}
                      </span>
                    )}
                  </div>
                  <div className={`text-sm mb-6 ${featured ? "text-white/65" : "text-muted-foreground"}`}>
                    {t.desc}
                  </div>
                  <ul className="flex-1 space-y-2.5 mb-6">
                    {t.features.map((f) => (
                      <li key={f} className="flex gap-2 items-start text-[.92rem]">
                        <Check
                          className={`h-4 w-4 shrink-0 mt-0.5 ${
                            featured ? "text-[color:var(--brass)]" : "text-primary"
                          }`}
                        />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    to="/auth"
                    search={{ mode: "signup" } as any}
                    className={`w-full inline-flex items-center justify-center rounded-full font-semibold text-[.95rem] px-5 py-3 transition ${
                      featured
                        ? "bg-background text-foreground hover:opacity-90"
                        : "border border-border bg-transparent text-foreground hover:bg-background"
                    }`}
                  >
                    {t.cta}
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="pb-20 md:pb-24">
        <div className="max-w-6xl mx-auto px-6">
          <div
            className="relative overflow-hidden rounded-[28px] text-white text-center px-8 py-16 md:px-10 md:py-20"
            style={{
              background:
                "linear-gradient(135deg, var(--primary), color-mix(in oklab, var(--primary) 70%, black))",
            }}
          >
            <div
              aria-hidden
              className="absolute -top-[40%] -right-[10%] w-[380px] h-[380px] rounded-full"
              style={{
                background:
                  "radial-gradient(circle, color-mix(in oklab, var(--brass) 35%, transparent), transparent 70%)",
              }}
            />
            <div className="relative">
              <h2 className="font-display font-bold tracking-tight text-[clamp(2rem,4vw,3rem)] mb-3">
                Ready to fill the chair?
              </h2>
              <p className="text-white/80 text-lg mb-8">
                Set up your booking page in a few minutes. Free for one chair, no card needed.
              </p>
              <Link
                to="/auth"
                search={{ mode: "signup" } as any}
                className="inline-flex items-center gap-2 rounded-full bg-background text-foreground font-semibold text-[.95rem] px-6 py-3 hover:opacity-95 transition"
              >
                Create your booking page
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-wrap items-center justify-between gap-5">
          <Wordmark className="text-xl" />
          <div className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Chairly — made for people who work from a chair.
          </div>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground">Privacy</a>
            <a href="#" className="hover:text-foreground">Terms</a>
            <a href="#" className="hover:text-foreground">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
