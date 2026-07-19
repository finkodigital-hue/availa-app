import { useEffect, useState } from "react";
import { ShieldCheck, Loader2, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

// Shown when a signed-in session has a verified TOTP factor but hasn't
// stepped up to aal2 yet (fresh password sign-in, or a stale aal1 session
// resuming after a refresh). Blocks the app until the code checks out.
export function MfaChallengeGate({ onVerified }: { onVerified: () => void }) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data, error }) => {
      setLoading(false);
      if (error) return toast.error(error.message);
      const factor = data?.totp.find((f) => f.status === "verified");
      setFactorId(factor?.id ?? null);
    });
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId || code.trim().length < 6) return;
    setVerifying(true);
    try {
      const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeErr) throw challengeErr;
      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (verifyErr) throw verifyErr;
      onVerified();
    } catch (err: any) {
      toast.error(err.message ?? "Invalid code");
      setCode("");
    } finally {
      setVerifying(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <form onSubmit={submit} className="max-w-sm w-full text-center animate-rise">
        <div className="h-14 w-14 rounded-2xl bg-primary/10 grid place-items-center mx-auto mb-5">
          <ShieldCheck className="h-6 w-6 text-primary" />
        </div>
        <h1 className="font-display text-2xl tracking-tight">Enter your 2FA code</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Open your authenticator app and enter the current 6-digit code.
        </p>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="123456"
          inputMode="numeric"
          autoFocus
          className="mt-6 h-11 tracking-[0.3em] text-center font-mono"
        />
        <div className="mt-4 flex flex-col gap-2">
          <Button type="submit" disabled={verifying || code.length < 6} className="h-10">
            {verifying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Verify
          </Button>
          <Button type="button" variant="ghost" onClick={signOut} className="h-10">
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </form>
    </div>
  );
}
