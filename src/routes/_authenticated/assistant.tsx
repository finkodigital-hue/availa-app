import { createFileRoute, Link } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { useQuery } from "@tanstack/react-query";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ClipboardList,
  Copy,
  CreditCard,
  Loader2,
  RotateCcw,
  Send,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { StudioUpgradePanel } from "@/components/studio-upgrade-panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { getDashboardOverview } from "@/lib/dashboard.functions";
import { getServerFnAuthHeaders } from "@/lib/server-fn-auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/assistant")({
  component: AssistantPage,
});

type Quick = {
  icon: LucideIcon;
  label: string;
  description: string;
  prompt: string;
};

const QUICK: Quick[] = [
  {
    icon: ClipboardList,
    label: "Plan my day",
    description: "Know what needs attention first",
    prompt:
      "Use today's verified appointment snapshot to give me a short priority list. Identify pending bookings and payment issues, and say what screen to open for each. Do not treat form counts as treatment clearance.",
  },
  {
    icon: CreditCard,
    label: "Check payments",
    description: "Separate balances from money received",
    prompt:
      "Which appointments in today's snapshot need a payment review? Explain what is recorded as an appointment balance versus a confirmed Stripe payment. Give me the next steps in Bookings or Payments.",
  },
  {
    icon: TrendingUp,
    label: "Spot service trends",
    description: "See what clients booked recently",
    prompt:
      "Which services were booked most in the last 30 days? Only use a complete snapshot, and explain any limits. Suggest two practical menu or staffing decisions supported by the numbers.",
  },
  {
    icon: Sparkles,
    label: "Draft a follow-up",
    description: "Get copy you can review and send",
    prompt:
      "Draft a short, friendly one-to-one follow-up after a salon visit that I can personalise and copy. Include a subject line for email. Do not invent treatment details or say it has been sent.",
  },
];

function AssistantPage() {
  const {
    data: business,
    isLoading: businessLoading,
    isError,
  } = useMyBusiness();
  const [token, setToken] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setToken(data.session?.access_token ?? null);
        setSessionReady(true);
      })
      .catch(() => {
        if (mounted) setSessionReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (businessLoading || !sessionReady) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-muted-foreground">
        <Loader2
          className="h-5 w-5 animate-spin"
          aria-label="Loading assistant"
        />
      </div>
    );
  }
  if (!token || isError || !business) {
    return (
      <div className="mx-auto max-w-3xl p-6 md:p-10">
        <PageHeader
          title="Assistant unavailable"
          subtitle="Sign in to your salon workspace and try again."
        />
        <Button asChild variant="outline">
          <Link to="/auth">Sign in</Link>
        </Button>
      </div>
    );
  }
  if (business.plan === "free") {
    return (
      <div className="mx-auto max-w-4xl p-6 md:p-10">
        <PageHeader
          eyebrow="Assistant"
          title="A hand with the working day"
          subtitle="Understand today's visits, check recorded payments and draft useful follow-ups."
        />
        <StudioUpgradePanel
          title="The assistant is a Studio feature"
          description="Studio gives you practical answers using your salon's current bookings, services and payment records."
        />
      </div>
    );
  }
  return <AssistantInner token={token} />;
}

function AssistantInner({ token }: { token: string }) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        headers: { Authorization: `Bearer ${token}` },
      }),
    [token],
  );
  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport,
  });
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isLoading = status === "submitted" || status === "streaming";
  const overview = useQuery({
    queryKey: ["dashboard-overview"],
    queryFn: async () =>
      getDashboardOverview({ headers: await getServerFnAuthHeaders() }),
    staleTime: 60_000,
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    if (!isLoading) inputRef.current?.focus();
  }, [isLoading]);
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "auto",
    });
  }, [messages, isLoading]);

  const send = (text: string) => {
    const value = text.trim();
    if (!value || isLoading || value.length > 4_000) return;
    setInput("");
    void sendMessage({ text: value });
  };

  return (
    <div className="mx-auto max-w-[1180px] p-5 sm:p-8 md:p-10">
      <PageHeader
        eyebrow="Your assistant"
        title="Make the next move easier."
        subtitle="Get a clear answer from your salon's current records, then open the right place to act. Nothing is changed or sent for you."
        action={
          messages.length ? (
            <Button variant="outline" size="sm" onClick={() => setMessages([])}>
              <RotateCcw className="mr-2 h-4 w-4" /> New conversation
            </Button>
          ) : undefined
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {QUICK.map(({ icon: Icon, label, description, prompt }) => (
          <button
            key={label}
            type="button"
            disabled={isLoading}
            onClick={() => send(prompt)}
            className="rounded-2xl border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <Icon
              className="mb-3 h-5 w-5 text-[color:var(--gold-deep)]"
              aria-hidden="true"
            />
            <span className="block text-sm font-semibold">{label}</span>
            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
              {description}
            </span>
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <div
            ref={scrollRef}
            className="min-h-[390px] max-h-[62vh] space-y-5 overflow-y-auto rounded-2xl border bg-card p-4 sm:p-6"
          >
            {messages.length === 0 && (
              <div className="flex min-h-[300px] flex-col items-center justify-center text-center">
                <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-[color:var(--gold-deep)]">
                  <Sparkles className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-semibold">
                  What can I help you get through?
                </h2>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  Pick a task above or ask about appointments, payment records,
                  services or a draft you can use.
                </p>
              </div>
            )}
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {isLoading && messages.at(-1)?.role !== "assistant" && (
              <p
                role="status"
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Loader2 className="h-4 w-4 animate-spin" /> Checking your
                latest records…
              </p>
            )}
            {error && (
              <p
                role="alert"
                className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              >
                {error.message ||
                  "The assistant could not answer. Please try again."}
              </p>
            )}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              send(input);
            }}
            className="mt-3 flex items-end gap-2"
          >
            <Textarea
              ref={inputRef}
              aria-label="Message to Bookzenvo assistant"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send(input);
                }
              }}
              placeholder="For example, what needs my attention today?"
              rows={2}
              maxLength={4_000}
              disabled={isLoading}
              className="min-h-[56px] resize-none"
            />
            <Button
              type="submit"
              size="lg"
              aria-label="Send message"
              disabled={isLoading || !input.trim()}
              className="h-[56px] shrink-0"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            Answers can help you decide; review booking and payment details
            before taking action.
          </p>
        </div>

        <aside className="space-y-4">
          <section
            className="rounded-2xl border bg-card p-5"
            aria-labelledby="assistant-attention-heading"
          >
            <div className="flex items-center justify-between gap-3">
              <h2
                id="assistant-attention-heading"
                className="text-base font-semibold"
              >
                Needs a look
              </h2>
              <ClipboardList
                className="h-4 w-4 text-[color:var(--gold-deep)]"
                aria-hidden="true"
              />
            </div>
            {overview.isLoading ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Checking your workspace…
              </p>
            ) : overview.isError ? (
              <div className="mt-4 space-y-2 text-sm">
                <p>Could not load the shortlist.</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void overview.refetch()}
                >
                  Try again
                </Button>
              </div>
            ) : overview.data?.attention.length ? (
              <div className="mt-3 divide-y">
                {overview.data.attention.slice(0, 3).map((item) => (
                  <div key={item.id} className="py-3 first:pt-0">
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                    {item.bookingId ? (
                      <Link
                        to="/bookings"
                        search={{ bookingId: item.bookingId }}
                        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--gold-deep)] hover:underline"
                      >
                        Open booking <ArrowRight className="h-3 w-3" />
                      </Link>
                    ) : (
                      <Link
                        to={item.href === "/stock" ? "/stock" : "/consultations"}
                        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--gold-deep)] hover:underline"
                      >
                        {item.action} <ArrowRight className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                No items in the dashboard shortlist. Check Bookings for the full
                picture.
              </p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              A shortlist, not a full form or patch-test check.
            </p>
          </section>
          <section
            className="rounded-2xl border bg-card p-5"
            aria-labelledby="assistant-shortcuts-heading"
          >
            <h2
              id="assistant-shortcuts-heading"
              className="text-base font-semibold"
            >
              Go straight to it
            </h2>
            <div className="mt-3 grid gap-1">
              <Shortcut
                to="/calendar"
                icon={CalendarDays}
                label="Check availability"
              />
              <Shortcut
                to="/bookings"
                icon={ClipboardList}
                label="Review bookings"
              />
              <Shortcut
                to="/payments"
                icon={CreditCard}
                label="See payment records"
              />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Shortcut({
  to,
  icon: Icon,
  label,
}: {
  to: "/calendar" | "/bookings" | "/payments";
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-secondary/60"
    >
      <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      {label}
      <ArrowRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
    </Link>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const text = message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  return (
    <div className={cn("flex gap-3", isUser && "justify-end")}>
      {!isUser && (
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-[color:var(--gold-deep)]">
          <Sparkles className="h-4 w-4" />
        </div>
      )}
      <div
        className={cn(
          "min-w-0 max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words",
          isUser
            ? "bg-primary text-primary-foreground"
            : "border bg-background",
        )}
      >
        {text || <span className="text-muted-foreground italic">…</span>}
        {!isUser && text && (
          <button
            type="button"
            className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                setCopied(false);
              }
            }}
            aria-label="Copy assistant answer"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? "Copied" : "Copy answer"}
          </button>
        )}
      </div>
    </div>
  );
}
