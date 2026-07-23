import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import { parseTheme, applyThemeVars, themedButtonStyle, defaultTheme, googleFontsHref } from "@/lib/theme";
import { fmtMoney } from "@/lib/format";

type ActResult =
  | { ok: true; action: "confirm" | "cancel"; businessName: string; theme: unknown; serviceName: string; staffName: string; startsAtIso: string; timezone: string; priceCents: number; currency: string; location: string | null }
  | { ok: false; reason: "invalid" | "expired" | "used"; businessName?: undefined }
  | { ok: false; reason: "already_cancelled"; businessName: string; theme: unknown; serviceName: string; staffName: string; startsAtIso: string; timezone: string; priceCents: number; currency: string; location: string | null }
  | { ok: false; reason: "window_passed"; windowHours: number; contactPhone: string | null; contactEmail: string | null; businessName: string; theme: unknown; serviceName: string; staffName: string; startsAtIso: string; timezone: string; priceCents: number; currency: string; location: string | null };

export const Route = createFileRoute("/booking-action/$action/$token")({
  component: BookingActionPage,
});

function BookingActionPage() {
  const { action, token } = Route.useParams();
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const [result, setResult] = useState<ActResult | null>(null);

  useEffect(() => {
    if (action !== "confirm" && action !== "cancel") {
      setState("error");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/booking-actions/act", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, token }),
        });
        const data = (await res.json()) as ActResult;
        if (cancelled) return;
        setResult(data);
        setState("done");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [action, token]);

  const theme = result && "theme" in result && result.theme ? parseTheme(result.theme) : defaultTheme();

  return (
    <div style={applyThemeVars(theme) as React.CSSProperties} className="min-h-screen bg-[var(--brand-bg)] text-[var(--brand-text)] flex items-center justify-center p-6">
      <link rel="stylesheet" href={googleFontsHref(theme)} />
      <div className="w-full max-w-sm rounded-2xl border p-8 text-center" style={{ background: "var(--brand-surface)", borderColor: "color-mix(in oklab, var(--brand-text) 12%, transparent)" }}>
        {state === "loading" && (
          <>
            <Clock className="h-8 w-8 mx-auto animate-pulse" style={{ color: "var(--brand)" }} />
            <p className="mt-4 text-sm" style={{ color: "var(--brand-text-muted)" }}>One moment…</p>
          </>
        )}

        {state === "error" && (
          <>
            <AlertTriangle className="h-8 w-8 mx-auto text-destructive" />
            <h1 className="font-display text-xl mt-4">Something went wrong</h1>
            <p className="mt-2 text-sm" style={{ color: "var(--brand-text-muted)" }}>Please try again, or contact the business directly.</p>
          </>
        )}

        {state === "done" && result && !result.ok && (result.reason === "invalid" || result.reason === "expired" || result.reason === "used") && (
          <>
            <AlertTriangle className="h-8 w-8 mx-auto text-destructive" />
            <h1 className="font-display text-xl mt-4">This link is no longer valid</h1>
            <p className="mt-2 text-sm" style={{ color: "var(--brand-text-muted)" }}>
              {result.reason === "used"
                ? "This link has already been used."
                : result.reason === "expired"
                  ? "This link has expired."
                  : "This link isn't valid — it may have been affected by a booking change."}
            </p>
          </>
        )}

        {state === "done" && result && !result.ok && result.reason === "already_cancelled" && (
          <>
            <XCircle className="h-8 w-8 mx-auto" style={{ color: "var(--brand)" }} />
            <h1 className="font-display text-xl mt-4">Already cancelled</h1>
            <p className="mt-2 text-sm" style={{ color: "var(--brand-text-muted)" }}>This booking with {result.businessName} has already been cancelled.</p>
          </>
        )}

        {state === "done" && result && !result.ok && result.reason === "window_passed" && (
          <>
            <AlertTriangle className="h-8 w-8 mx-auto" style={{ color: "var(--brand)" }} />
            <h1 className="font-display text-xl mt-4">Too close to cancel online</h1>
            <p className="mt-2 text-sm" style={{ color: "var(--brand-text-muted)" }}>
              This appointment is within {result.windowHours}h, so it can no longer be cancelled online. Please contact {result.businessName} directly.
            </p>
            {(result.contactPhone || result.contactEmail) && (
              <div className="mt-4 text-sm font-medium space-y-0.5">
                {result.contactPhone && <div>{result.contactPhone}</div>}
                {result.contactEmail && <div>{result.contactEmail}</div>}
              </div>
            )}
          </>
        )}

        {state === "done" && result && result.ok && (
          <>
            <CheckCircle2 className="h-8 w-8 mx-auto" style={{ color: "var(--brand)" }} />
            <h1 className="font-display text-xl mt-4">
              {result.action === "confirm" ? "You're confirmed" : "Booking cancelled"}
            </h1>
            <p className="mt-1 text-sm" style={{ color: "var(--brand-text-muted)" }}>
              {result.businessName}
            </p>
            <div className="mt-5 rounded-xl border p-4 text-left text-sm space-y-1.5" style={{ borderColor: "color-mix(in oklab, var(--brand-text) 12%, transparent)" }}>
              <Row label="Service" value={result.serviceName} />
              <Row label="With" value={result.staffName} />
              <Row
                label="When"
                value={new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: result.timezone }).format(new Date(result.startsAtIso))}
              />
              <Row label="Price" value={fmtMoney(result.priceCents, result.currency)} />
              {result.location && <Row label="Location" value={result.location} />}
            </div>
          </>
        )}

        <Link to="/" className="inline-block mt-6 text-xs font-medium" style={{ color: "var(--brand-text-muted)" }}>
          Powered by Bookzenvo
        </Link>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span style={{ color: "var(--brand-text-muted)" }}>{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
