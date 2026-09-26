import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarCheck,
  Camera,
  Check,
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
import { Wordmark } from "@/components/wordmark";
import "../landing.css";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title: "Bookzenvo · Be ready for every salon visit",
      },
      {
        name: "description",
        content:
          "A colour booking is only the start. Keep consultations, patch-test records, payments and rebooking connected in Bookzenvo. Join the waitlist.",
      },
      {
        property: "og:title",
        content: "Bookzenvo · Be ready for every salon visit",
      },
      {
        property: "og:description",
        content:
          "See how Bookzenvo helps a salon prepare for a colour appointment, look after the visit and welcome the client back.",
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
    "Before the visit",
    "Prepare with the booking",
    "Check the consultation and patch-test record before a new colour client arrives.",
  ],
  [
    "In the salon",
    "Keep the visit moving",
    "Open the client details your team needs, then take payment without losing track of the appointment.",
  ],
  [
    "After the visit",
    "Make the next one easier",
    "Keep the visit on the client record and help them book their next appointment.",
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

function StartLink({
  children = "Join the waitlist",
  light = false,
}: {
  children?: React.ReactNode;
  light?: boolean;
}) {
  return (
    <a
      href="#waitlist"
      className={`lp-button ${light ? "lp-button-light" : "lp-button-primary"}`}
    >
      <span>{children}</span>
      <ArrowRight aria-hidden="true" />
    </a>
  );
}

function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(
          result.message === "Too many requests"
            ? "Please wait a moment and try again."
            : "We couldn't add you just now. Please try again.",
        );
      }
      setDone(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "We couldn't add you just now. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      id="waitlist"
      className="lp-waitlist"
      aria-label="Join the Bookzenvo waitlist"
    >
      {done ? (
        <p className="lp-waitlist-success" role="status">
          <Check aria-hidden="true" /> You're on the list. We'll email you when
          Bookzenvo launches.
        </p>
      ) : (
        <form onSubmit={submit}>
          <label htmlFor="landing-waitlist-email">Get launch updates</label>
          <div className="lp-waitlist-controls">
            <input
              id="landing-waitlist-email"
              type="email"
              name="email"
              autoComplete="email"
              required
              maxLength={254}
              placeholder="you@salon.com"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setError("");
              }}
              aria-describedby={
                error ? "landing-waitlist-error" : "landing-waitlist-note"
              }
              aria-invalid={Boolean(error)}
            />
            <button type="submit" disabled={busy}>
              {busy ? "Joining…" : "Join the waitlist"}
              {!busy && <ArrowRight aria-hidden="true" />}
            </button>
          </div>
          {error && (
            <p
              id="landing-waitlist-error"
              className="lp-waitlist-error"
              role="alert"
            >
              {error}
            </p>
          )}
          <p id="landing-waitlist-note" className="lp-waitlist-note">
            By joining, you ask us to contact you about Bookzenvo and
            acknowledge our <Link to="/privacy">Privacy Policy</Link>. This is
            not consent to unrelated marketing.
          </p>
        </form>
      )}
    </div>
  );
}

function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeLook, setActiveLook] = useState(0);
  const looks = [
    {
      name: "Champagne",
      background: "#f4eee3",
      ink: "#393025",
      accent: "#86683e",
    },
    { name: "Ink", background: "#242424", ink: "#f6f2ec", accent: "#d0b280" },
    { name: "Rose", background: "#f5e9e9", ink: "#532f3a", accent: "#955469" },
  ];

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
              <a href="#waitlist" onClick={closeMenu}>
                Join the waitlist
              </a>
            </nav>
          )}
        </header>

        <main id="top" tabIndex={-1}>
          <section className="lp-hero">
            <div className="lp-hero-copy">
              <p className="lp-kicker lp-hero-label">
                For appointments that need more than a time slot
              </p>
              <h1>
                The colour client
                <br />
                <span>is booked. Now what?</span>
              </h1>
              <p className="lp-hero-lede">
                Check the consultation and patch-test record before they arrive.
                Keep the visit connected through payment and rebooking.
              </p>
              <div className="lp-hero-actions">
                <a className="lp-text-link" href="#how">
                  Follow the appointment <ArrowRight aria-hidden="true" />
                </a>
              </div>
              <WaitlistForm />
            </div>
            <figure className="lp-hero-product">
              <div className="lp-hero-product-image">
                <img
                  src="/landing/consultation-workflow.png"
                  alt="Bookzenvo's consultation form editor with questions about allergies and previous reactions"
                  width="1536"
                  height="1840"
                  fetchPriority="high"
                />
              </div>
              <figcaption>
                <span>Inside Bookzenvo</span>
                <strong>Build the consultation your team needs.</strong>
                <a
                  href="/landing/consultation-workflow.png"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View full screenshot <ArrowRight aria-hidden="true" />
                </a>
              </figcaption>
            </figure>
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
              <h2>One appointment. No scattered details.</h2>
              <p>
                A new colour client is a good example. The booking is only the
                beginning of the work.
              </p>
            </div>
            <ol className="lp-steps">
              {steps.map(([moment, title, body]) => (
                <li key={moment}>
                  <span className="lp-step-number">{moment}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section id="features" className="lp-section lp-features">
            <div className="lp-section-heading lp-feature-heading">
              <h2>
                All the moving parts.
                <br />
                <span>Finally, together.</span>
              </h2>
              <p>
                From the first booking to the next visit, the details stay
                connected.
              </p>
            </div>
            <div className="lp-feature-grid">
              {[
                {
                  icon: CalendarCheck,
                  title: "A diary you can depend on",
                  body: "Online bookings, no-clash scheduling and reminders, with deposits to help protect your time.",
                  detail: "Booking & scheduling",
                },
                {
                  icon: ShieldCheck,
                  title: "Client care, without the folders",
                  body: "Consultations, signatures and patch-test records live alongside your client history.",
                  detail: "Consultations & records",
                },
                {
                  icon: CreditCard,
                  title: "Keep the money clear",
                  body: "Take deposits, collect balances and track refunds through Stripe.",
                  detail: "Payments & refunds",
                },
                {
                  icon: MessageCircleMore,
                  title: "Keep the connection going",
                  body: "Follow-ups and verified review requests help you stay connected after the appointment.",
                  detail: "Client relationships",
                },
                {
                  icon: Camera,
                  title: "Turn a shelf photo into a stock list",
                  body: "Photograph your products and let AI identify them. Review the results before adding them to your stock.",
                  detail: "Photo stock scanning · Studio",
                },
                {
                  icon: Sparkles,
                  title: "A helping hand with the admin",
                  body: "Ask AI to edit your booking page and explore useful insights from your salon data.",
                  detail: "AI tools · Studio",
                },
              ].map(({ icon: Icon, title, body, detail }) => (
                <article key={title} className="lp-feature-row">
                  <Icon aria-hidden="true" />
                  <div>
                    <p className="lp-feature-category">{detail}</p>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </div>
                </article>
              ))}
            </div>
            <div className="lp-design-feature">
              <div className="lp-design-copy">
                <p className="lp-feature-category">Your booking page</p>
                <h3>
                  Your salon.
                  <br />
                  Your signature.
                </h3>
                <p>
                  Make the first impression yours. Choose your colours, add your
                  services and bring your page to life.
                </p>
                <div
                  className="lp-look-options"
                  aria-label="Try a colour palette"
                >
                  {looks.map((look, index) => (
                    <button
                      type="button"
                      key={look.name}
                      aria-pressed={activeLook === index}
                      onClick={() => setActiveLook(index)}
                    >
                      <span
                        style={{ background: look.accent }}
                        aria-hidden="true"
                      />
                      {look.name}
                    </button>
                  ))}
                </div>
                <p className="lp-look-hint">
                  Try a colour. See the difference.
                </p>
              </div>
              <div
                className="lp-colour-specimen"
                style={{
                  background: looks[activeLook].background,
                  color: looks[activeLook].ink,
                }}
                aria-label={looks[activeLook].name + " colour preview"}
              >
                <div className="lp-specimen-top">
                  <span>Your salon</span>
                  <span>Colour preview</span>
                </div>
                <div className="lp-specimen-title">
                  A little time.
                  <br />
                  <span style={{ color: looks[activeLook].accent }}>
                    Just for you.
                  </span>
                </div>
                <div className="lp-specimen-bottom">
                  <span>Made personal.</span>
                  <span
                    style={{ background: looks[activeLook].accent }}
                    aria-hidden="true"
                  />
                </div>
              </div>
            </div>
          </section>

          <section id="switch" className="lp-switch">
            <div className="lp-switch-copy">
              <p className="lp-switch-label">Make your next move</p>
              <h2>
                Keep your salon's history.
                <br />
                <span>Change the software.</span>
              </h2>
              <p>
                Bring over clients, team, services and booking history. Review
                your import before you start taking bookings in Bookzenvo.
              </p>
              <StartLink light>Join the waitlist</StartLink>
            </div>
            <div className="lp-move-guide">
              <div className="lp-move-heading">
                <span>Your move to Bookzenvo</span>
                <ArrowRight aria-hidden="true" />
              </div>
              <ol>
                <li>
                  <span className="lp-move-number">01</span>
                  <div>
                    <h3>Bring your data</h3>
                    <p>Export your records from your current booking system.</p>
                  </div>
                </li>
                <li>
                  <span className="lp-move-number">02</span>
                  <div>
                    <h3>Review your import</h3>
                    <p>
                      Upload your file and check the details before importing.
                    </p>
                  </div>
                </li>
                <li>
                  <span className="lp-move-number">03</span>
                  <div>
                    <h3>Make yourself at home</h3>
                    <p>
                      Set up your page, check your services and get ready to
                      take bookings.
                    </p>
                  </div>
                </li>
              </ol>
              <div className="lp-move-data">
                <span>Clients</span>
                <span>Team</span>
                <span>Services</span>
                <span>History</span>
              </div>
            </div>
            <div className="lp-switch-footer">
              <span>
                <Check aria-hidden="true" /> Your client list stays yours
              </span>
              <span>
                <Check aria-hidden="true" /> Export whenever you need
              </span>
              <a href="#pricing">
                See the plans <ArrowRight aria-hidden="true" />
              </a>
            </div>
          </section>

          <section id="pricing" className="lp-section lp-pricing" data-reveal>
            <div className="lp-section-heading">
              <p className="lp-kicker">Planned launch pricing</p>
              <h2>A free start. Room to grow.</h2>
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
                    <p>Unlimited staff, one flat price</p>
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
              <p className="lp-kicker">Ready when you are</p>
              <h2>
                Your salon deserves
                <br />a better working day.
              </h2>
              <p>Be first to hear when Bookzenvo launches.</p>
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
