import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { parseTheme, applyThemeVars, themedButtonStyle, defaultTheme, googleFontsHref } from "@/lib/theme";
import { useAvailableSlots, buildDateStrip } from "@/lib/slots";

type Peek =
  | { ok: true; businessId: string; staffId: string; businessName: string; theme: unknown; timezone: string; serviceName: string; staffName: string; currentStartsAtIso: string; service: { duration_minutes: number; buffer_before_min: number | null; buffer_after_min: number | null } }
  | { ok: false; reason: "invalid" | "expired" | "used" };

export const Route = createFileRoute("/booking-action/reschedule/$token")({
  component: ReschedulePage,
});

function ReschedulePage() {
  const { token } = Route.useParams();
  const [peek, setPeek] = useState<Peek | null>(null);
  const [state, setState] = useState<"loading" | "picking" | "submitting" | "done" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/booking-actions/reschedule-peek", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = (await res.json()) as Peek;
        if (cancelled) return;
        setPeek(data);
        setState(data.ok ? "picking" : "error");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const theme = peek && peek.ok && peek.theme ? parseTheme(peek.theme) : defaultTheme();

  return (
    <div style={applyThemeVars(theme) as React.CSSProperties} className="min-h-screen bg-[var(--brand-bg)] text-[var(--brand-text)] flex items-center justify-center p-6">
      <link rel="stylesheet" href={googleFontsHref(theme)} />
      <div className="w-full max-w-md rounded-2xl border p-6 sm:p-8" style={{ background: "var(--brand-surface)", borderColor: "color-mix(in oklab, var(--brand-text) 12%, transparent)" }}>
        {state === "loading" && (
          <div className="text-center py-8">
            <Loader2 className="h-8 w-8 mx-auto animate-spin" style={{ color: "var(--brand)" }} />
          </div>
        )}

        {state === "error" && (
          <div className="text-center py-8">
            <AlertTriangle className="h-8 w-8 mx-auto text-destructive" />
            <h1 className="font-display text-xl mt-4">This link is no longer valid</h1>
            <p className="mt-2 text-sm" style={{ color: "var(--brand-text-muted)" }}>
              It may have expired, already been used, or the booking has changed since this email was sent.
            </p>
          </div>
        )}

        {(state === "picking" || state === "submitting") && peek?.ok && (
          <SlotPicker peek={peek} token={token} submitting={state === "submitting"} onSubmitting={() => setState("submitting")} onDone={() => setState("done")} onFail={() => setState("picking")} />
        )}

        {state === "done" && (
          <div className="text-center py-8">
            <CheckCircle2 className="h-8 w-8 mx-auto" style={{ color: "var(--brand)" }} />
            <h1 className="font-display text-xl mt-4">Booking rescheduled</h1>
            <p className="mt-2 text-sm" style={{ color: "var(--brand-text-muted)" }}>We've updated your appointment time.</p>
          </div>
        )}

        <Link to="/" className="block text-center mt-6 text-xs font-medium" style={{ color: "var(--brand-text-muted)" }}>
          Powered by Bookzenvo
        </Link>
      </div>
    </div>
  );
}

function SlotPicker({
  peek,
  token,
  submitting,
  onSubmitting,
  onDone,
  onFail,
}: {
  peek: Extract<Peek, { ok: true }>;
  token: string;
  submitting: boolean;
  onSubmitting: () => void;
  onDone: () => void;
  onFail: () => void;
}) {
  const [date, setDate] = useState<Date>(() => {
    const d = new Date(peek.currentStartsAtIso);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [stripStart, setStripStart] = useState(0);
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { slots, isLoading } = useAvailableSlots({
    businessId: peek.businessId,
    staffId: peek.staffId,
    service: peek.service,
    date,
  });

  const days = useMemo(() => buildDateStrip(28).slice(stripStart, stripStart + 7), [stripStart]);

  const submit = async () => {
    if (!picking) return;
    onSubmitting();
    setError(null);
    try {
      const res = await fetch("/api/booking-actions/reschedule-commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, starts_at: picking }),
      });
      const data = await res.json();
      if (data.ok) {
        onDone();
      } else {
        setError(data.reason === "slot_taken" ? "That slot was just taken — pick another." : "This link is no longer valid.");
        onFail();
      }
    } catch {
      setError("Something went wrong — please try again.");
      onFail();
    }
  };

  return (
    <div>
      <h1 className="font-display text-xl">Reschedule your appointment</h1>
      <p className="mt-1 text-sm" style={{ color: "var(--brand-text-muted)" }}>
        {peek.serviceName} with {peek.staffName} at {peek.businessName}
      </p>

      <div className="flex items-center gap-2 mt-5">
        <button onClick={() => setStripStart(Math.max(0, stripStart - 7))} disabled={stripStart === 0} className="p-1.5 rounded-lg border disabled:opacity-30" style={{ borderColor: "color-mix(in oklab, var(--brand-text) 12%, transparent)" }}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 grid grid-cols-7 gap-1">
          {days.map((d) => {
            const active = d.toDateString() === date.toDateString();
            return (
              <button
                key={d.toISOString()}
                onClick={() => { setDate(d); setPicking(null); }}
                className="rounded-lg border p-1.5 text-center transition"
                style={active ? { background: "var(--brand)", color: "#fff", borderColor: "var(--brand)" } : { borderColor: "color-mix(in oklab, var(--brand-text) 12%, transparent)" }}
              >
                <div className="text-[9px] uppercase tracking-wider opacity-70">{d.toLocaleDateString([], { weekday: "short" })}</div>
                <div className="text-sm mt-0.5">{d.getDate()}</div>
              </button>
            );
          })}
        </div>
        <button onClick={() => setStripStart(Math.min(21, stripStart + 7))} disabled={stripStart >= 21} className="p-1.5 rounded-lg border disabled:opacity-30" style={{ borderColor: "color-mix(in oklab, var(--brand-text) 12%, transparent)" }}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-[140px] max-h-[240px] overflow-y-auto mt-4">
        {isLoading && <div className="text-center py-8 text-sm" style={{ color: "var(--brand-text-muted)" }}>Loading times…</div>}
        {!isLoading && slots.length === 0 && (
          <div className="text-center py-8 text-sm" style={{ color: "var(--brand-text-muted)" }}>No available times this day. Try another date.</div>
        )}
        {!isLoading && slots.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {slots.map((s) => (
              <button
                key={s.iso}
                onClick={() => setPicking(s.iso)}
                className="rounded-lg border py-2 text-sm transition"
                style={picking === s.iso ? { background: "var(--brand)", color: "#fff", borderColor: "var(--brand)" } : { borderColor: "color-mix(in oklab, var(--brand-text) 12%, transparent)" }}
              >
                {s.time}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      <button
        onClick={submit}
        disabled={!picking || submitting}
        className="w-full mt-5 py-3 rounded-xl font-semibold text-sm disabled:opacity-40"
        style={themedButtonStyle(parseTheme(peek.theme))}
      >
        {submitting ? "Rescheduling…" : "Confirm new time"}
      </button>
    </div>
  );
}
