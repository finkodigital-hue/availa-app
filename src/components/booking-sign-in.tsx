import { useState } from "react";
import { Mail, KeyRound, Loader2, ShieldCheck, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

// Same passwordless email-OTP flow as portal.index.tsx, packaged small
// enough to embed directly in the public booking page's contact-details
// step — signing in here (or already being signed in from a previous visit)
// lets a returning customer skip retyping their details and see this
// booking later in "My bookings". Entirely optional: booking as a guest
// works exactly as before if this is never opened.
export function BookingSignIn({ onSignedIn }: { onSignedIn: (email: string) => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      toast.success("Check your inbox for the 6-digit code");
      setStep("code");
    } catch (err: any) {
      toast.error(err.message ?? "Could not send code");
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < 6) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code.trim(),
        type: "email",
      });
      if (error) throw error;
      toast.success("Signed in");
      onSignedIn(email.trim().toLowerCase());
    } catch (err: any) {
      toast.error(err.message ?? "Invalid or expired code");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between gap-2 rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-colors mb-4"
      >
        <span className="inline-flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          Booked with us before? Sign in to fill this in faster.
        </span>
        <ChevronDown className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="rounded-xl border bg-secondary/20 p-4 mb-4">
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="w-full flex items-center justify-between gap-2 text-sm font-medium mb-3"
      >
        <span className="inline-flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> Sign in to fill this in faster
        </span>
        <ChevronUp className="h-4 w-4 text-muted-foreground" />
      </button>

      {step === "email" ? (
        <form onSubmit={sendCode} className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Mail className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="email"
              required
              inputMode="email"
              className="pl-9 h-10 bg-background"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy} className="shrink-0">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send code"}
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <KeyRound className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              required
              autoFocus
              inputMode="numeric"
              maxLength={6}
              className="pl-9 h-10 bg-background tracking-[0.4em] font-mono"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </div>
          <Button type="submit" disabled={busy || code.length < 6} className="shrink-0">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
          </Button>
        </form>
      )}
      <p className="text-[11px] text-muted-foreground mt-2">
        We'll email a one-time code — {step === "email" ? "no password needed." : `sent to ${email}.`}
      </p>
    </div>
  );
}
