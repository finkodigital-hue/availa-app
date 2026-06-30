import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Mail, ArrowRight, Loader2, ShieldCheck, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/")({
  component: PortalSignIn,
  head: () => ({
    meta: [
      { title: "My bookings — Sign in" },
      { name: "description", content: "Sign in to manage your upcoming appointments, reschedule, or cancel bookings." },
    ],
  }),
});

function PortalSignIn() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/portal/bookings", replace: true });
  }, [loading, user, navigate]);

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
      toast.success("Welcome");
      navigate({ to: "/portal/bookings", replace: true });
    } catch (err: any) {
      toast.error(err.message ?? "Invalid or expired code");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto animate-rise">
      <div className="text-center mb-8">
        <div className="h-12 w-12 mx-auto rounded-2xl bg-primary/10 grid place-items-center mb-4">
          <ShieldCheck className="h-5 w-5 text-primary" />
        </div>
        <h1 className="font-display text-3xl">Sign in to your bookings</h1>
        <p className="text-sm text-muted-foreground mt-2">
          {step === "email"
            ? "Enter your email — we'll send you a one-time code."
            : `We sent a 6-digit code to ${email}.`}
        </p>
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-elegant">
        {step === "email" ? (
          <form onSubmit={sendCode} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email" type="email" required autoFocus inputMode="email"
                  className="pl-9"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (<>Send code <ArrowRight className="h-4 w-4 ml-1.5" /></>)}
            </Button>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="code">Verification code</Label>
              <div className="relative">
                <KeyRound className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="code" required autoFocus inputMode="numeric" maxLength={6}
                  className="pl-9 tracking-[0.5em] text-lg text-center font-mono"
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={busy || code.length < 6}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify & continue"}
            </Button>
            <button
              type="button"
              onClick={() => { setStep("email"); setCode(""); }}
              className="w-full text-xs text-muted-foreground hover:text-foreground transition"
            >
              Use a different email
            </button>
          </form>
        )}
      </div>

      <p className="text-xs text-muted-foreground text-center mt-6 leading-relaxed">
        By signing in you confirm this email address is yours.
        We use a one-time code instead of a password — nothing to remember.
      </p>
    </div>
  );
}
