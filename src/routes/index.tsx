import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarCheck,
  Camera,
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

const stories = [
  {
    label: "Get booked",
    title: "Your next booking.\nAlready taken care of.",
    description:
      "A booking page that feels like your salon. Clients choose their service, find a time and pay their deposit.",
    icon: CalendarCheck,
    items: [
      "Your own booking link",
      "Deposits at checkout",
      "Automatic confirmations",
    ],
    foot: "A smoother first impression, before they walk in.",
  },
  {
    label: "Care for clients",
    title: "Know the client.\nSkip the paperwork.",
    description:
      "Keep consultation forms, signatures, patch-test records and visit history together, ready when you need them.",
    icon: ShieldCheck,
    items: [
      "Digital consultation forms",
      "Patch-test records",
      "Client notes and history",
    ],
    foot: "More personal care. Less searching for the details.",
  },
  {
    label: "Get paid",
    title: "From deposit\nto the final balance.",
    description:
      "Manage online payments and refunds through Stripe, with a clear record of each charge.",
    icon: CreditCard,
    items: ["Deposit or full payment", "Remaining balances", "Tracked refunds"],
    foot: "Keep the appointment and the payment connected.",
  },
  {
    label: "Keep growing",
    title: "A little less admin.\nA little more possibility.",
    description:
      "Use practical AI to edit your page, scan stock from a photo and explore what your salon data is telling you.",
    icon: Sparkles,
    items: ["AI page editing", "Stock photo scanning", "Business insights"],
    foot: "Useful help with the jobs that take you away from clients.",
  },
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
  const [activeStory, setActiveStory] = useState(0);
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
            </nav>
          )}
        </header>

        <main id="top" tabIndex={-1}>
          <section className="lp-hero">
            <div className="lp-hero-copy">
              <p className="lp-kicker lp-hero-label">
                Salon software, made simple
              </p>
              <h1>
                Your salon.
                <br />
                <span>All in one place.</span>
              </h1>
              <p className="lp-hero-lede">
                Bookings, payments and client care, beautifully together. Make
                more room for the work you love.
              </p>
              <div className="lp-hero-actions">
                <StartLink />
                <a className="lp-text-link" href="#features">
                  Explore Bookzenvo <ArrowRight aria-hidden="true" />
                </a>
              </div>
              <div className="lp-hero-assurance">
                <span>
                  <Check aria-hidden="true" /> Free for one chair
                </span>
                <span>
                  <Check aria-hidden="true" /> No commission
                </span>
              </div>
            </div>
            <div className="lp-story">
              <div className="lp-story-heading">
                <Wordmark />
                <span>One salon. One place.</span>
              </div>
              <div
                className="lp-story-options"
                aria-label="Explore what Bookzenvo does"
              >
                {stories.map((story, index) => (
                  <button
                    type="button"
                    key={story.label}
                    aria-pressed={activeStory === index}
                    onClick={() => setActiveStory(index)}
                  >
                    {story.label}
                  </button>
                ))}
              </div>
              <div
                className="lp-story-body"
                key={activeStory}
                aria-live="polite"
              >
                <div className="lp-story-icon">
                  {(() => {
                    const Icon = stories[activeStory].icon;
                    return <Icon aria-hidden="true" />;
                  })()}
                </div>
                <h2>{stories[activeStory].title}</h2>
                <p>{stories[activeStory].description}</p>
                <ul>
                  {stories[activeStory].items.map((item) => (
                    <li key={item}>
                      <Check aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="lp-story-footer">
                <span>{stories[activeStory].foot}</span>
                <span aria-hidden="true">0{activeStory + 1} / 04</span>
              </div>
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
                A fresh start.
                <br />
                <span>Same salon. More possibility.</span>
              </h2>
              <p>
                Bring your clients, team, services and booking history into
                Bookzenvo. Keep what matters, and make the everyday easier.
              </p>
              <StartLink light>Join the waitlist</StartLink>
              <p className="lp-switch-note">
                Moving from another system? Start with your data export.
              </p>
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
              <p className="lp-kicker">Make room for what you love</p>
              <h2>
                Your salon deserves
                <br />a better working day.
              </h2>
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
