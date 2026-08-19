import { useEffect, useState } from "react";
import { Check, Crown, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { finalizeStudioCheckout, openBillingPortal, startStudioCheckout } from "@/lib/billing.functions";

const FREE_FEATURES = ["One staff member", "Unlimited bookings", "Deposits & online payments", "Branded booking page & client book"];
const STUDIO_FEATURES = [
  "Unlimited staff",
  "Automated appointment reminders with one-tap confirm, cancel & reschedule",
  "Analytics & insights",
  "AI assistant & AI page editor",
];

type PlanBusiness = {
  id: string;
  plan: string;
  name: string;
  stripe_subscription_id?: string | null;
  stripe_subscription_status?: string | null;
};

export function PlanSettings({ business }: { business: PlanBusiness }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const isFree = (business.plan ?? "free") === "free";
  const hasSubscription = !!business.stripe_subscription_id;

  // Stripe sends the owner back to /settings?tab=plan&billing=success —
  // confirm the subscription server-side (never trust the URL alone), flip
  // the plan, then clean the query string so refreshes don't re-run it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const billing = params.get("billing");
    const sessionId = params.get("session_id");
    if (billing === "cancelled") {
      toast.info("Checkout cancelled — you're still on the free plan.");
      window.history.replaceState({}, "", "/settings?tab=plan");
      return;
    }
    if (billing !== "success" || !sessionId) return;
    setFinalizing(true);
    finalizeStudioCheckout({ data: { sessionId } })
      .then((r) => {
        if (r.activated) {
          toast.success("Welcome to Studio! Everything is unlocked.");
          qc.invalidateQueries({ queryKey: ["my-business"] });
        } else {
          toast.error("Payment hasn't come through yet — if you completed checkout, refresh in a minute.");
        }
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Could not confirm the subscription"))
      .finally(() => {
        setFinalizing(false);
        window.history.replaceState({}, "", "/settings?tab=plan");
      });
  }, [qc]);

  const upgrade = async () => {
    setBusy(true);
    try {
      const { checkoutUrl } = await startStudioCheckout();
      window.location.assign(checkoutUrl);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not start checkout");
      setBusy(false);
    }
  };

  const manageBilling = async () => {
    setBusy(true);
    try {
      const { url } = await openBillingPortal();
      window.location.assign(url);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not open billing");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {finalizing && (
        <div className="rounded-xl border bg-card px-4 py-3 flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Confirming your subscription…
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div className={`rounded-2xl border p-5 ${isFree ? "border-primary/40 bg-primary/5" : "bg-card"}`}>
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg">Solo</h3>
            {isFree && <Badge>Current plan</Badge>}
          </div>
          <div className="font-display text-2xl mt-1">Free</div>
          <ul className="mt-4 space-y-2">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex gap-2 text-sm text-muted-foreground">
                <Check className="h-4 w-4 shrink-0 mt-0.5 text-[color:var(--gold-deep)]" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        <div className={`rounded-2xl border p-5 ${!isFree ? "border-primary/40 bg-primary/5" : "bg-card"}`}>
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg flex items-center gap-1.5">
              <Crown className="h-4 w-4 text-[color:var(--gold-deep)]" /> Studio
            </h3>
            {!isFree && <Badge>Current plan</Badge>}
          </div>
          <div className="font-display text-2xl mt-1">
            £22 <span className="text-sm font-sans font-normal text-muted-foreground">/month</span>
          </div>
          <ul className="mt-4 space-y-2">
            {STUDIO_FEATURES.map((f) => (
              <li key={f} className="flex gap-2 text-sm text-muted-foreground">
                <Check className="h-4 w-4 shrink-0 mt-0.5 text-[color:var(--gold-deep)]" />
                {f.includes("AI") ? (
                  <span className="inline-flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5 text-primary" /> {f}
                  </span>
                ) : (
                  f
                )}
              </li>
            ))}
          </ul>

          {isFree && (
            <>
              <Button className="mt-5 w-full" onClick={upgrade} disabled={busy || finalizing}>
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Crown className="h-4 w-4 mr-2" />}
                Upgrade to Studio — £22/month
              </Button>
              <p className="text-[11px] text-muted-foreground mt-2 text-center">
                Secure checkout with Stripe. £22 today, then monthly — cancel any time.
              </p>
            </>
          )}

          {!isFree && hasSubscription && (
            <>
              <Button variant="outline" className="mt-5 w-full" onClick={manageBilling} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ExternalLink className="h-4 w-4 mr-2" />}
                Manage billing
              </Button>
              <p className="text-[11px] text-muted-foreground mt-2 text-center">
                Update your card, view invoices or cancel — handled securely by Stripe.
              </p>
            </>
          )}

          {!isFree && !hasSubscription && (
            <p className="text-[11px] text-muted-foreground mt-5 text-center">
              Studio access on this workspace is managed by the Bookzenvo team.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
