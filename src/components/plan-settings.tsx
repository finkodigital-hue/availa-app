import { useState } from "react";
import { Check, Crown, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const FREE_FEATURES = ["One staff member", "Unlimited bookings", "Branded booking page & client book"];
const STUDIO_FEATURES = [
  "Unlimited staff",
  "Deposits & payments",
  "Email reminders",
  "Analytics & insights",
  "AI assistant & AI page editor",
];

// Card payments for the Studio plan aren't wired up yet (no Stripe account
// connected for billing Bookzenvo itself). Rather than fake a checkout flow,
// "Upgrade" files a support request so it can be actioned manually — same
// mechanism as Contact support, just pre-filled.
export function PlanSettings({ business }: { business: { id: string; plan: string; name: string } }) {
  const { user } = useAuth();
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState(false);
  const isFree = (business.plan ?? "free") === "free";

  const requestUpgrade = async () => {
    if (!user) return;
    setRequesting(true);
    try {
      const { error } = await (supabase as any).from("support_requests").insert({
        business_id: business.id,
        user_id: user.id,
        subject: "Upgrade to Studio plan",
        message: `${business.name} would like to upgrade from Free to Studio (£22/month).`,
        urgency: "normal",
        contact_email: user.email ?? null,
      });
      if (error) throw error;
      setRequested(true);
      toast.success("Request sent — we'll follow up to set up billing.");
    } catch (e: any) {
      toast.error(e.message ?? "Could not send request");
    } finally {
      setRequesting(false);
    }
  };

  return (
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
          <Button className="mt-5 w-full" onClick={requestUpgrade} disabled={requesting || requested}>
            {requesting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : requested ? (
              <Check className="h-4 w-4 mr-2" />
            ) : null}
            {requested ? "Request sent" : "Request upgrade"}
          </Button>
        )}
        {isFree && (
          <p className="text-[11px] text-muted-foreground mt-2 text-center">
            Card billing is being set up — this sends us a request and we'll follow up by email.
          </p>
        )}
      </div>
    </div>
  );
}
