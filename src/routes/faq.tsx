import { createFileRoute, Link } from "@tanstack/react-router";

const QUESTIONS = [
  [
    "Is Bookzenvo really free?",
    "Yes. Solo is free for one staff member and includes unlimited bookings, a branded booking page, a client book, deposits and online payments. Studio is £22 per month and adds unlimited staff plus the AI tools.",
  ],
  [
    "Can my clients book online?",
    "Yes. Every business gets a shareable booking link. Clients can choose a service, team member and available time, then manage their booking from their client account.",
  ],
  [
    "Can I take deposits and payments?",
    "Yes. Connect Stripe from Settings > Payments, then choose whether bookings take no online payment, a deposit, or the full amount. Card details are handled by Stripe, not Bookzenvo.",
  ],
  [
    "Do I need a card reader or other hardware to take payments?",
    "No. Payments run through Stripe on whatever device you already have — phone, tablet or laptop. No proprietary hardware to buy or carry around.",
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
    "Clients can manage eligible bookings from their client account. You control your cancellation policy and can still manage any booking directly from your dashboard.",
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
      { title: "Frequently Asked Questions — Bookzenvo" },
      { name: "description", content: "Answers to common Bookzenvo questions." },
    ],
  }),
  component: FaqPage,
});

function FaqPage() {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <header className="border-b border-border">
        <div className="max-w-[860px] mx-auto px-6 h-20 flex items-center justify-between">
          <Link to="/" className="font-display font-semibold tracking-tight text-[1.5rem]">
            Bookzenvo<span className="text-[color:var(--gold-deep)]">.</span>
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
        <h1 className="font-display font-medium text-[clamp(2.5rem,5vw,4rem)] leading-[0.98] tracking-tight">
          Frequently asked questions
        </h1>
        <p className="mt-5 text-[1rem] leading-7 text-muted-foreground max-w-[60ch]">
          Quick answers about booking, payments, plans and getting started.
        </p>
        <div className="mt-12 divide-y divide-border rounded-xl border border-border bg-white">
          {QUESTIONS.map(([question, answer]) => (
            <details key={question} className="group px-6 py-5">
              <summary className="cursor-pointer list-none pr-8 font-display text-[1.25rem] leading-tight marker:content-none relative">
                {question}
                <span className="absolute right-0 top-0 font-sans text-xl text-[color:var(--gold-deep)] transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="pt-3 text-[.94rem] leading-7 text-muted-foreground">{answer}</p>
            </details>
          ))}
        </div>
        <div className="mt-10 rounded-xl border border-border px-6 py-6">
          <h2 className="font-display text-[1.4rem]">Still need a hand?</h2>
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
