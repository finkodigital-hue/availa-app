import { useState } from "react";
import {
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  refreshStripeAccount,
  saveNoShowPolicy,
  startStripeOnboarding,
} from "@/lib/stripe-connect.functions";
import { getServerFnAuthHeaders } from "@/lib/server-fn-auth";

type Business = {
  id: string;
  stripe_account_id?: string | null;
  stripe_charges_enabled?: boolean | null;
  stripe_details_submitted?: boolean | null;
  payment_mode?: string | null;
  deposit_percent?: number | null;
  cancellation_window_hours?: number | null;
  cancellation_policy?: string | null;
  reminder_hours_before?: number | null;
  plan?: string | null;
};

export function StripeSettings({ business }: { business: Business }) {
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paymentMode, setPaymentMode] = useState(
    business.payment_mode ?? "none",
  );
  const [depositPercent, setDepositPercent] = useState(
    String(business.deposit_percent ?? 30),
  );
  const [windowHours, setWindowHours] = useState(
    String(business.cancellation_window_hours ?? 24),
  );
  const [policy, setPolicy] = useState(
    business.cancellation_policy ??
      "Deposits are retained when a booking is cancelled or rescheduled inside the notice window. Please contact us if you need help.",
  );
  const [reminderHours, setReminderHours] = useState(
    String(business.reminder_hours_before ?? 24),
  );

  const connected = !!business.stripe_account_id;
  const ready = !!business.stripe_charges_enabled;

  const connect = async () => {
    setConnecting(true);
    try {
      const headers = await getServerFnAuthHeaders();
      const result = await startStripeOnboarding({ headers });
      window.location.assign(result.url);
    } catch (error: any) {
      toast.error(error.message ?? "Could not start Stripe setup");
      setConnecting(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      const headers = await getServerFnAuthHeaders();
      const result = await refreshStripeAccount({ headers });
      await queryClient.invalidateQueries({ queryKey: ["my-business"] });
      toast.success(
        result.chargesEnabled
          ? "Stripe is ready to take payments"
          : "Stripe setup still needs a little more information",
      );
    } catch (error: any) {
      toast.error(error.message ?? "Could not refresh Stripe status");
    } finally {
      setRefreshing(false);
    }
  };

  const savePaymentSettings = async () => {
    const percent = Number(depositPercent);
    if (
      paymentMode === "deposit" &&
      (!Number.isInteger(percent) || percent < 1 || percent > 100)
    ) {
      toast.error("Choose a deposit between 1% and 100%.");
      return;
    }
    setSaving(true);
    try {
      const headers = await getServerFnAuthHeaders();
      await saveNoShowPolicy({
        data: {
          paymentMode: paymentMode as "none" | "deposit" | "full",
          depositPercent: percent || 30,
          cancellationWindowHours: Number(windowHours),
          cancellationPolicy: policy,
          reminderHoursBefore: Number(reminderHours),
        },
        headers,
      });
      await queryClient.invalidateQueries({ queryKey: ["my-business"] });
      toast.success("Booking protection policy saved");
    } catch (error: any) {
      toast.error(error.message ?? "Could not save payment settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-background p-4 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="h-11 w-11 rounded-xl bg-secondary grid place-items-center shrink-0">
          <CreditCard className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">Stripe</p>
            {ready ? (
              <Badge className="gap-1">
                <CheckCircle2 className="h-3 w-3" /> Ready
              </Badge>
            ) : connected ? (
              <Badge variant="secondary">Setup needed</Badge>
            ) : (
              <Badge variant="outline">Not connected</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Customers pay you directly. Stripe securely verifies your business
            and sends your payouts.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {connected && (
            <Button variant="outline" onClick={refresh} disabled={refreshing}>
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="sr-only">Refresh Stripe status</span>
            </Button>
          )}
          <Button onClick={connect} disabled={connecting}>
            {connecting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4 mr-2" />
            )}
            {connected ? "Continue setup" : "Connect Stripe"}
          </Button>
        </div>
      </div>

      <div className={`space-y-4 ${ready ? "" : "opacity-60"}`}>
        <div>
          <Label>When should customers pay?</Label>
          <div className="grid sm:grid-cols-3 gap-2 mt-2">
            {[
              ["none", "No online payment", "Take payment in person"],
              ["deposit", "Take a deposit", "Secure each booking up front"],
              ["full", "Take full payment", "Collect the full service price"],
            ].map(([value, title, detail]) => (
              <button
                key={value}
                type="button"
                onClick={() => setPaymentMode(value)}
                disabled={!ready && value !== "none"}
                className={`text-left rounded-xl border p-3 transition-colors ${paymentMode === value ? "border-primary bg-primary/5" : "hover:bg-secondary/50"}`}
              >
                <p className="text-sm font-medium">{title}</p>
                <p className="text-xs text-muted-foreground mt-1">{detail}</p>
              </button>
            ))}
          </div>
        </div>
        {paymentMode === "deposit" && (
          <div className="max-w-xs">
            <Label htmlFor="deposit-percent">Deposit amount (%)</Label>
            <Input
              id="deposit-percent"
              type="number"
              min="1"
              max="100"
              value={depositPercent}
              onChange={(event) => setDepositPercent(event.target.value)}
              disabled={!ready}
              className="mt-1.5"
            />
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-4 rounded-xl border p-4">
          <div>
            <Label htmlFor="cancellation-window">
              Online cancellation or rescheduling closes
            </Label>
            <div className="flex items-center gap-2 mt-1.5">
              <Input
                id="cancellation-window"
                type="number"
                min="0"
                max="336"
                value={windowHours}
                onChange={(e) => setWindowHours(e.target.value)}
                className="max-w-28"
              />
              <span className="text-sm text-muted-foreground">
                hours before
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Inside this window, clients must contact you. Owners can still
              make changes.
            </p>
          </div>
          <div>
            <Label htmlFor="reminder-hours">Email reminder</Label>
            <div className="flex items-center gap-2 mt-1.5">
              <Input
                id="reminder-hours"
                type="number"
                min="1"
                max="168"
                value={reminderHours}
                onChange={(e) => setReminderHours(e.target.value)}
                disabled={business.plan !== "studio"}
                className="max-w-28"
              />
              <span className="text-sm text-muted-foreground">
                hours before
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {business.plan === "studio"
                ? "Includes confirm, cancel and reschedule links."
                : "Available on Studio; your current reminder timing is preserved."}
            </p>
          </div>
        </div>
        <div>
          <Label htmlFor="cancellation-policy">
            Policy shown before confirmation
          </Label>
          <Textarea
            id="cancellation-policy"
            value={policy}
            onChange={(e) => setPolicy(e.target.value)}
            maxLength={1000}
            className="mt-1.5 min-h-24"
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            State what happens to deposits or payments after the notice window.
            Refunds remain a separate owner action.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="text-xs text-muted-foreground inline-flex gap-1.5 items-start">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            Card details are handled by Stripe, never stored in Bookzenvo.
          </div>
          <Button
            onClick={savePaymentSettings}
            disabled={saving || (paymentMode !== "none" && !ready)}
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save
            booking protection
          </Button>
        </div>
      </div>
    </div>
  );
}
