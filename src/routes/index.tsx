import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  CookieConsentBanner,
  CookieConsentProvider,
  CookieSettingsFooterLink,
} from "@/components/cookie-consent";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bookzenvo · Booking software that runs the work others leave to the salon." },
      {
        name: "description",
        content:
          "Bookings, payments, consultations, patch tests, verified reviews, stock, chair rentals and practical AI in one place, for salons, barbershops, nail studios and tattoo artists.",
      },
      {
        property: "og:title",
        content: "Bookzenvo · Booking software that runs the work others leave to the salon.",
      },
      {
        property: "og:description",
        content:
          "Bookings, payments, consultations, patch tests, verified reviews, stock, chair rentals and practical AI in one place. Free for one chair.",
      },
      { property: "og:url", content: "https://bookzenvo.com/" },
      {
        name: "twitter:title",
        content: "Bookzenvo · Booking software that runs the work others leave to the salon.",
      },
      {
        name: "twitter:description",
        content:
          "Bookings, payments, consultations, patch tests, verified reviews, stock, chair rentals and practical AI in one place. Free for one chair.",
      },
    ],
    links: [{ rel: "canonical", href: "https://bookzenvo.com/" }],
  }),
  component: Landing,
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center mb-4">
      <Mark />
      <span className="text-[.7rem] font-semibold tracking-[0.16em] uppercase text-[color:var(--gold-deep)]">
        {children}
      </span>
    </div>
  );
}

const NAV_ITEMS = [
  "Today",
  "Calendar",
  "Bookings",
  "Clients",
  "Consultations",
  "Staff",
  "Services",
  "Stock",
  "Payments",
  "Settings",
] as const;

const STATS = [
  {
    target: 12,
    prefix: "",
    label: "Bookings today",
    delta: "+3 vs last Tuesday",
  },
  { target: 1240, prefix: "£", label: "Revenue this week", delta: "+18%" },
  { target: 9, prefix: "", label: "New clients this month", delta: "+2" },
];

const APPOINTMENTS = [
  {
    time: "9:00",
    who: "Maya Richards",
    what: "Balayage · 150 min",
    withWhom: "Camille",
    status: "ok" as const,
  },
  {
    time: "11:45",
    who: "Daniel Reyes",
    what: "Signature cut · 60 min",
    withWhom: "Nora",
    status: "ok" as const,
  },
  {
    time: "13:30",
    who: "Chloe Bennett",
    what: "Gel set · 60 min",
    withWhom: "Jordan",
    status: "pend" as const,
  },
  {
    time: "15:00",
    who: "Sam Okafor",
    what: "Colour & gloss · 90 min",
    withWhom: "Camille",
    status: "ok" as const,
  },
];

const PREVIEW_DATA = {
  Calendar: {
    eyebrow: "Tuesday, July 7",
    title: "Your calendar",
    action: "New booking",
  },
  Bookings: {
    eyebrow: "All bookings",
    title: "Bookings at a glance",
    action: "New booking",
  },
  Clients: {
    eyebrow: "Your client book",
    title: "Clients who keep coming back",
    action: "Add client",
  },
  Consultations: {
    eyebrow: "Consultations",
    title: "Forms & patch tests",
    action: "New form",
  },
  Staff: {
    eyebrow: "Your team",
    title: "Everyone in one place",
    action: "Add staff",
  },
  Services: {
    eyebrow: "Your menu",
    title: "Services and prices",
    action: "Add service",
  },
  Stock: {
    eyebrow: "Back bar",
    title: "Products & usage",
    action: "Scan shelf",
  },
  Payments: {
    eyebrow: "Money",
    title: "Payments made simple",
    action: "Take payment",
  },
  Settings: {
    eyebrow: "Your studio",
    title: "Make it yours",
    action: "Save changes",
  },
} as const;

function TodayPreview({ inView }: { inView: boolean }) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-9">
        {STATS.map((s) => (
          <div
            key={s.label}
            className="rounded-[10px] border border-border bg-background px-5 py-5"
          >
            <CountUp target={s.target} prefix={s.prefix} active={inView} />
            <div className="text-[.7rem] text-muted-foreground uppercase tracking-[0.12em] mt-2">
              {s.label}
            </div>
            <div className="text-[.75rem] text-[color:var(--confirmed)] mt-1">
              {s.delta}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-[.7rem] font-semibold tracking-[0.16em] uppercase text-muted-foreground">
          Today&apos;s appointments
        </span>
        <span className="text-[.7rem] font-semibold tracking-[0.16em] uppercase text-[color:var(--gold-deep)]">
          View calendar →
        </span>
      </div>
      <div className="flex flex-col">
        {APPOINTMENTS.map((a, i) => (
          <div
            key={a.who}
            className={`grid grid-cols-[54px_1fr_auto_auto] sm:grid-cols-[76px_1fr_auto_auto] gap-3 sm:gap-4 items-center py-4 border-b border-border last:border-b-0 transition-all duration-500 ease-[cubic-bezier(.2,.7,.3,1)] ${
              inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2.5"
            }`}
            style={{ transitionDelay: inView ? `${200 + i * 110}ms` : "0ms" }}
          >
            <span className="text-[.85rem] font-semibold">{a.time}</span>
            <span className="min-w-0">
              <span className="block text-[.92rem] font-semibold truncate">
                {a.who}
              </span>
              <span className="block text-[.8rem] text-muted-foreground truncate">
                {a.what}
              </span>
            </span>
            <span className="hidden sm:block text-[.8rem] text-muted-foreground">
              with {a.withWhom}
            </span>
            <span
              className={`text-[.68rem] font-semibold px-2.5 py-1 rounded-[5px] tracking-[.03em] ${
                a.status === "ok"
                  ? "bg-[color:var(--confirmed-bg)] text-[color:var(--confirmed)]"
                  : "bg-[color:var(--pending-bg)] text-[color:var(--pending)]"
              }`}
            >
              {a.status === "ok" ? "Confirmed" : "Pending"}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function CalendarBooking({
  top,
  height,
  tone,
  name,
  service,
}: {
  top: string;
  height: string;
  tone: "gold" | "peach" | "blue" | "sage" | "lilac" | "rose";
  name: string;
  service: string;
}) {
  const tones = {
    gold: "border-[#c9a875] bg-[#f5ead7] text-[#684b28]",
    peach: "border-[#d99c75] bg-[#f9e5d8] text-[#73442c]",
    blue: "border-[#8da1c7] bg-[#e6ecf7] text-[#405477]",
    sage: "border-[#8eae99] bg-[#e4f0e6] text-[#355a40]",
    lilac: "border-[#b29ac4] bg-[#eee7f4] text-[#5c476d]",
    rose: "border-[#c894a5] bg-[#f5e4e9] text-[#70404e]",
  };

  return (
    <div
      className={`absolute left-1.5 right-1.5 overflow-hidden rounded-[5px] border-l-[3px] px-2 py-1 ${tones[tone]}`}
      style={{ top, height }}
    >
      <div className="truncate text-[.67rem] font-bold">{name}</div>
      <div className="truncate text-[.58rem] opacity-75">{service}</div>
    </div>
  );
}

function CalendarPreview() {
  const team = [
    ["N", "Nora", "Colour", "bg-[#f5e8d0] text-[#9a6b2e]"],
    ["C", "Camille", "Cut & style", "bg-[#e8edf7] text-[#5c6d9c]"],
    ["J", "Jordan", "Nails", "bg-[#f0e7ee] text-[#966480]"],
  ];

  return (
    <div className="rounded-[12px] border border-border overflow-hidden bg-white shadow-[0_12px_32px_-28px_rgba(26,26,26,.45)]">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-background">
        <div className="inline-flex rounded-[7px] border border-border bg-white p-1 text-[.7rem] font-semibold">
          <span className="rounded-[4px] bg-primary px-3 py-1.5 text-primary-foreground">
            Day
          </span>
          <span className="px-3 py-1.5 text-muted-foreground">Week</span>
          <span className="hidden sm:inline px-3 py-1.5 text-muted-foreground">
            Month
          </span>
        </div>
        <div className="flex items-center gap-2 text-[.72rem] font-semibold">
          <span className="hidden sm:inline rounded-[6px] border border-border bg-white px-3 py-2 text-muted-foreground">
            ‹
          </span>
          <span className="rounded-[6px] bg-primary px-3 py-2 text-primary-foreground">
            Today
          </span>
          <span className="hidden sm:inline rounded-[6px] border border-border bg-white px-3 py-2 text-muted-foreground">
            ›
          </span>
        </div>
      </div>
      <div className="grid grid-cols-[48px_repeat(3,minmax(0,1fr))] border-b border-border bg-background">
        <span />
        {team.map(([initial, name, role, colour], index) => (
          <div
            key={name}
            className={`flex items-center gap-2 px-2.5 py-3 ${index ? "border-l border-border" : ""}`}
          >
            <span
              className={`grid h-7 w-7 place-items-center rounded-full text-[.68rem] font-bold ${colour}`}
            >
              {initial}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[.75rem] font-semibold">
                {name}
              </span>
              <span className="hidden sm:block truncate text-[.62rem] text-muted-foreground">
                {role}
              </span>
            </span>
          </div>
        ))}
      </div>
      <div className="relative grid grid-cols-[48px_repeat(3,minmax(0,1fr))] h-[300px] overflow-hidden">
        <div className="border-r border-border bg-background/50">
          {["9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM"].map((time) => (
            <div
              key={time}
              className="h-[50px] border-b border-border px-2 pt-1.5 text-[.62rem] text-muted-foreground"
            >
              {time}
            </div>
          ))}
        </div>
        <div
          className="relative border-r border-border"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, transparent 0, transparent 49px, var(--border) 50px)",
          }}
        >
          <CalendarBooking
            top="14px"
            height="72px"
            tone="gold"
            name="Maya Richards"
            service="Balayage · 9:15"
          />
          <CalendarBooking
            top="178px"
            height="48px"
            tone="peach"
            name="Ella Jones"
            service="Root touch-up"
          />
        </div>
        <div
          className="relative border-r border-border"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, transparent 0, transparent 49px, var(--border) 50px)",
          }}
        >
          <CalendarBooking
            top="62px"
            height="48px"
            tone="blue"
            name="Daniel Reyes"
            service="Signature cut · 10:00"
          />
          <CalendarBooking
            top="142px"
            height="72px"
            tone="sage"
            name="Olivia Stone"
            service="Colour & blow dry"
          />
        </div>
        <div
          className="relative"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, transparent 0, transparent 49px, var(--border) 50px)",
          }}
        >
          <CalendarBooking
            top="34px"
            height="48px"
            tone="lilac"
            name="Chloe Bennett"
            service="Gel set · 9:40"
          />
          <CalendarBooking
            top="228px"
            height="48px"
            tone="rose"
            name="Ava Murphy"
            service="BIAB infill"
          />
        </div>
        <span className="absolute left-[48px] right-0 top-[132px] border-t border-dashed border-[color:var(--gold-deep)]/50">
          <span className="absolute -left-[5px] -top-[4px] h-2 w-2 rounded-full bg-[color:var(--gold-deep)]" />
        </span>
      </div>
    </div>
  );
}

function ProductPreview({
  section,
}: {
  section: Exclude<(typeof NAV_ITEMS)[number], "Today">;
}) {
  if (section === "Calendar") return <CalendarPreview />;

  if (section === "Bookings") {
    return (
      <PreviewList
        rows={APPOINTMENTS.map((a) => [
          a.who,
          a.what,
          a.status === "ok" ? "Confirmed" : "Pending",
        ])}
      />
    );
  }

  if (section === "Clients") {
    return (
      <PreviewList
        rows={[
          ["Maya Richards", "8 visits · £620 spent", "Regular"],
          ["Daniel Reyes", "5 visits · £210 spent", "Regular"],
          ["Chloe Bennett", "First visit booked", "New"],
        ]}
      />
    );
  }

  if (section === "Staff") {
    return (
      <PreviewList
        rows={[
          ["Nora", "Colour specialist · Working today", "Available"],
          ["Camille", "Stylist · 4 bookings today", "Busy"],
          ["Jordan", "Nail artist · Working today", "Available"],
        ]}
      />
    );
  }

  if (section === "Services") {
    return (
      <PreviewList
        rows={[
          ["Balayage", "150 min", "£135"],
          ["Signature cut", "60 min", "£55"],
          ["Gel set", "60 min", "£42"],
        ]}
      />
    );
  }

  if (section === "Consultations") {
    return (
      <PreviewList
        rows={[
          ["Maya Richards", "Colour patch test · Signed", "Complete"],
          ["Priya Shah", "Lash consultation · Awaiting signature", "Sent"],
          ["Tom Fielding", "Tattoo consent · Walk-in", "Complete"],
        ]}
      />
    );
  }

  if (section === "Stock") {
    return (
      <PreviewList
        rows={[
          ["Wella Koleston 6/0", "Colour · linked to Balayage", "4 left"],
          ["Olaplex No.3", "Treatment", "7 left"],
          ["Blondor Lightener", "Lightener · low", "2 left"],
        ]}
      />
    );
  }

  if (section === "Payments") {
    return (
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-[10px] border border-border bg-background p-5">
          <div className="text-[.7rem] uppercase tracking-[.12em] text-muted-foreground">
            Collected this month
          </div>
          <div className="font-display text-[2.5rem] mt-4">£4,280</div>
          <div className="text-[.8rem] text-[color:var(--confirmed)] mt-2">
            +18% from last month
          </div>
        </div>
        <PreviewList
          rows={[
            ["Maya Richards", "Balayage deposit", "£45"],
            ["Daniel Reyes", "Signature cut", "£55"],
          ]}
        />
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-[1fr_1.2fr] gap-4">
      <PreviewList
        rows={[
          ["Business", "Nora Studio", ""],
          ["Booking page", "bookzenvo.com/nora", ""],
          ["Payments", "Stripe connected", ""],
        ]}
      />
      <div className="rounded-[10px] border border-border p-5">
        <div className="h-3 rounded bg-border/70 w-24 mb-5" />
        <div className="h-10 rounded border border-border bg-background mb-3" />
        <div className="h-10 rounded border border-border bg-background" />
      </div>
    </div>
  );
}

function PreviewList({ rows }: { rows: string[][] }) {
  return (
    <div className="rounded-[10px] border border-border overflow-hidden">
      {rows.map(([title, subtitle, status]) => (
        <div
          key={title}
          className="flex items-center gap-3 p-4 border-b border-border last:border-b-0"
        >
          <span className="h-8 w-8 rounded-full bg-[color:var(--gold-wash)] shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-[.9rem] font-semibold">{title}</span>
            <span className="block text-[.75rem] text-muted-foreground truncate">
              {subtitle}
            </span>
          </span>
          {status && (
            <span className="text-[.68rem] font-semibold text-[color:var(--confirmed)] bg-[color:var(--confirmed-bg)] px-2 py-1 rounded-[5px]">
              {status}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function CountUp({
  target,
  prefix,
  active,
}: {
  target: number;
  prefix: string;
  active: boolean;
}) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const start = performance.now();
    const dur = 900;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target]);

  return (
    <div className="font-display font-semibold text-[2.1rem] leading-none">
      {prefix}
      {value.toLocaleString()}
    </div>
  );
}

function DashboardPreview() {
  const frameRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [activeItem, setActiveItem] =
    useState<(typeof NAV_ITEMS)[number]>("Today");

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setInView(true);
            io.disconnect();
          }
        });
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={frameRef}
      className={`bg-white border border-[color:var(--hairline)] rounded-xl overflow-hidden transition-all duration-[800ms] ease-[cubic-bezier(.2,.7,.3,1)] ${
        inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
      }`}
      style={{
        boxShadow:
          "0 0 0 1px rgba(200,169,126,.10), 0 2px 4px rgba(26,26,26,.04), 0 32px 80px -20px rgba(169,139,95,.16)",
      }}
    >
      {/* Browser chrome */}
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border bg-[#F8F8F7]">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <div className="flex-1 flex justify-center">
          <span className="text-[.72rem] text-muted-foreground bg-white border border-border rounded-[5px] px-4 py-1 min-w-[180px] text-center select-none">
            bookzenvo.com/dashboard
          </span>
        </div>
      </div>
      <nav className="md:hidden flex overflow-x-auto border-b border-border bg-background">
        {NAV_ITEMS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setActiveItem(item)}
            className={`shrink-0 px-4 py-3 text-[.75rem] font-medium border-b-2 ${
              activeItem === item
                ? "text-foreground border-[color:var(--gold)]"
                : "text-muted-foreground border-transparent"
            }`}
          >
            {item}
          </button>
        ))}
      </nav>
      <div className="grid grid-cols-1 md:grid-cols-[210px_1fr] ">
        <aside className="hidden md:flex flex-col border-r border-border py-6">
          <div className="font-display font-semibold text-xl px-6 pb-5">
            Bookzenvo<span className="text-[color:var(--gold-deep)]">.</span>
          </div>
          <nav className="flex flex-col">
            {NAV_ITEMS.map((item) => (
              <button
                type="button"
                key={item}
                onClick={() => setActiveItem(item)}
                className={`px-6 py-2.5 text-[.88rem] border-l-2 transition-colors ${
                  activeItem === item
                    ? "text-foreground border-l-[color:var(--gold)] bg-gradient-to-r from-[color:var(--gold-wash)] to-transparent"
                    : "text-muted-foreground border-l-transparent hover:text-foreground hover:bg-background/70"
                }`}
              >
                {item}
              </button>
            ))}
          </nav>
        </aside>
        <div className="p-6 md:p-9">
          <div className="flex justify-between items-end flex-wrap gap-4 mb-7">
            <div>
              <div className="text-[.8rem] text-muted-foreground uppercase tracking-[0.1em] mb-1.5">
                {activeItem === "Today"
                  ? "Tuesday, July 7"
                  : PREVIEW_DATA[activeItem].eyebrow}
              </div>
              <h2 className="font-display font-medium text-[2rem] leading-[1.05]">
                {activeItem === "Today"
                  ? "Good morning, Nora."
                  : PREVIEW_DATA[activeItem].title}
              </h2>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-[6px] bg-primary text-primary-foreground text-[.85rem] font-semibold px-4 py-2.5"
            >
              {activeItem === "Today"
                ? "New booking"
                : PREVIEW_DATA[activeItem].action}
            </button>
          </div>
          {activeItem === "Today" ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-9">
                {STATS.map((s) => (
                  <div
                    key={s.label}
                    className="rounded-[10px] border border-border bg-background px-5 py-5"
                  >
                    <CountUp
                      target={s.target}
                      prefix={s.prefix}
                      active={inView}
                    />
                    <div className="text-[.7rem] text-muted-foreground uppercase tracking-[0.12em] mt-2">
                      {s.label}
                    </div>
                    <div className="text-[.75rem] text-[color:var(--confirmed)] mt-1">
                      {s.delta}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-[.7rem] font-semibold tracking-[0.16em] uppercase text-muted-foreground">
                  Today's appointments
                </span>
                <span className="text-[.7rem] font-semibold tracking-[0.16em] uppercase text-[color:var(--gold-deep)]">
                  View calendar →
                </span>
              </div>
              <div className="flex flex-col">
                {APPOINTMENTS.map((a, i) => (
                  <div
                    key={a.who}
                    className={`grid grid-cols-[54px_1fr_auto_auto] sm:grid-cols-[76px_1fr_auto_auto] gap-3 sm:gap-4 items-center py-4 border-b border-border last:border-b-0 transition-all duration-500 ease-[cubic-bezier(.2,.7,.3,1)] ${
                      inView
                        ? "opacity-100 translate-y-0"
                        : "opacity-0 translate-y-2.5"
                    }`}
                    style={{
                      transitionDelay: inView ? `${200 + i * 110}ms` : "0ms",
                    }}
                  >
                    <span className="text-[.85rem] font-semibold">
                      {a.time}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[.92rem] font-semibold truncate">
                        {a.who}
                      </span>
                      <span className="block text-[.8rem] text-muted-foreground truncate">
                        {a.what}
                      </span>
                    </span>
                    <span className="hidden sm:block text-[.8rem] text-muted-foreground">
                      with {a.withWhom}
                    </span>
                    <span
                      className={`text-[.68rem] font-semibold px-2.5 py-1 rounded-[5px] tracking-[.03em] ${
                        a.status === "ok"
                          ? "bg-[color:var(--confirmed-bg)] text-[color:var(--confirmed)]"
                          : "bg-[color:var(--pending-bg)] text-[color:var(--pending)]"
                      }`}
                    >
                      {a.status === "ok" ? "Confirmed" : "Pending"}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <ProductPreview section={activeItem} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small product vignettes used as illustration in the feature chapters */
/* ------------------------------------------------------------------ */

function Vignette({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[12px] border border-border bg-white overflow-hidden shadow-[0_1px_2px_rgba(26,26,26,.04),0_24px_48px_-32px_rgba(26,26,26,.25)]">
      {children}
    </div>
  );
}

function VignetteBar({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-background">
      <span className="text-[.7rem] font-semibold tracking-[0.14em] uppercase text-muted-foreground">
        {title}
      </span>
      <span className="flex gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-border" />
        <span className="h-1.5 w-1.5 rounded-full bg-border" />
        <span className="h-1.5 w-1.5 rounded-full bg-border" />
      </span>
    </div>
  );
}

function BookingPageVignette() {
  return (
    <Vignette>
      <VignetteBar title="bookzenvo.com/book/nora-studio" />
      <div className="p-6 md:p-8">
        <div className="font-display text-[1.9rem] leading-tight mb-1">
          Nora Studio
        </div>
        <div className="text-[.8rem] text-muted-foreground mb-6">
          Colour · Cuts · Nails · Inverness
        </div>
        <div className="flex flex-col divide-y divide-border border-y border-border">
          {[
            ["Balayage", "150 min", "£135"],
            ["Signature cut", "60 min", "£55"],
            ["Gel set", "60 min", "£42"],
          ].map(([name, dur, price]) => (
            <div
              key={name}
              className="flex items-center justify-between py-3.5 text-[.88rem]"
            >
              <span>
                <span className="font-semibold">{name}</span>
                <span className="text-muted-foreground"> · {dur}</span>
              </span>
              <span className="flex items-center gap-4">
                <span className="tabular-nums">{price}</span>
                <span className="text-[.68rem] font-semibold tracking-[.06em] uppercase border border-foreground px-2.5 py-1 rounded-[4px]">
                  Book
                </span>
              </span>
            </div>
          ))}
        </div>
        <div className="mt-6 flex items-center gap-3 text-[.8rem] text-muted-foreground">
          <span className="font-display text-[1.1rem] text-[color:var(--gold-deep)] tracking-[.05em]">
            ★★★★★
          </span>
          <span>4.9 · 128 verified reviews</span>
        </div>
      </div>
    </Vignette>
  );
}

function FormVignette() {
  return (
    <Vignette>
      <VignetteBar title="Colour patch test · Maya Richards" />
      <div className="p-6 md:p-8 text-[.85rem]">
        <div className="flex flex-col gap-4">
          {[
            ["Product applied", "Wella Koleston 6/0"],
            ["Applied", "Sat 5 Sep, 14:10"],
            ["Result due", "Mon 7 Sep"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-border pb-3">
              <span className="text-muted-foreground">{k}</span>
              <span className="font-semibold">{v}</span>
            </div>
          ))}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-[8px] border border-[color:var(--confirmed)]/40 bg-[color:var(--confirmed-bg)] text-[color:var(--confirmed)] px-4 py-3 text-center font-semibold">
            No reaction
          </div>
          <div className="rounded-[8px] border border-border px-4 py-3 text-center text-muted-foreground">
            Reaction
          </div>
        </div>
        <div className="mt-6 pt-4 border-t border-border flex items-end justify-between">
          <div>
            <div className="text-[.68rem] uppercase tracking-[.12em] text-muted-foreground mb-1">
              Client signature
            </div>
            <div className="font-display italic text-[1.5rem] leading-none text-[color:var(--charcoal-soft)]">
              Maya Richards
            </div>
          </div>
          <div className="text-[.72rem] text-muted-foreground">
            Signed on tablet · stored securely
          </div>
        </div>
      </div>
    </Vignette>
  );
}

function ReminderVignette() {
  return (
    <Vignette>
      <VignetteBar title="Reminder email · sent yesterday, 18:00" />
      <div className="p-6 md:p-8">
        <div className="font-display text-[1.5rem] leading-tight mb-2">
          See you tomorrow at 9:00, Maya.
        </div>
        <p className="text-[.85rem] text-[color:var(--charcoal-soft)] mb-6">
          Balayage with Camille at Nora Studio. Deposit of £45 already paid.
        </p>
        <div className="flex flex-wrap gap-2.5">
          <span className="rounded-[6px] bg-primary text-primary-foreground text-[.8rem] font-semibold px-4 py-2.5">
            Confirm
          </span>
          <span className="rounded-[6px] border border-border text-[.8rem] font-semibold px-4 py-2.5">
            Reschedule
          </span>
          <span className="rounded-[6px] border border-border text-[.8rem] font-semibold px-4 py-2.5 text-muted-foreground">
            Cancel
          </span>
        </div>
        <div className="mt-6 pt-4 border-t border-border text-[.75rem] text-muted-foreground">
          One tap. No login, no app. The calendar updates the moment she
          answers.
        </div>
      </div>
    </Vignette>
  );
}

function MoneyVignette() {
  return (
    <Vignette>
      <VignetteBar title="Payments · Maya Richards" />
      <div className="p-6 md:p-8 text-[.85rem]">
        <div className="flex flex-col divide-y divide-border">
          {[
            ["Deposit", "Paid online, at booking", "£45.00"],
            ["Balance", "Saved card, charged on the day", "£90.00"],
          ].map(([k, sub, v]) => (
            <div key={k} className="flex items-center justify-between py-3.5">
              <span>
                <span className="block font-semibold">{k}</span>
                <span className="block text-[.75rem] text-muted-foreground">
                  {sub}
                </span>
              </span>
              <span className="tabular-nums font-semibold">{v}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 pt-4 border-t border-foreground flex items-center justify-between">
          <span className="font-semibold">Collected</span>
          <span className="font-display text-[1.6rem] leading-none tabular-nums">
            £135.00
          </span>
        </div>
        <div className="mt-6 flex items-center justify-between text-[.75rem] text-muted-foreground">
          <span>Full or partial refund from the same screen</span>
          <span className="border border-border rounded-[4px] px-2.5 py-1 font-semibold text-foreground">
            Refund
          </span>
        </div>
      </div>
    </Vignette>
  );
}

function StockVignette() {
  return (
    <Vignette>
      <VignetteBar title="Stock scan · back-bar shelf, 09:12" />
      <div className="p-6 md:p-8 text-[.85rem]">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[.68rem] uppercase tracking-[.12em] text-muted-foreground">
            Found in photo
          </span>
          <span className="text-[.68rem] uppercase tracking-[.12em] text-muted-foreground">
            Qty
          </span>
        </div>
        <div className="flex flex-col divide-y divide-border border-y border-border">
          {[
            ["Wella Koleston 6/0", "Colour", "4"],
            ["Olaplex No.3", "Treatment", "7"],
            ["Blondor Lightener 800g", "Lightener", "2"],
          ].map(([n, c, q]) => (
            <div key={n} className="flex items-center justify-between py-3">
              <span>
                <span className="block font-semibold">{n}</span>
                <span className="block text-[.75rem] text-muted-foreground">{c}</span>
              </span>
              <span className="tabular-nums font-semibold">{q}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-center justify-between">
          <span className="text-[.75rem] text-muted-foreground">Review, then add</span>
          <span className="rounded-[6px] bg-primary text-primary-foreground text-[.8rem] font-semibold px-4 py-2">
            Add 3 products
          </span>
        </div>
        <div className="mt-6 pt-4 border-t border-border flex items-center justify-between text-[.78rem]">
          <span className="text-muted-foreground">Balayage completed · 11:40</span>
          <span className="font-semibold text-[color:var(--gold-deep)]">Koleston 6/0 −40 ml</span>
        </div>
      </div>
    </Vignette>
  );
}

function ChairVignette() {
  return (
    <Vignette>
      <VignetteBar title="Team · Nora Studio" />
      <div className="p-6 md:p-8 text-[.85rem]">
        <div className="flex flex-col divide-y divide-border">
          {[
            ["N", "Nora", "Owner", "bg-[#f5e8d0] text-[#9a6b2e]", ""],
            ["C", "Camille", "Employed · Stylist", "bg-[#e8edf7] text-[#5c6d9c]", ""],
            ["J", "Jordan", "Rent-a-chair · Nails", "bg-[#f0e7ee] text-[#966480]", "£120 / week"],
          ].map(([i, n, r, col, rent]) => (
            <div key={n} className="flex items-center gap-3 py-3.5">
              <span className={`grid h-8 w-8 place-items-center rounded-full text-[.7rem] font-bold ${col}`}>
                {i}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{n}</span>
                <span className="block text-[.75rem] text-muted-foreground">{r}</span>
              </span>
              {rent && <span className="tabular-nums text-[.8rem] font-semibold">{rent}</span>}
            </div>
          ))}
        </div>
        <div className="mt-2 pt-4 border-t border-border">
          <div className="text-[.68rem] uppercase tracking-[.12em] text-muted-foreground mb-2.5">
            Jordan can see
          </div>
          <div className="flex flex-wrap gap-2 text-[.75rem]">
            {[["Own diary", true], ["Own clients", true], ["Salon reports", false], ["Other diaries", false]].map(([l, on]) => (
              <span
                key={String(l)}
                className={`rounded-[5px] border px-2.5 py-1 ${on ? "border-foreground" : "border-border text-muted-foreground line-through"}`}
              >
                {l}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Vignette>
  );
}

/* ------------------------------------------------------------------ */

function Landing() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const steps = [
    {
      n: "01",
      title: "Set up in an afternoon",
      body: "Add your services, prices, hours and team, or import them from your old system. Your page goes live at your own link, in your own colours.",
    },
    {
      n: "02",
      title: "Share one link",
      body: "Instagram bio, Google listing, every “are you free Saturday?” Clients pick a time, pay a deposit, done. Nothing to download.",
    },
    {
      n: "03",
      title: "The day runs itself",
      body: "Bookings land with no clashes, reminders go out on their own, and every visit is saved to the client book.",
    },
  ];

  const chapters: {
    label: string;
    title: string;
    body: string;
    points: string[];
    art: React.ReactNode;
  }[] = [
    {
      label: "Consultations & patch tests",
      title: "Paperless consultations, signed in the chair.",
      body: "Build your own forms, record patch-test results and collect a legally traceable signature, on a tablet, in the salon.",
      points: [
        "Custom forms for colour, lash, tattoo and treatments",
        "Patch-test results with due dates",
        "Signatures stored on the client record",
      ],
      art: <FormVignette />,
    },
    {
      label: "Stock",
      title: "Photograph a shelf. Bookzenvo counts it.",
      body: "AI identifies the products, quantities and categories for you to review and add. Link products to services and stock deducts itself when the appointment completes.",
      points: [
        "Scan a shelf from a photo",
        "Automatic usage per service",
        "Low-stock status at a glance",
      ],
      art: <StockVignette />,
    },
    {
      label: "Your page",
      title: "A booking page that looks like your salon.",
      body: "Build it visually: sections, colours, fonts, photos, with a live mobile preview. Or ask the AI editor for a change, preview the result and approve it before anything goes live.",
      points: [
        "Custom sections, colours, fonts and photos",
        "AI edits you preview and approve first",
        "Verified reviews, only from completed appointments",
      ],
      art: <BookingPageVignette />,
    },
    {
      label: "Chair rental",
      title: "Self-employed professionals, one calendar.",
      body: "Invite renters, share one booking page and calendar, decide exactly what each person can see, and track rent or commission.",
      points: [
        "Their own diary and clients, walled off from yours",
        "Permissions you control per person",
        "Rent or commission tracked",
      ],
      art: <ChairVignette />,
    },
    {
      label: "Self-service",
      title: "Clients handle it themselves.",
      body: "Confirmations, calendar invites and reminders go out automatically, each with one-tap confirm, reschedule and cancel. No phone calls, no login.",
      points: [
        "Automatic confirmations and reminders",
        "One-tap actions, secure links",
        "A customer portal for bookings and details",
      ],
      art: <ReminderVignette />,
    },
    {
      label: "Money",
      title: "Deposits now, balance later, refunds safely.",
      body: "Take a deposit or full payment at booking, collect the remaining balance on the day, and refund any charge through Stripe.",
      points: [
        "Deposit or full payment, per service",
        "Balance charged to the saved card",
        "Every refund tracked per charge",
      ],
      art: <MoneyVignette />,
    },
  ];

  const more: [string, string][] = [
    ["Processing-time booking", "Book another client while colour develops, with no clashes."],
    ["AI business co-pilot", "Today's summary, quiet slots, performance and promotions from real data."],
    ["No-clash calendar", "Every booking checked before it saves. Drag, resize, undo."],
    ["Client book", "Visits, spend and notes, built from real bookings."],
    ["Privacy tools", "Clients can request their data or deletion; financial records are kept."],
    ["Reports", "Revenue, busiest hours, top services. Export or print."],
    ["Import from anywhere", "Staff, clients, services and history. Review first, undo if needed."],
    ["Export any time", "Your client list is yours, on every plan."],
  ];

  const tiers: {
    name: string;
    price: string;
    per?: string;
    desc: string;
    intro?: string;
    features: string[];
    cta: string;
    featured?: boolean;
  }[] = [
    {
      name: "Solo",
      price: "Free",
      desc: "Everything one chair needs. Not a trial.",
      features: [
        "One staff member",
        "Unlimited bookings",
        "Branded booking page",
        "Deposits & online payments",
        "Confirmation emails",
        "Client book",
        "Import from your old system",
      ],
      cta: "Join the waitlist",
    },
    {
      name: "Studio",
      price: "£22",
      per: "/month",
      desc: "The whole floor, and the work that goes with it.",
      intro: "Everything in Solo, plus",
      features: [
        "Unlimited staff & chair rental, with rent or commission tracking",
        "Paperless consultations & patch tests, with signatures",
        "Verified customer reviews on your page",
        "Stock, with photo scanning and automatic usage per service",
        "Automated reminders with one-tap confirm, reschedule & cancel",
        "Customer portal",
        "AI business co-pilot & AI page editor",
        "Analytics & insights",
      ],
      cta: "Join the waitlist",
      featured: true,
    },
  ];

  return (
    <CookieConsentProvider>
      <div className="min-h-screen bg-background text-foreground font-sans">
        {/* Header */}
        <header
          className={`sticky top-0 z-50 backdrop-blur-md bg-background/90 transition-colors ${
            scrolled ? "border-b border-border" : "border-b border-transparent"
          }`}
        >
          <div className="max-w-[1120px] mx-auto px-6 h-20 flex items-center justify-between">
            <Wordmark className="text-[1.7rem]" />
            <nav className="hidden md:flex items-center gap-10 text-[.9rem] font-medium text-muted-foreground">
              <a href="#how" className="hover:text-foreground transition-colors">
                How it works
              </a>
              <a href="#features" className="hover:text-foreground transition-colors">
                Features
              </a>
              <a href="#switch" className="hover:text-foreground transition-colors">
                Switch
              </a>
              <a href="#pricing" className="hover:text-foreground transition-colors">
                Pricing
              </a>
            </nav>
            <div className="flex items-center gap-5">
              <Link
                to="/auth"
                className="hidden sm:inline-flex text-[.9rem] font-semibold hover:opacity-70 transition-opacity"
              >
                Sign in
              </Link>
              <Link
                to="/auth"
                search={{ mode: "signup" } as any}
                className="inline-flex items-center gap-2 rounded-[6px] bg-primary text-primary-foreground font-semibold text-[.9rem] px-5 py-2.5 transition-all hover:-translate-y-px hover:shadow-[0_12px_24px_-12px_rgba(26,26,26,.4)]"
              >
                Join the waitlist
              </Link>
            </div>
          </div>
        </header>

        {/* Hero */}
        <section className="relative overflow-hidden pt-14 pb-14 md:pt-20 md:pb-20">
          <div className="dot-grid" />
          <div className="relative z-[1] max-w-[1120px] mx-auto px-6">
            <div className="bz-reveal bz-reveal-1 flex items-center mb-8">
              <Mark />
              <span className="text-[.7rem] font-semibold tracking-[0.16em] uppercase text-[color:var(--gold-deep)]">
                Now onboarding the first salons
              </span>
            </div>
            <h1 className="bz-reveal bz-reveal-2 font-display font-medium leading-[1.02] tracking-[-0.02em] text-[clamp(2.6rem,6.8vw,5.4rem)] max-w-[15ch]">
              Booking software that runs the work others{" "}
              <em className="italic text-[color:var(--gold-deep)]">
                leave to the salon.
              </em>
            </h1>
            <p className="bz-reveal bz-reveal-3 text-[1.15rem] text-[color:var(--charcoal-soft)] max-w-[46ch] my-8 leading-relaxed">
              Bookings, payments, consultations, stock and chair rentals in one
              place. Less paperwork, fewer empty slots, less admin.
            </p>
            <div className="bz-reveal bz-reveal-4 flex items-center gap-6 flex-wrap">
              <Link
                to="/auth"
                search={{ mode: "signup" } as any}
                className="group inline-flex items-center gap-2 rounded-[6px] bg-primary text-primary-foreground font-semibold text-[.95rem] px-7 py-4 transition-all hover:-translate-y-px hover:shadow-[0_16px_32px_-12px_rgba(26,26,26,.4)]"
              >
                Join the waitlist
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <span className="text-[.88rem] text-muted-foreground">
                Free for one chair · No card needed · No commission
              </span>
            </div>
            <div className="bz-reveal bz-reveal-4 mt-10 text-[.8rem] text-muted-foreground">
              Built alongside a working salon in Scotland, on real bookings.
            </div>
          </div>
        </section>

        {/* Product shot */}
        <div className="pb-14 md:pb-20">
          <div className="max-w-[1120px] mx-auto px-6">
            <DashboardPreview />
          </div>
        </div>

        {/* Made for */}
        <div className="border-y border-border bg-white">
          <div className="max-w-[1120px] mx-auto px-6 py-4 flex flex-wrap items-center justify-center gap-y-2 text-[.72rem] tracking-[0.09em] uppercase text-muted-foreground">
            <span className="text-[color:var(--gold-deep)] font-semibold pr-6">
              Made for
            </span>
            {[
              "Hair salons",
              "Barbershops",
              "Nail studios",
              "Tattoo artists",
              "Lash & brow",
              "Rent-a-chair",
            ].map((d, i) => (
              <span
                key={d}
                className={`px-4 ${i > 0 ? "border-l border-border" : ""}`}
              >
                {d}
              </span>
            ))}
          </div>
        </div>

        {/* How it works */}
        <section id="how" className="py-16 md:py-20">
          <div className="max-w-[1120px] mx-auto px-6">
            <div className="mb-12">
              <SectionLabel>How it works</SectionLabel>
              <h2 className="font-display font-medium text-[clamp(2rem,4.2vw,3.2rem)] tracking-[-0.015em] leading-[1.05] max-w-[20ch]">
                Three steps, and the diary starts filling itself.
              </h2>
            </div>
            <div className="grid md:grid-cols-3">
              {steps.map((s, i) => (
                <div
                  key={s.n}
                  className={
                    i > 0
                      ? "border-t md:border-t-0 md:border-l border-border pt-10 md:pt-0 md:pl-10 mt-10 md:mt-0"
                      : "md:pr-10"
                  }
                >
                  <div
                    className="font-display italic text-[3.5rem] leading-none text-[color:var(--gold)]/50 mb-4 select-none"
                    aria-hidden
                  >
                    {s.n}
                  </div>
                  <h3 className="font-display font-semibold text-[1.6rem] mb-2.5">
                    {s.title}
                  </h3>
                  <p className="text-[color:var(--charcoal-soft)] text-[.95rem] leading-relaxed">
                    {s.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Feature chapters */}
        <section id="features" className="bg-white border-t border-border">
          <div className="max-w-[1120px] mx-auto px-6 pt-16 md:pt-20">
            <div className="mb-2">
              <SectionLabel>What&apos;s inside</SectionLabel>
              <h2 className="font-display font-medium text-[clamp(2rem,4.2vw,3.2rem)] tracking-[-0.015em] leading-[1.05] max-w-[22ch]">
                Everything a working salon actually uses.
              </h2>
              <p className="text-[color:var(--charcoal-soft)] text-[1.02rem] max-w-[60ch] mt-4">
                Not a booking widget with extras bolted on. The page, the
                calendar, the forms, the money and the stock, built together.
              </p>
            </div>
          </div>

          <div className="max-w-[1120px] mx-auto px-6">
            {chapters.map((c, i) => (
              <div
                key={c.label}
                className={`grid md:grid-cols-2 gap-10 md:gap-16 items-center py-12 md:py-14 ${
                  i > 0 ? "border-t border-border" : ""
                }`}
              >
                <div className={i % 2 === 1 ? "md:order-2" : ""}>
                  <div className="flex items-center mb-5">
                    <span className="font-display italic text-[1.1rem] text-[color:var(--gold-deep)] mr-3">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[.7rem] font-semibold tracking-[0.16em] uppercase text-[color:var(--gold-deep)]">
                      {c.label}
                    </span>
                  </div>
                  <h3 className="font-display font-medium text-[clamp(1.6rem,2.8vw,2.1rem)] leading-[1.1] tracking-[-0.01em] mb-3">
                    {c.title}
                  </h3>
                  <p className="text-[color:var(--charcoal-soft)] text-[.95rem] leading-relaxed mb-5">
                    {c.body}
                  </p>
                  <ul className="flex flex-col divide-y divide-border border-y border-border">
                    {c.points.map((p) => (
                      <li key={p} className="flex gap-3 py-2.5 text-[.88rem]">
                        <Check className="h-4 w-4 shrink-0 mt-0.5 text-[color:var(--gold-deep)]" />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={i % 2 === 1 ? "md:order-1" : ""}>{c.art}</div>
              </div>
            ))}
          </div>

          {/* And the rest */}
          <div className="border-t border-border">
            <div className="max-w-[1120px] mx-auto px-6 py-12 md:py-14">
              <div className="flex items-baseline gap-4 mb-6">
                <span className="font-display italic text-[1.3rem] text-[color:var(--gold-deep)]">
                  And the rest of the floor.
                </span>
                <span className="hidden sm:block flex-1 border-t border-border" />
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-5">
                {more.map(([t, b]) => (
                  <div key={t} className="flex gap-3 text-[.86rem]">
                    <Check className="h-4 w-4 shrink-0 mt-0.5 text-[color:var(--gold-deep)]" />
                    <span>
                      <span className="font-semibold">{t}.</span>{" "}
                      <span className="text-[color:var(--charcoal-soft)]">{b}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Switching */}
        <section id="switch" className="py-16 md:py-20 border-t border-border">
          <div className="max-w-[1120px] mx-auto px-6 grid md:grid-cols-[1fr_1.1fr] gap-12 md:gap-20 items-center">
            <div>
              <SectionLabel>Switching</SectionLabel>
              <h2 className="font-display font-medium text-[clamp(2rem,3.6vw,2.8rem)] tracking-[-0.015em] leading-[1.08] max-w-[16ch]">
                Leaving Fresha, Square, Vagaro or Booksy?
              </h2>
              <p className="text-[color:var(--charcoal-soft)] text-[1.02rem] leading-relaxed mt-6 max-w-[48ch]">
                Upload your export and your team, clients, services and history
                come across in one go.
              </p>
            </div>
            <div className="flex flex-col divide-y divide-border border-y border-border">
              {[
                ["No per-staff fees", "One flat price, however many chairs."],
                ["No commission", "Never a cut of your own clients."],
                ["No lock-in", "Export your client list any time."],
                ["No paywalled support", "Real help, on the free plan too."],
              ].map(([t, b]) => (
                <div key={t} className="py-4 grid grid-cols-[1.4rem_1fr] gap-3">
                  <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[color:var(--gold)]" aria-hidden />
                  <span>
                    <span className="block font-display font-semibold text-[1.2rem] mb-0.5">
                      {t}
                    </span>
                    <span className="block text-[.9rem] text-[color:var(--charcoal-soft)]">
                      {b}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="py-16 md:py-20 border-t border-border bg-white">
          <div className="max-w-[1120px] mx-auto px-6">
            <div className="mb-12">
              <SectionLabel>Pricing</SectionLabel>
              <h2 className="font-display font-medium text-[clamp(2rem,4.2vw,3.2rem)] tracking-[-0.015em] leading-[1.05] max-w-[20ch]">
                Free while it&apos;s just you and the chair.
              </h2>
            </div>
            <div className="grid md:grid-cols-2 gap-5 max-w-[440px] md:max-w-[820px] mx-auto">
              {tiers.map((t) => {
                const featured = !!t.featured;
                return (
                  <div
                    key={t.name}
                    className={`relative rounded-xl p-8 md:p-10 flex flex-col ${
                      featured
                        ? "bg-primary text-primary-foreground"
                        : "bg-white border border-border"
                    }`}
                    style={
                      !featured ? { boxShadow: "var(--shadow-elegant)" } : undefined
                    }
                  >
                    {featured && (
                      <span className="absolute -top-[11px] left-8 bg-primary text-primary-foreground text-[.6rem] font-bold tracking-[0.12em] uppercase px-2.5 py-1 rounded-[4px] border border-[color:var(--gold)]">
                        Most popular
                      </span>
                    )}
                    <div className="font-display font-semibold text-[1.4rem]">
                      {t.name}
                    </div>
                    <div className="font-display font-medium text-[2.8rem] leading-none mt-2">
                      {t.price}
                      {t.per && (
                        <span
                          className={`font-sans text-[.9rem] ${featured ? "text-primary-foreground/60" : "text-muted-foreground"}`}
                        >
                          {t.per}
                        </span>
                      )}
                    </div>
                    <div
                      className={`text-[.88rem] mt-1.5 mb-7 ${featured ? "text-primary-foreground/65" : "text-muted-foreground"}`}
                    >
                      {t.desc}
                    </div>
                    {t.intro && (
                      <div className="text-[.68rem] font-semibold tracking-[0.14em] uppercase text-[color:var(--gold)] mb-3">
                        {t.intro}
                      </div>
                    )}
                    <ul className="flex-1 flex flex-col gap-2.5 mb-8">
                      {t.features.map((feat) => (
                        <li key={feat} className="flex gap-2.5 text-[.9rem]">
                          <Check
                            className={`h-4 w-4 shrink-0 mt-0.5 ${featured ? "text-[color:var(--gold)]" : "text-[color:var(--gold-deep)]"}`}
                          />
                          <span
                            className={
                              featured
                                ? "text-primary-foreground/90"
                                : "text-[color:var(--charcoal-soft)]"
                            }
                          >
                            {feat}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <Link
                      to="/auth"
                      search={{ mode: "signup" } as any}
                      className={`w-full inline-flex items-center justify-center rounded-[6px] font-semibold text-[.92rem] px-5 py-3 transition-all ${
                        featured
                          ? "bg-background text-foreground hover:-translate-y-px hover:shadow-[0_8px_24px_-8px_rgba(26,26,26,.25)]"
                          : "border border-foreground hover:bg-foreground hover:text-background"
                      }`}
                    >
                      {t.cta}
                    </Link>
                  </div>
                );
              })}
            </div>
            <p className="text-center text-[.88rem] text-muted-foreground mt-8">
              Cancel any time. Export your full client list on every plan. No
              lock-in.
            </p>
            <p className="text-center text-[.8rem] text-muted-foreground mt-3 max-w-[52ch] mx-auto">
              Card payments run through Stripe at their standard rate (1.5% + 20p
              on UK cards). Bookzenvo takes nothing on top.
            </p>
          </div>
        </section>

        {/* Final CTA */}
        <section className="pb-20 md:pb-24 pt-6 border-t border-border bg-white">
          <div className="max-w-[1120px] mx-auto px-6">
            <div className="grain relative overflow-hidden rounded-xl bg-primary text-primary-foreground px-8 py-14 md:px-14 md:py-16 grid md:grid-cols-[1.2fr_1fr] gap-10 items-center">
              <div className="relative z-[1]">
                <h2 className="font-display font-medium text-[clamp(2.2rem,4.4vw,3.6rem)] leading-[1.05] max-w-[16ch] mb-4">
                  Your next client could book{" "}
                  <em className="italic text-[color:var(--gold)]">tonight.</em>
                </h2>
                <p className="text-primary-foreground/65 max-w-[40ch] mb-9 text-[1.05rem] leading-relaxed">
                  Free for one chair, no card needed, nothing to install.
                </p>
                <Link
                  to="/auth"
                  search={{ mode: "signup" } as any}
                  className="group inline-flex items-center gap-2 rounded-[6px] bg-background text-foreground font-semibold text-[.95rem] px-6 py-3.5 hover:opacity-90 hover:-translate-y-px transition-all"
                >
                  Join the waitlist
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
              <ul className="relative z-[1] hidden md:flex flex-col divide-y divide-primary-foreground/10 border-y border-primary-foreground/10">
                {[
                  ["Free for one chair", "No card, no time limit."],
                  ["Bring your old system with you", "Import staff, clients, services and history."],
                  ["No commission, no per-staff fees", "One flat price for the whole floor."],
                ].map(([t, b]) => (
                  <li key={t} className="py-4 flex gap-3">
                    <Check className="h-4 w-4 shrink-0 mt-1 text-[color:var(--gold)]" />
                    <span>
                      <span className="block font-semibold text-[.95rem]">{t}</span>
                      <span className="block text-[.82rem] text-primary-foreground/60">{b}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-border py-11 bg-white">
          <div className="max-w-[1120px] mx-auto px-6 flex flex-wrap items-center justify-between gap-4 text-[.85rem] text-muted-foreground">
            <Wordmark className="text-[1.2rem]" />
            <div>
              © {new Date().getFullYear()} Bookzenvo. Made for people who work
              from a chair.
            </div>
            <div className="flex flex-wrap gap-7">
              <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
              <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
              <Link to="/cookie-policy" className="hover:text-foreground transition-colors">Cookies</Link>
              <Link to="/refund-policy" className="hover:text-foreground transition-colors">Refunds</Link>
              <Link to="/faq" className="hover:text-foreground transition-colors">FAQ</Link>
              <a href="mailto:help@bookzenvo.com" className="hover:text-foreground transition-colors">Contact</a>
              <Link to="/help" className="hover:text-foreground transition-colors">Help Centre</Link>
              <Link to="/status" className="hover:text-foreground transition-colors">Status</Link>
              <CookieSettingsFooterLink />
            </div>
          </div>
        </footer>
      </div>
      <CookieConsentBanner />
    </CookieConsentProvider>
  );
}
