import { useState } from "react";
import { MailCheck, Loader2, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// Shown instead of the app when a signed-in user's email hasn't been
// confirmed yet. Only ever triggers if Supabase Auth's "Confirm email"
// setting is turned on (dashboard-level toggle, not something this repo
// controls) — until then, email_confirmed_at is set at signup and this
// component never renders. Built ahead of that toggle being flipped so
// verification has real teeth once it is.
export function EmailVerifyGate({ email }: { email: string | null | undefined }) {
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const resend = async () => {
    if (!email || cooldown > 0) return;
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) throw error;
      toast.success("Verification email sent.");
      setCooldown(60);
      const tick = () => {
        setCooldown((c) => {
          if (c <= 1) return 0;
          setTimeout(tick, 1000);
          return c - 1;
        });
      };
      setTimeout(tick, 1000);
    } catch (e: any) {
      toast.error(e.message ?? "Could not resend email");
    } finally {
      setResending(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <div className="max-w-sm w-full text-center animate-rise">
        <div className="h-14 w-14 rounded-2xl bg-primary/10 grid place-items-center mx-auto mb-5">
          <MailCheck className="h-6 w-6 text-primary" />
        </div>
        <h1 className="font-display text-2xl tracking-tight">Verify your email</h1>
        <p className="text-sm text-muted-foreground mt-2">
          We sent a confirmation link to{" "}
          <span className="font-medium text-foreground">{email ?? "your email"}</span>. Click it to
          unlock your workspace.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button onClick={resend} disabled={resending || cooldown > 0} className="h-10">
            {resending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend email"}
          </Button>
          <Button variant="ghost" onClick={signOut} className="h-10">
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
