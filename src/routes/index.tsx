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
      { title: "Bookzenvo — Booking software that works as hard as you do." },
      {
        name: "description",
        content:
          "A branded booking page, a calendar that refuses double-bookings, and a client book that remembers everyone — for salons, barbershops and rent-a-chair independents.",
      },
      {
        property: "og:title",
        content: "Bookzenvo — Booking software that works as hard as you do.",
      },
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
  "Staff",
  "Services",
  "Payments",
  "Settings",
];

const STATS = [
  { target: 12, prefix: "", label: "Bookings today", delta: "+3 vs last Tuesday" },
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
            <div className="text-[.75rem] text-[color:var(--confirmed)] mt-1">{s.delta}</div>
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
              <span className="block text-[.92rem] font-semibold truncate">{a.who}</span>
              <span className="block text-[.8rem] text-muted-foreground truncate">{a.what}</span>
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
          <span className="rounded-[4px] bg-primary px-3 py-1.5 text-primary-foreground">Day</span>
          <span className="px-3 py-1.5 text-muted-foreground">Week</span>
          <span className="hidden sm:inline px-3 py-1.5 text-muted-foreground">Month</span>
        </div>
        <div className="flex items-center gap-2 text-[.72rem] font-semibold">
          <span className="hidden sm:inline rounded-[6px] border border-border bg-white px-3 py-2 text-muted-foreground">
            ‹
          </span>
          <span className="rounded-[6px] bg-primary px-3 py-2 text-primary-foreground">Today</span>
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
              <span className="block truncate text-[.75rem] font-semibold">{name}</span>
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

function ProductPreview({ section }: { section: Exclude<(typeof NAV_ITEMS)[number], "Today"> }) {
  if (section === "Calendar") return <CalendarPreview />;

  if (section === "Calendar") {
    return (
      <div className="rounded-[10px] border border-border overflow-hidden">
        <div className="grid grid-cols-[64px_repeat(5,minmax(0,1fr))] bg-background border-b border-border text-[.68rem] uppercase tracking-[.1em] text-muted-foreground">
          <span className="p-3" />
          {["Mon 6", "Tue 7", "Wed 8", "Thu 9", "Fri 10"].map((day) => (
            <span key={day} className="p-3 text-center">
              {day}
            </span>
          ))}
        </div>
        {["9:00", "10:30", "12:00", "1:30", "3:00"].map((time, row) => (
          <div
            key={time}
            className="grid grid-cols-[64px_repeat(5,minmax(0,1fr))] min-h-14 border-b border-border last:border-b-0"
          >
            <span className="p-3 text-[.72rem] text-muted-foreground">{time}</span>
            {[0, 1, 2, 3, 4].map((day) => {
              const booked =
                (row === 0 && day === 1) || (row === 2 && day === 3) || (row === 3 && day === 0);
              return (
                <span
                  key={day}
                  className={`border-l border-border p-1.5 ${booked ? "bg-[color:var(--gold-wash)]" : ""}`}
                >
                  {booked && (
                    <span className="block rounded bg-[color:var(--gold)] px-1.5 py-1 text-[.62rem] font-semibold text-foreground">
                      {day === 1 ? "Maya · 9:00" : "Booked"}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  if (section === "Bookings") {
    return (
      <PreviewList
        rows={APPOINTMENTS.map((a) => [a.who, a.what, a.status === "ok" ? "Confirmed" : "Pending"])}
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
            <span className="block text-[.75rem] text-muted-foreground truncate">{subtitle}</span>
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

function CountUp({ target, prefix, active }: { target: number; prefix: string; active: boolean }) {
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
  const [activeItem, setActiveItem] = useState<(typeof NAV_ITEMS)[number]>("Today");

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
      className={`bg-white border border-border rounded-xl overflow-hidden shadow-[0_1px_2px_rgba(26,26,26,.03),0_40px_80px_-40px_rgba(26,26,26,.18)] transition-all duration-[800ms] ease-[cubic-bezier(.2,.7,.3,1)] ${
        inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
      }`}
    >
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border">
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="h-2.5 w-2.5 rounded-full bg-border" />
        <span className="text-[.75rem] text-muted-foreground ml-2.5">bookzenvo.com/dashboard</span>
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
      <div className="grid grid-cols-1 md:grid-cols-[210px_1fr] min-h-[520px]">
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
                className={`px-6 py-2.5 text-[.88rem] border-l-2 ${
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
                {activeItem === "Today" ? "Tuesday, July 7" : PREVIEW_DATA[activeItem].eyebrow}
              </div>
              <h3 className="font-display font-medium text-[2rem] leading-[1.05]">
                {activeItem === "Today" ? "Good morning, Nora." : PREVIEW_DATA[activeItem].title}
              </h3>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-[6px] bg-primary text-primary-foreground text-[.85rem] font-semibold px-4 py-2.5"
            >
              {activeItem === "Today" ? "New booking" : PREVIEW_DATA[activeItem].action}
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
                      inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2.5"
                    }`}
                    style={{ transitionDelay: inView ? `${200 + i * 110}ms` : "0ms" }}
                  >
                    <span className="text-[.85rem] font-semibold">{a.time}</span>
                    <span className="min-w-0">
                      <span className="block text-[.92rem] font-semibold truncate">{a.who}</span>
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
      n: "No. 1",
      title: "Build your page",
      body: "Your services, prices and hours — cuts, colour, sets, sessions. A booking page at your own link, in your own colours.",
    },
    {
      n: "No. 2",
      title: "Put the link everywhere",
      body: "Instagram bio, Google listing, the reply to every “you free Saturday?” One link makes every channel bookable.",
    },
    {
      n: "No. 3",
      title: "Stay in the chair",
      body: "Bookings land while you work. Every client is saved to your book automatically — visits, spend, notes.",
    },
  ];

  const features: { title: string; body: string; soon?: boolean }[] = [
    {
      title: "Your page, your brand",
      body: "Your colours, your logo, your services — clients book without downloading anything.",
    },
    {
      title: "No-clash calendar",
      body: "Per-chair schedules. Two clients can't take the same slot — blocked at the source.",
    },
    {
      title: "Client book",
      body: "Visit history, spend and notes build themselves from real bookings. Regulars, remembered.",
    },
    {
      title: "Deposits & payments",
      body: "Take deposits on big appointments so Saturday no-shows stop costing you.",
    },
    {
      title: "Chairs & renters",
      body: "Employed stylists or rent-a-chair independents — each with their own diary and clients.",
    },
    {
      title: "Switch from any booking system",
      body: "Bring your team, clients, services and appointment history across — from Fresha, Square, Vagaro, Booksy and more.",
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
      desc: "One chair, one you.",
      features: [
        "One staff member",
        "Unlimited bookings",
        "Deposits & online payments",
        "Branded page & client book",
      ],
      cta: "Start free",
    },
    {
      name: "Studio",
      price: "£22",
      per: "/month",
      desc: "A growing floor.",
      features: [
        "Unlimited staff",
        "Analytics & insights",
        "AI assistant & AI page editor",
      ],
      cta: "Start free",
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
                Start free
              </Link>
            </div>
          </div>
        </header>

        {/* Hero */}
        <section className="relative overflow-hidden pt-24 pb-16 md:pt-[110px] md:pb-24">
          <div className="dot-grid" />
          <div className="relative z-[1] max-w-[1120px] mx-auto px-6">
            <div className="bz-reveal bz-reveal-1 flex items-center mb-8">
              <Mark />
              <span className="text-[.7rem] font-semibold tracking-[0.16em] uppercase text-[color:var(--gold-deep)]">
                Now onboarding the first salons
              </span>
            </div>
            <h1 className="bz-reveal bz-reveal-2 font-display font-medium leading-[1.02] tracking-[-0.02em] text-[clamp(2.6rem,7.6vw,6rem)] max-w-[14ch]">
              Booking software that works as hard{" "}
              <em className="italic text-[color:var(--gold-deep)]">as you do.</em>
            </h1>
            <p className="bz-reveal bz-reveal-3 text-[1.15rem] text-[color:var(--charcoal-soft)] max-w-[44ch] my-8">
              Built for salons, barbershops, nail studios and tattoo artists. Clients book straight
              into your day — no DMs, no double-bookings, every regular remembered.
            </p>
            <div className="bz-reveal bz-reveal-4 flex items-center gap-6 flex-wrap">
              <Link
                to="/auth"
                search={{ mode: "signup" } as any}
                className="group inline-flex items-center gap-2 rounded-[6px] bg-primary text-primary-foreground font-semibold text-[.95rem] px-7 py-4 transition-all hover:-translate-y-px hover:shadow-[0_12px_24px_-12px_rgba(26,26,26,.4)]"
              >
                Create your booking page
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <span className="text-[.88rem] text-muted-foreground">
                Free for one chair · No card needed
              </span>
            </div>
          </div>
        </section>

        {/* Product shot */}
        <div className="pb-16 md:pb-[100px]">
          <div className="max-w-[1120px] mx-auto px-6">
            <DashboardPreview />
          </div>
        </div>

        {/* Made for */}
        <div className="border-y border-border py-6 bg-white">
          <div className="max-w-[1120px] mx-auto px-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-2 text-[.8rem] tracking-[0.1em] uppercase text-muted-foreground">
            <b className="text-[color:var(--gold-deep)] font-semibold">Made for</b>
            <span>Hair salons</span>
            <span>Barbershops</span>
            <span>Nail studios</span>
            <span>Tattoo artists</span>
            <span>Lash &amp; brow</span>
            <span>Rent-a-chair</span>
          </div>
        </div>

        {/* How it works */}
        <section id="how" className="py-20 md:py-24">
          <div className="max-w-[1120px] mx-auto px-6">
            <div className="mb-14">
              <SectionLabel>How it works</SectionLabel>
              <div className="font-display font-medium text-[clamp(2rem,4.2vw,3.2rem)] tracking-[-0.015em] leading-[1.05] max-w-[20ch]">
                Three steps, and the diary starts filling itself.
              </div>
            </div>
            <div className="grid md:grid-cols-3">
              {steps.map((s, i) => (
                <div
                  key={s.n}
                  className={
                    i > 0
                      ? "border-t md:border-t-0 md:border-l border-border pt-8 md:pt-0 md:pl-9 mt-8 md:mt-0"
                      : ""
                  }
                >
                  <div className="font-display italic text-[1.1rem] text-[color:var(--gold-deep)] mb-3.5">
                    {s.n}
                  </div>
                  <h3 className="font-display font-semibold text-[1.55rem] mb-2">{s.title}</h3>
                  <p className="text-[color:var(--charcoal-soft)] text-[.95rem]">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="bg-white border-y border-border">
          <div className="max-w-[1120px] mx-auto px-6 py-20 md:py-24">
            <div className="mb-14">
              <SectionLabel>What's inside</SectionLabel>
              <div className="font-display font-medium text-[clamp(2rem,4.2vw,3.2rem)] tracking-[-0.015em] leading-[1.05] max-w-[20ch]">
                Everything the chair needs. Nothing it doesn't.
              </div>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 border-t border-l border-border">
              {features.map((f) => (
                <div key={f.title} className="border-r border-b border-border p-8">
                  <h3 className="font-display font-semibold text-[1.35rem] mb-2 flex items-center gap-2">
                    {f.title}
                    {f.soon && (
                      <span className="font-sans text-[.58rem] font-bold tracking-[0.1em] uppercase text-[color:var(--gold-deep)] border border-[color:var(--gold)] rounded px-1.5 py-0.5">
                        Soon
                      </span>
                    )}
                  </h3>
                  <p className="text-[color:var(--charcoal-soft)] text-[.92rem]">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="py-20 md:py-24">
          <div className="max-w-[1120px] mx-auto px-6">
            <div className="mb-14">
              <SectionLabel>Pricing</SectionLabel>
              <div className="font-display font-medium text-[clamp(2rem,4.2vw,3.2rem)] tracking-[-0.015em] leading-[1.05] max-w-[20ch]">
                Free while it's just you and the chair.
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-5 max-w-[440px] md:max-w-[720px] mx-auto">
              {tiers.map((t) => {
                const featured = !!t.featured;
                return (
                  <div
                    key={t.name}
                    className={`relative rounded-xl p-8 flex flex-col ${
                      featured
                        ? "bg-primary text-primary-foreground"
                        : "bg-white border border-border"
                    }`}
                  >
                    {featured && (
                      <span className="absolute -top-[11px] left-8 bg-primary text-primary-foreground text-[.6rem] font-bold tracking-[0.12em] uppercase px-2.5 py-1 rounded-[4px] border border-[color:var(--gold)]">
                        Most popular
                      </span>
                    )}
                    <div className="font-display font-semibold text-[1.4rem]">{t.name}</div>
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
                      className={`text-[.88rem] mt-1 mb-7 ${featured ? "text-primary-foreground/65" : "text-muted-foreground"}`}
                    >
                      {t.desc}
                    </div>
                    <ul className="flex-1 flex flex-col gap-2.5 mb-7">
                      {t.features.map((f) => (
                        <li key={f} className="flex gap-2.5 text-[.9rem]">
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
                            {f}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <Link
                      to="/auth"
                      search={{ mode: "signup" } as any}
                      className={`w-full inline-flex items-center justify-center rounded-[6px] font-semibold text-[.92rem] px-5 py-3 transition-all ${
                        featured
                          ? "bg-background text-foreground hover:-translate-y-px"
                          : "border border-border hover:border-foreground/60"
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
          <div className="max-w-[1120px] mx-auto px-6">
            <div className="relative overflow-hidden rounded-xl bg-primary text-primary-foreground px-8 py-16 md:px-12 md:py-20">
              <span
                aria-hidden
                className="absolute top-0 right-20 w-px h-full opacity-50"
                style={{ background: "linear-gradient(var(--gold), transparent)" }}
              />
              <h2 className="font-display font-medium text-[clamp(2.2rem,4.4vw,3.4rem)] leading-[1.05] max-w-[16ch] mb-4">
                Your next client could book{" "}
                <em className="italic text-[color:var(--gold)]">tonight.</em>
              </h2>
              <p className="text-primary-foreground/65 max-w-[40ch] mb-8">
                Set up your booking page in minutes. Free for one chair, no card needed.
              </p>
              <Link
                to="/auth"
                search={{ mode: "signup" } as any}
                className="inline-flex items-center gap-2 rounded-[6px] bg-background text-foreground font-semibold text-[.95rem] px-6 py-3.5 hover:opacity-90 transition"
              >
                Create your booking page
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-border py-11">
          <div className="max-w-[1120px] mx-auto px-6 flex flex-wrap items-center justify-between gap-4 text-[.85rem] text-muted-foreground">
            <Wordmark className="text-[1.2rem]" />
            <div>
              © {new Date().getFullYear()} Bookzenvo — made for people who work from a chair.
            </div>
            <div className="flex gap-7">
              <Link to="/privacy" className="hover:text-foreground">
                Privacy
              </Link>
              <Link to="/terms" className="hover:text-foreground">
                Terms
              </Link>
              <Link to="/cookie-policy" className="hover:text-foreground">
                Cookies
              </Link>
              <Link to="/faq" className="hover:text-foreground">
                FAQ
              </Link>
              <Link to="/help" className="hover:text-foreground">
                Contact
              </Link>
              <Link to="/help" className="hover:text-foreground">
                Help Centre
              </Link>
              <Link to="/status" className="hover:text-foreground">
                Status
              </Link>
              <CookieSettingsFooterLink />
            </div>
          </div>
        </footer>
      </div>
      <CookieConsentBanner />
    </CookieConsentProvider>
  );
}
