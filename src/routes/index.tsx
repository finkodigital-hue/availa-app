import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarCheck,
  Check,
  ChevronRight,
  CreditCard,
  Menu,
  MessageCircleMore,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  CookieConsentBanner,
  CookieConsentProvider,
  CookieSettingsFooterLink,
} from "@/components/cookie-consent";
import "../landing.css";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title:
          "Bookzenvo · Booking software that runs the work others leave to the salon.",
      },
      {
        name: "description",
        content:
          "Bookings, payments, consultations, patch tests, verified reviews, stock, chair rentals and practical AI in one place, for salons, barbershops, nail studios and tattoo artists.",
      },
      {
        property: "og:title",
        content:
          "Bookzenvo · Booking software that runs the work others leave to the salon.",
      },
      {
        property: "og:description",
        content:
          "Bookings, payments, consultations, patch tests, verified reviews, stock, chair rentals and practical AI in one place. Free for one chair.",
      },
      {
        property: "og:image",
        content: "https://bookzenvo.com/bookzenvo-social-share.png",
      },
    ],
    links: [{ rel: "canonical", href: "https://bookzenvo.com/" }],
  }),
  component: Landing,
});

const steps = [
  [
    "01",
    "Set up your salon",
    "Add your services, prices, hours and team, or bring them across from your old system.",
  ],
  [
    "02",
    "Share one link",
    "Clients choose a time, pay a deposit and get every detail without downloading an app.",
  ],
  [
    "03",
    "Let the day flow",
    "Bookings arrive without clashes, reminders go out and each visit builds the client record.",
  ],
];

const studioFeatures = [
  "Unlimited staff and chair rental",
  "Paperless consultations and patch tests",
  "Verified customer reviews",
  "Stock with photo scanning",
  "Automated reminders and customer portal",
  "AI business co-pilot and page editor",
  "Analytics and insights",
];

function Wordmark({ light = false }: { light?: boolean }) {
  return (
    <span className={`lp-wordmark ${light ? "lp-wordmark-light" : ""}`}>
      Bookzenvo<span>.</span>
    </span>
  );
}

function StartLink({
  children = "Join the waitlist",
  light = false,
}: {
  children?: React.ReactNode;
  light?: boolean;
}) {
  return (
    <Link
      to="/auth"
      search={{ mode: "signup" }}
      className={`lp-button ${light ? "lp-button-light" : "lp-button-primary"}`}
    >
      <span>{children}</span>
      <ArrowRight aria-hidden="true" />
    </Link>
  );
}

function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reveal]"),
    );
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      elements.forEach((element) => element.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14 },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        document.querySelector<HTMLButtonElement>(".lp-menu-button")?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <CookieConsentProvider>
      <div className="landing-page">
        <a className="lp-skip-link" href="#top">
          Skip to content
        </a>
        <header className="lp-header">
          <div className="lp-nav-shell">
            <a href="#top" aria-label="Bookzenvo home" onClick={closeMenu}>
              <Wordmark />
            </a>
            <nav className="lp-desktop-nav" aria-label="Main navigation">
              <a href="#how">How it works</a>
              <a href="#features">Features</a>
              <a href="#switch">Switch</a>
              <a href="#pricing">Pricing</a>
            </nav>
            <div className="lp-nav-actions">
              <Link to="/auth" className="lp-sign-in">
                Sign in
              </Link>
              <StartLink />
              <button
                className="lp-menu-button"
                type="button"
                aria-label={menuOpen ? "Close menu" : "Open menu"}
                aria-expanded={menuOpen}
                aria-controls="landing-mobile-menu"
                onClick={() => setMenuOpen((open) => !open)}
              >
                {menuOpen ? <X /> : <Menu />}
              </button>
            </div>
          </div>
          {menuOpen && (
            <nav
              id="landing-mobile-menu"
              className="lp-mobile-nav"
              aria-label="Mobile navigation"
            >
              <a href="#how" onClick={closeMenu}>
                How it works
              </a>
              <a href="#features" onClick={closeMenu}>
                Features
              </a>
              <a href="#switch" onClick={closeMenu}>
                Switch
              </a>
              <a href="#pricing" onClick={closeMenu}>
                Pricing
              </a>
              <Link to="/auth" onClick={closeMenu}>
                Sign in
              </Link>
            </nav>
          )}
        </header>

        <main id="top">
          <section className="lp-hero">
            <div className="lp-hero-copy">
              <p className="lp-kicker">Built with working salons</p>
              <h1>Your salon, running beautifully.</h1>
              <p className="lp-hero-lede">
                Bookings, payments, client care and daily admin in one calm
                place.
              </p>
              <div className="lp-hero-actions">
                <StartLink />
                <a className="lp-text-link" href="#how">
                  See how it works <ChevronRight aria-hidden="true" />
                </a>
              </div>
              <p className="lp-trust-line">
                Free for one chair. No card. No commission.
              </p>
            </div>
            <div
              className="lp-hero-media"
              aria-label="Bookzenvo calendar preview"
            >
              <div className="lp-product-caption">
                <span>Your day, in one place.</span>
                <span>Demo workspace</span>
              </div>
              <img
                src="/landing/calendar.png"
                alt="Bookzenvo calendar with day, week and month views and daily booking totals in a demo salon"
                width="1440"
                height="1039"
                fetchPriority="high"
              />
            </div>
          </section>

          <section
            className="lp-for-strip"
            aria-label="Businesses Bookzenvo is made for"
          >
            <p>Made for</p>
            <ul>
              <li>Hair salons</li>
              <li>Barbershops</li>
              <li>Nail studios</li>
              <li>Tattoo artists</li>
              <li>Lash and brow</li>
              <li>Chair renters</li>
            </ul>
          </section>

          <section id="how" className="lp-section lp-how" data-reveal>
            <div className="lp-section-heading">
              <p className="lp-kicker">Simple from day one</p>
              <h2>Ready for your next chapter.</h2>
              <p>
                Bookzenvo feels familiar quickly, whether you are starting fresh
                or moving an established salon.
              </p>
            </div>
            <ol className="lp-steps">
              {steps.map(([number, title, body]) => (
                <li key={number}>
                  <span className="lp-step-number">{number}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </div>
                  <ChevronRight aria-hidden="true" />
                </li>
              ))}
            </ol>
          </section>

          <section id="features" className="lp-section lp-features" data-reveal>
            <div className="lp-section-heading lp-section-heading-wide">
              <h2>One thoughtful system for the whole salon.</h2>
              <p>
                Every part works together, so you spend less time copying
                details between apps and chasing clients.
              </p>
            </div>
            <div className="lp-bento">
              <article className="lp-feature-card lp-feature-calendar">
                <div className="lp-icon">
                  <CalendarCheck aria-hidden="true" />
                </div>
                <h3>A diary that protects your time.</h3>
                <p>
                  Online booking, deposits, reminders and no-clash scheduling
                  work together automatically.
                </p>
                <div className="lp-feature-note">
                  <span>Bookings</span>
                  <span>Reminders</span>
                  <span>Deposits</span>
                </div>
              </article>
              <article className="lp-feature-card lp-feature-photo">
                <img
                  src="/landing/page-builder.png"
                  alt="Bookzenvo page builder showing colour presets alongside the live booking-page preview in a demo salon"
                  width="1440"
                  height="1000"
                  loading="lazy"
                />
                <div>
                  <Sparkles aria-hidden="true" />
                  <h3>A page that feels like your salon.</h3>
                  <p>
                    Choose a starting look, make it yours and preview every
                    change before publishing.
                  </p>
                </div>
              </article>
              <article className="lp-feature-card lp-feature-forms">
                <div className="lp-icon">
                  <ShieldCheck aria-hidden="true" />
                </div>
                <h3>Consultations without the folders.</h3>
                <p>
                  Create forms, capture signatures and keep patch-test records
                  with the client history.
                </p>
                <ul>
                  <li>
                    <Check /> Custom forms
                  </li>
                  <li>
                    <Check /> Digital signatures
                  </li>
                  <li>
                    <Check /> Patch-test records
                  </li>
                </ul>
              </article>
              <article className="lp-feature-card lp-feature-ai">
                <div className="lp-icon">
                  <Sparkles aria-hidden="true" />
                </div>
                <h3>AI that removes admin.</h3>
                <p>
                  Scan stock from a shelf photo, improve your booking page and
                  turn real salon data into useful next steps.
                </p>
              </article>
              <article className="lp-feature-card lp-feature-money">
                <div className="lp-icon">
                  <CreditCard aria-hidden="true" />
                </div>
                <h3>Money handled clearly.</h3>
                <p>
                  Take deposits or full payment, collect balances and track
                  refunds safely through Stripe.
                </p>
              </article>
              <article className="lp-feature-card lp-feature-clients">
                <div className="lp-icon">
                  <MessageCircleMore aria-hidden="true" />
                </div>
                <h3>Client care that continues after the visit.</h3>
                <p>
                  Keep history, notes and consent together, then send relevant
                  follow-ups and verified review requests.
                </p>
              </article>
            </div>
          </section>

          <section id="switch" className="lp-switch" data-reveal>
            <div className="lp-switch-image">
              <p className="lp-switch-label">
                A fresh start. A familiar salon.
              </p>
              <h3>
                Your clients.
                <br />
                Your team.
                <br />
                Your history.
              </h3>
              <p>Bring the details that matter. Make the day-to-day simpler.</p>
            </div>
            <div className="lp-switch-copy">
              <h2>Bring your salon with you.</h2>
              <p>
                Moving from Fresha, Square, Vagaro or Booksy should not mean
                starting again.
              </p>
              <ul>
                <li>
                  <Check /> Import staff, clients, services and history
                </li>
                <li>
                  <Check /> One flat price, however many chairs
                </li>
                <li>
                  <Check /> No commission on your own clients
                </li>
                <li>
                  <Check /> Export your client list whenever you want
                </li>
              </ul>
              <StartLink light>Start your move</StartLink>
            </div>
          </section>

          <section id="pricing" className="lp-section lp-pricing" data-reveal>
            <div className="lp-section-heading">
              <p className="lp-kicker">Straightforward pricing</p>
              <h2>Start free. Grow when your salon does.</h2>
              <p>No commission, no per-staff surprises and no lock-in.</p>
            </div>
            <div className="lp-price-layout">
              <article className="lp-price-card">
                <div className="lp-price-top">
                  <div>
                    <h3>Solo</h3>
                    <p>For one independent chair</p>
                  </div>
                  <strong>Free</strong>
                </div>
                <ul>
                  <li>
                    <Check /> One staff member
                  </li>
                  <li>
                    <Check /> Unlimited bookings
                  </li>
                  <li>
                    <Check /> Branded booking page
                  </li>
                  <li>
                    <Check /> Deposits and online payments
                  </li>
                  <li>
                    <Check /> Confirmation emails and client book
                  </li>
                  <li>
                    <Check /> Import from your old system
                  </li>
                </ul>
                <StartLink />
              </article>
              <article className="lp-price-card lp-price-card-featured">
                <div className="lp-popular">For the whole team</div>
                <div className="lp-price-top">
                  <div>
                    <h3>Studio</h3>
                    <p>For a growing salon team</p>
                  </div>
                  <strong>
                    £22<span>/month</span>
                  </strong>
                </div>
                <p className="lp-includes">Everything in Solo, plus</p>
                <ul>
                  {studioFeatures.map((feature) => (
                    <li key={feature}>
                      <Check /> {feature}
                    </li>
                  ))}
                </ul>
                <StartLink light />
              </article>
            </div>
            <p className="lp-payment-note">
              Stripe charges its standard card-processing rate. Bookzenvo takes
              nothing on top.
            </p>
          </section>

          <section className="lp-final-cta" data-reveal>
            <div>
              <p className="lp-kicker">Your next client is looking</p>
              <h2>Give them a calmer way to book.</h2>
              <p>Free for one chair, no card needed and nothing to install.</p>
            </div>
            <StartLink light />
          </section>
        </main>

        <footer className="lp-footer">
          <div className="lp-footer-top">
            <Wordmark />
            <p>Booking software built around the way salons really work.</p>
          </div>
          <div className="lp-footer-bottom">
            <p>© {new Date().getFullYear()} Bookzenvo.</p>
            <nav aria-label="Legal and support">
              <Link to="/privacy">Privacy</Link>
              <Link to="/terms">Terms</Link>
              <Link to="/cookie-policy">Cookies</Link>
              <Link to="/refund-policy">Refunds</Link>
              <Link to="/faq">FAQ</Link>
              <a href="mailto:help@bookzenvo.com">Contact</a>
              <Link to="/help">Help Centre</Link>
              <Link to="/status">Status</Link>
              <CookieSettingsFooterLink />
            </nav>
          </div>
        </footer>
      </div>
      <CookieConsentBanner />
    </CookieConsentProvider>
  );
}
