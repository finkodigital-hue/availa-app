import { createFileRoute, Link } from "@tanstack/react-router";
import "../marketing.css";
import { Wordmark } from "@/components/wordmark";

const QUESTIONS = [
  [
    "Is Bookzenvo really free?",
    "Our planned launch pricing has a free Solo plan with one staff member, unlimited bookings, manual page editing, payments, refunds, confirmations, one-tap booking links, the client book, import/export and support. Studio is planned at £22 per month and adds unlimited staff, reminders, analytics, AI, consultation forms, verified reviews, stock, the customer portal and rent tracking. Final availability will be confirmed before launch.",
  ],
  [
    "Can my clients book online?",
    "Yes. Every business gets a shareable booking link. Clients can choose a service, team member and available time. Studio adds a customer portal; on every plan, confirmation emails still include one-tap links to confirm, cancel or reschedule.",
  ],
  [
    "Can I take deposits and payments?",
    "Yes. Connect Stripe from Settings > Payments, then choose whether bookings take no online payment, a deposit, or the full amount. Card details are handled by Stripe, not Bookzenvo.",
  ],
  [
    "Do I need a card reader or other hardware to take payments?",
    "Not for online payments. Customers can pay through Stripe Checkout or a payment link on their phone, tablet or laptop. Bookzenvo does not currently connect to a physical card reader or support in-salon Tap to Pay, so card-machine payments will not update a booking automatically.",
  ],
  [
    "Can I add more staff?",
    "Solo includes one staff member. Studio includes unlimited staff, each with their own availability, services and diary.",
  ],
  [
    "Can I move from another booking system?",
    "Yes. The import tool supports files from most booking systems and lets you match columns manually if the file is not recognised.",
  ],
  [
    "Can clients cancel or reschedule?",
    "On Studio, clients can manage eligible bookings from their portal. On every plan they can use the one-tap links in their confirmation email. You control your cancellation policy and can still manage any booking directly from your dashboard.",
  ],
  [
    "Will Bookzenvo block dates on my calendar automatically?",
    "No. Every block on your calendar — holidays, time off, breaks — is one you create yourself. Bookzenvo never assumes a date is closed and never blocks time on your behalf.",
  ],
  [
    "Is support only for paying customers?",
    "No. Support is available on every plan, including the free Solo plan. Getting help from us is never behind a paywall.",
  ],
  [
    "Is my data safe?",
    "Bookzenvo uses secure account access, verification and platform safeguards. Payment information is processed by Stripe. Read our Privacy Policy for more detail.",
  ],
];

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "Frequently asked questions · Bookzenvo" },
      {
        name: "description",
        content: "Answers to common Bookzenvo questions.",
      },
    ],
    links: [{ rel: "canonical", href: "https://bookzenvo.com/faq" }],
  }),
  component: FaqPage,
});

function FaqPage() {
  return (
    <div className="mkt-page min-h-screen bg-background text-foreground font-sans">
      <header className="border-b border-border">
        <div className="max-w-[860px] mx-auto px-6 h-20 flex items-center justify-between">
          <Link to="/">
            <Wordmark
              className="text-[1.5rem]"
              dotClassName="text-[color:var(--gold-deep)]"
            />
          </Link>
          <Link
            to="/"
            className="text-[.9rem] font-medium text-muted-foreground hover:text-foreground"
          >
            Back to home
          </Link>
        </div>
      </header>
      <main className="max-w-[760px] mx-auto px-6 py-16 md:py-20">
        <p className="text-[.7rem] font-semibold tracking-[0.16em] uppercase text-[color:var(--gold-deep)] mb-4">
          Help with Bookzenvo
        </p>
        <h1 className="text-[clamp(2.5rem,5vw,4rem)] leading-[0.98] tracking-tight">
          Frequently asked questions
        </h1>
        <p className="mt-5 text-[1rem] leading-7 text-muted-foreground max-w-[60ch]">
          Quick answers about booking, payments, plans and getting started.
        </p>
        <div className="mt-12 divide-y divide-border rounded-xl border border-border bg-white">
          {QUESTIONS.map(([question, answer]) => (
            <details key={question} className="group px-6 py-5">
              <summary className="cursor-pointer list-none pr-8 text-[1.25rem] leading-tight marker:content-none relative">
                {question}
                <span className="absolute right-0 top-0 font-sans text-xl text-[color:var(--gold-deep)] transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="pt-3 text-[.94rem] leading-7 text-muted-foreground">
                {answer}
              </p>
            </details>
          ))}
        </div>
        <div className="mt-10 rounded-xl border border-border px-6 py-6">
          <h2 className="text-[1.4rem]">Still need a hand?</h2>
          <p className="mt-2 text-[.92rem] leading-6 text-muted-foreground">
            Visit the Help Centre for guides or to contact support.
          </p>
          <Link
            to="/help"
            className="inline-flex mt-4 text-[.9rem] font-semibold underline underline-offset-4 hover:text-[color:var(--gold-deep)]"
          >
            Go to Help Centre
          </Link>
        </div>
      </main>
    </div>
  );
}
