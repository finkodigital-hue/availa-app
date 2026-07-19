import { useState } from "react";
import { CheckCircle2, CreditCard, ExternalLink, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { refreshStripeAccount, startStripeOnboarding } from "@/lib/stripe-connect.functions";

type Business = {
  id: string;
  stripe_account_id?: string | null;
  stripe_charges_enabled?: boolean | null;
  stripe_details_submitted?: boolean | null;
  payment_mode?: string | null;
  deposit_percent?: number | null;
};

export function StripeSettings({ business }: { business: Business }) {
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paymentMode, setPaymentMode] = useState(business.payment_mode ?? "none");
  const [depositPercent, setDepositPercent] = useState(String(business.deposit_percent ?? 30));

  const connected = !!business.stripe_account_id;
  const ready = !!business.stripe_charges_enabled;

  const connect = async () => {
    setConnecting(true);
    try {
      const result = await startStripeOnboarding();
      window.location.assign(result.url);
    } catch (error: any) {
      toast.error(error.message ?? "Could not start Stripe setup");
      setConnecting(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      const result = await refreshStripeAccount();
      await queryClient.invalidateQueries({ queryKey: ["my-business"] });
      toast.success(result.chargesEnabled ? "Stripe is ready to take payments" : "Stripe setup still needs a little more information");
    } catch (error: any) {
      toast.error(error.message ?? "Could not refresh Stripe status");
    } finally {
      setRefreshing(false);
    }
  };

  const savePaymentSettings = async () => {
    const percent = Number(depositPercent);
    if (paymentMode === "deposit" && (!Number.isInteger(percent) || percent < 1 || percent > 100)) {
      toast.error("Choose a deposit between 1% and 100%.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("businesses")
        .update({ payment_mode: paymentMode, deposit_percent: percent || 30 })
        .eq("id", business.id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["my-business"] });
      toast.success("Payment settings saved");
    } catch (error: any) {
      toast.error(error.message ?? "Could not save payment settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-background p-4 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="h-11 w-11 rounded-xl bg-secondary grid place-items-center shrink-0"><CreditCard className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">Stripe</p>
            {ready ? <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> Ready</Badge> : connected ? <Badge variant="secondary">Setup needed</Badge> : <Badge variant="outline">Not connected</Badge>}
          </div>
          <p className="text-sm text-muted-foreground mt-1">Customers pay you directly. Stripe securely verifies your business and sends your payouts.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {connected && <Button variant="outline" onClick={refresh} disabled={refreshing}>{refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}<span className="sr-only">Refresh Stripe status</span></Button>}
          <Button onClick={connect} disabled={connecting}>{connecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ExternalLink className="h-4 w-4 mr-2" />}{connected ? "Continue setup" : "Connect Stripe"}</Button>
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
              <button key={value} type="button" onClick={() => setPaymentMode(value)} disabled={!ready} className={`text-left rounded-xl border p-3 transition-colors ${paymentMode === value ? "border-primary bg-primary/5" : "hover:bg-secondary/50"}`}>
                <p className="text-sm font-medium">{title}</p><p className="text-xs text-muted-foreground mt-1">{detail}</p>
              </button>
            ))}
          </div>
        </div>
        {paymentMode === "deposit" && <div className="max-w-xs"><Label htmlFor="deposit-percent">Deposit amount (%)</Label><Input id="deposit-percent" type="number" min="1" max="100" value={depositPercent} onChange={(event) => setDepositPercent(event.target.value)} disabled={!ready} className="mt-1.5" /></div>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="text-xs text-muted-foreground inline-flex gap-1.5 items-start"><ShieldCheck className="h-4 w-4 shrink-0" />Card details are handled by Stripe, never stored in Bookzenvo.</div>
          <Button onClick={savePaymentSettings} disabled={!ready || saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save payment settings</Button>
        </div>
      </div>
    </div>
  );
}
