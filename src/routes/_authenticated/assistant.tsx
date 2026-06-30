import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Send, CalendarCheck, Megaphone, TrendingUp, LineChart, Mail, Loader2, RotateCcw } from "lucide-react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/assistant")({
  component: AssistantPage,
});

type Quick = { icon: typeof Sparkles; label: string; prompt: string };

const QUICK: Quick[] = [
  { icon: CalendarCheck, label: "Today's bookings", prompt: "Give me a concise summary of today's bookings — who's coming in, when, with which staff member, and total expected revenue. Flag anything that needs attention." },
  { icon: Megaphone, label: "Promote empty slots", prompt: "Look at the quietest upcoming days in the next 7 days and suggest 3 specific empty slots to promote. For each, recommend a short promotional angle (e.g. last-minute discount, bundled service) tailored to my services." },
  { icon: TrendingUp, label: "Busiest days", prompt: "Which days of the week are my busiest based on the past 30 days, and what does that imply for staffing and promotions? Be specific." },
  { icon: LineChart, label: "Weekly insights", prompt: "Generate a weekly business insights report. Cover: revenue, booking volume, top services, busiest day, quietest day, and 3 concrete actions I should take this week." },
  { icon: Mail, label: "Draft promo email", prompt: "Draft a friendly promotional email to send to my customer list inviting them to book this week. Include a subject line, a short warm body, and a clear call-to-action. Reference my actual top service." },
];

function AssistantPage() {
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setToken(data.session?.access_token ?? null);
      setEndpoint("/api/chat");
    });
    return () => { mounted = false; };
  }, []);

  if (!endpoint || !token) {
    return (
      <AppShell>
        <div className="p-6 md:p-10 grid place-items-center min-h-[60vh] text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </AppShell>
    );
  }
  return <AssistantInner endpoint={endpoint} token={token} />;
}

function AssistantInner({ endpoint, token }: { endpoint: string; token: string }) {
  const transport = useMemo(
    () => new DefaultChatTransport({ api: endpoint, headers: { Authorization: `Bearer ${token}` } }),
    [endpoint, token],
  );

  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport,
  });

  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    if (!isLoading) inputRef.current?.focus();
  }, [isLoading]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading]);

  const send = async (text: string) => {
    const v = text.trim();
    if (!v || isLoading) return;
    setInput("");
    await sendMessage({ text: v });
  };

  return (
    <AppShell>
      <div className="p-6 md:p-10 max-w-4xl mx-auto">
        <PageHeader
          eyebrow="AI Assistant"
          title="Your business co-pilot"
          subtitle="Ask anything about your bookings, customers and growth. Answers use your live workspace data."
          action={
            messages.length > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => setMessages([])}>
                <RotateCcw className="h-4 w-4 mr-2" /> New chat
              </Button>
            ) : undefined
          }
        />

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-6">
          {QUICK.map((q) => {
            const Icon = q.icon;
            return (
              <button
                key={q.label}
                disabled={isLoading}
                onClick={() => send(q.prompt)}
                className="group text-left rounded-xl border bg-card/60 hover:bg-card hover:border-foreground/20 transition-all p-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Icon className="h-4 w-4 text-primary mb-2 group-hover:scale-110 transition-transform" />
                <div className="text-xs font-medium leading-tight">{q.label}</div>
              </button>
            );
          })}
        </div>

        <div
          ref={scrollRef}
          className="rounded-2xl border bg-card/40 min-h-[420px] max-h-[60vh] overflow-y-auto p-4 md:p-6 space-y-5"
        >
          {messages.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <div className="mx-auto h-12 w-12 rounded-2xl bg-primary/10 grid place-items-center mb-3">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div className="text-sm">Pick a quick action above, or ask anything.</div>
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="flex gap-3">
              <Avatar role="assistant" />
              <div className="flex items-center gap-1.5 pt-2">
                <Dot /> <Dot delay={150} /> <Dot delay={300} />
              </div>
            </div>
          )}
          {error && (
            <div className="text-sm text-destructive rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              {error.message || "Something went wrong. Try again."}
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); send(input); }}
          className="mt-4 flex gap-2 items-end"
        >
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
            }}
            placeholder="Ask about today's schedule, draft an email, get growth ideas…"
            rows={2}
            className="resize-none min-h-[56px]"
            disabled={isLoading}
          />
          <Button type="submit" size="lg" disabled={isLoading || !input.trim()} className="h-[56px]">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>
    </AppShell>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const text = message.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("");
  const isUser = message.role === "user";
  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <Avatar role={message.role} />
      <div
        className={cn(
          "rounded-2xl px-4 py-3 max-w-[85%] text-sm leading-relaxed whitespace-pre-wrap",
          isUser ? "bg-primary text-primary-foreground" : "bg-background border",
        )}
      >
        {text || <span className="text-muted-foreground italic">…</span>}
      </div>
    </div>
  );
}

function Avatar({ role }: { role: string }) {
  const isUser = role === "user";
  return (
    <div
      className={cn(
        "h-8 w-8 shrink-0 rounded-full grid place-items-center text-xs font-medium",
        isUser ? "bg-foreground text-background" : "bg-primary/10 text-primary",
      )}
    >
      {isUser ? "You" : <Sparkles className="h-4 w-4" />}
    </div>
  );
}

function Dot({ delay = 0 }: { delay?: number }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce"
      style={{ animationDelay: `${delay}ms` }}
    />
  );
}
