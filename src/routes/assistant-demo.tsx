import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  ClipboardList,
  Copy,
  CreditCard,
  RotateCcw,
  Sparkles,
  Star,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";

export const Route = createFileRoute("/assistant-demo")({
  head: () => ({
    meta: [
      { title: "Assistant demo · Bookzenvo" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AssistantDemo,
});

type Example = {
  icon: LucideIcon;
  title: string;
  description: string;
  question: string;
  answer: string;
};

const examples: Example[] = [
  {
    icon: ClipboardList,
    title: "Plan my day",
    description: "See what needs attention first",
    question: "What should I deal with first today?",
    answer:
      "Start with the 10:30 booking for Alex Example: it is still pending confirmation. Then review the £15 recorded balance on Morgan Example’s completed appointment.\n\nThese are examples from a fictional salon. In your real workspace, open each booking to verify the details before acting.",
  },
  {
    icon: CreditCard,
    title: "Check payments",
    description: "Know what is owed and what arrived",
    question: "Do I have any payment issues today?",
    answer:
      "One example appointment has a recorded £15 balance. That is not proof of a failed Stripe charge. Check the booking and the Payments page before contacting the customer.\n\nThe fictional Stripe ledger shows £85 in succeeded charges and £20 in refunds over the last 30 days: £65 net. This is not total salon revenue because cash and other offline payments are excluded.",
  },
  {
    icon: TrendingUp,
    title: "Spot service trends",
    description: "Turn bookings into useful decisions",
    question: "What services have been popular?",
    answer:
      "In this complete fictional 30-day sample, Cut & finish was booked 18 times and Colour consultation 9 times.\n\nConsider whether your busiest Cut & finish times need more staff cover. Check the Calendar before changing availability: bookings alone do not show which slots were open.",
  },
  {
    icon: Sparkles,
    title: "Draft a follow-up",
    description: "Get wording you can review and copy",
    question: "Write a friendly follow-up after a visit.",
    answer:
      "Subject: Lovely to see you\n\nHi [first name],\n\nThank you for visiting us. We hope you enjoyed your appointment. If you have any questions, just reply and we’ll be happy to help.\n\nSee you again soon,\n[Salon name]\n\nThis is only a draft. Nothing has been sent; check the details and messaging consent before using it.",
  },
  {
    icon: CalendarDays,
    title: "Fill an open slot",
    description: "Prepare a post for real availability",
    question: "How could I fill a quiet slot this week?",
    answer:
      "In this fictional example, a Cut & finish slot with Jordan Example is bookable on Thursday at 11:00.\n\nDraft post: A little time for you this Thursday. We have one Cut & finish appointment at 11:00. Book through our page if it suits you.\n\nNothing has been posted. In the real assistant, recheck Calendar before sharing because availability can change.",
  },
  {
    icon: RotateCcw,
    title: "Bring clients back",
    description: "Suggest an eligible return visit",
    question: "Who might be ready to book again?",
    answer:
      "In this fictional example, Jamie Example is due for a return Cut & finish and has no future booking. A booking-origin email permission is recorded in the example data.\n\nDraft: Hi Jamie, it was lovely to see you. If you're ready for your next visit, you can choose a time through our booking page.\n\nThis draft has not been sent. Recheck the booking and current email permission before contacting anyone. Imported contacts are not assumed eligible.",
  },
  {
    icon: Star,
    title: "Grow genuine reviews",
    description: "Turn good visits into trust",
    question: "How can we get more genuine reviews?",
    answer:
      "Bookzenvo can ask customers for an honest review after a completed visit. Check that review requests are enabled in Page Builder, and make it easy for people to find your booking link on Google.\n\nDo not offer a reward for a Google review or ask only happy customers. This is guidance; the demo has not contacted anyone or changed your settings.",
  },
];

function AssistantDemo() {
  const [selected, setSelected] = useState(0);
  const [mode, setMode] = useState<"today" | "grow">("today");
  const [copied, setCopied] = useState(false);
  const example = examples[selected];

  const copyAnswer = async () => {
    try {
      await navigator.clipboard.writeText(example.answer);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <main className="workspace-theme min-h-screen bg-background text-foreground">
      <header className="border-b bg-card/90">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link to="/" aria-label="Bookzenvo home">
            <Wordmark className="text-xl" dotClassName="text-primary" />
          </Link>
          <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-[color:var(--gold-deep)]">
            Fictional preview
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-[1180px] px-5 py-8 sm:px-8 md:py-12">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--gold-deep)]">
            Your assistant · demo
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Make the next move easier.
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            Explore what the improved assistant looks like. Choose a task to see
            an example answer and the actions it points you towards.
          </p>
        </div>

        <div
          className="mt-8 inline-flex rounded-xl border bg-card p-1"
          role="group"
          aria-label="Assistant focus"
        >
          <button
            type="button"
            aria-pressed={mode === "today"}
            onClick={() => {
              setMode("today");
              setSelected(0);
              setCopied(false);
            }}
            className={`rounded-lg px-5 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${mode === "today" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Run the day
          </button>
          <button
            type="button"
            aria-pressed={mode === "grow"}
            onClick={() => {
              setMode("grow");
              setSelected(4);
              setCopied(false);
            }}
            className={`rounded-lg px-5 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${mode === "grow" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Grow the salon
          </button>
        </div>

        <div className="mt-5 rounded-2xl border bg-card p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--gold-deep)]">
                A good place to start
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
                {mode === "today"
                  ? "Get a clear plan for today"
                  : "Put a real opportunity to work"}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {mode === "today"
                  ? "See what needs attention, then open the booking or record to handle it."
                  : "Find a bookable time you can share, with a draft you can check before posting."}
              </p>
            </div>
            <Button
              type="button"
              size="lg"
              onClick={() => {
                setSelected(mode === "today" ? 0 : 4);
                setCopied(false);
              }}
              className="shrink-0"
            >
              {mode === "today" ? "Plan my day" : "Find an open slot"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
          <div className="mt-5 grid gap-2 border-t pt-4 sm:grid-cols-2 lg:grid-cols-3">
            {(mode === "today" ? examples.slice(1, 4) : examples.slice(5)).map(
              (item) => {
                const index = examples.indexOf(item);
                const Icon = item.icon;
                return (
                  <button
                    key={item.title}
                    type="button"
                    aria-pressed={selected === index}
                    onClick={() => {
                      setSelected(index);
                      setCopied(false);
                    }}
                    className={`flex items-start gap-3 rounded-xl px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected === index ? "bg-primary/10" : "hover:bg-secondary/60"}`}
                  >
                    <Icon
                      className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--gold-deep)]"
                      aria-hidden="true"
                    />
                    <span>
                      <span className="block text-sm font-semibold">
                        {item.title}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                        {item.description}
                      </span>
                    </span>
                  </button>
                );
              },
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section
            className="min-w-0 rounded-2xl border bg-card p-5 sm:p-7"
            aria-label="Example conversation"
          >
            <div className="flex items-center justify-between gap-3 border-b pb-4">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-[color:var(--gold-deep)]">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold">Bookzenvo assistant</h2>
                  <p className="text-xs text-muted-foreground">
                    Example conversation
                  </p>
                </div>
              </div>
              <span className="text-xs font-medium text-muted-foreground">
                {mode === "today" ? "Daily work" : "More bookings"}
              </span>
            </div>
            <div className="mt-6 flex justify-end">
              <p className="max-w-[85%] rounded-2xl bg-primary px-4 py-3 text-sm text-primary-foreground">
                {example.question}
              </p>
            </div>
            <div className="mt-5 flex gap-3">
              <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-[color:var(--gold-deep)]">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1 rounded-2xl border bg-background p-4 text-sm leading-relaxed">
                <p className="whitespace-pre-wrap">{example.answer}</p>
                <button
                  type="button"
                  onClick={() => void copyAnswer()}
                  className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  {copied ? "Copied" : "Copy answer"}
                </button>
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            {mode === "today" && (
              <section className="rounded-2xl border bg-card p-5">
                <h2 className="text-base font-semibold">Needs a look</h2>
                <div className="mt-3 divide-y text-sm">
                  <div className="py-3 first:pt-0">
                    <p className="font-medium">Booking awaiting confirmation</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Alex Example · 10:30
                    </p>
                    <p className="mt-2 text-xs font-semibold text-[color:var(--gold-deep)]">
                      Open booking <ArrowRight className="inline h-3 w-3" />
                    </p>
                  </div>
                  <div className="py-3">
                    <p className="font-medium">Balance to review</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Morgan Example · £15 recorded
                    </p>
                    <p className="mt-2 text-xs font-semibold text-[color:var(--gold-deep)]">
                      Open booking <ArrowRight className="inline h-3 w-3" />
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Examples only; these links are inactive in the demo.
                </p>
              </section>
            )}
            <section className="rounded-2xl border bg-card p-5">
              <h2 className="text-base font-semibold">Go straight to it</h2>
              <div className="mt-3 space-y-2 text-sm">
                <p className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />{" "}
                  Check availability
                </p>
                <p className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-muted-foreground" />{" "}
                  Review bookings
                </p>
                <p className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground" /> See
                  payment records
                </p>
              </div>
            </section>
          </aside>
        </div>

        <div className="mt-6 rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm leading-relaxed text-muted-foreground">
          This preview is scripted with fictional data. It does not sign you in,
          access salon records, contact an AI model, or send messages. The real
          assistant uses current workspace facts once local sign-in is running.
        </div>
        <Button asChild variant="outline" className="mt-5">
          <Link to="/auth">Back to sign in</Link>
        </Button>
      </div>
    </main>
  );
}
