import { useEffect, useRef, useState } from "react";
import { ShieldCheck, Loader2, LogOut } from "lucide-react";
import {
  supabase,
  verifyCurrentSessionMfa,
} from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function withinDeadline<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    operation,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("Verification timed out")),
        15_000,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

// Shown when a signed-in session has a verified TOTP factor but hasn't
// stepped up to aal2 yet (fresh password sign-in, or a stale aal1 session
// resuming after a refresh). Blocks the app until the code checks out.
export function MfaChallengeGate({ onVerified }: { onVerified: () => void }) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const mutationLock = useRef(false);
  const mounted = useRef(false);
  const verification = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      verification.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!verifying) return;
    const timer = setTimeout(() => {
      setErrorMessage(
        "This security step is taking longer than usual. Please keep this screen open while it finishes.",
      );
    }, 15_000);
    return () => clearTimeout(timer);
  }, [verifying]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFactorId(null);
    setErrorMessage(null);
    void withinDeadline(supabase.auth.mfa.listFactors())
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) throw error;
        const factor = data?.totp?.find((f) => f.status === "verified");
        setFactorId(factor?.id ?? null);
        if (!factor)
          setErrorMessage(
            "We couldn't find your verified authenticator. Try again or contact help@bookzenvo.com for account recovery.",
          );
      })
      .catch(() => {
        if (!cancelled)
          setErrorMessage(
            "We couldn't load your security check. Please try again.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mutationLock.current || !factorId || !/^\d{6}$/.test(code)) return;
    mutationLock.current = true;
    setVerifying(true);
    setErrorMessage(null);
    const controller = new AbortController();
    verification.current = controller;
    try {
      // These SDK calls can still write a session after resolving. A UI-only
      // timeout must never unlock sign-out while verification is still running.
      await verifyCurrentSessionMfa({
        factorId,
        code: code.trim(),
        signal: controller.signal,
      });
      if (mounted.current) onVerified();
    } catch (error) {
      if (mounted.current) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "We couldn't verify that code. Check your connection and authenticator, then try again.",
        );
        setCode("");
      }
    } finally {
      mutationLock.current = false;
      if (verification.current === controller) verification.current = null;
      if (mounted.current) setVerifying(false);
    }
  };

  const signOut = async () => {
    if (mutationLock.current) return;
    mutationLock.current = true;
    setVerifying(true);
    setErrorMessage(null);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      if (mounted.current) window.location.href = "/auth";
    } catch {
      if (mounted.current)
        setErrorMessage("We couldn't sign you out. Please try again.");
    } finally {
      mutationLock.current = false;
      if (mounted.current) setVerifying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <p role="status">Loading your security check…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <form
        onSubmit={submit}
        className="max-w-sm w-full text-center animate-rise"
      >
        <div className="h-14 w-14 rounded-2xl bg-primary/10 grid place-items-center mx-auto mb-5">
          <ShieldCheck className="h-6 w-6 text-primary" />
        </div>
        <h1 className="font-display text-2xl tracking-tight">
          Enter your 2FA code
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Open your authenticator app and enter the current 6-digit code.
        </p>
        <Input
          aria-label="Six-digit authentication code"
          value={code}
          onChange={(e) =>
            setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
          }
          placeholder="123456"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          disabled={!factorId || verifying}
          autoFocus
          className="mt-6 h-11 tracking-[0.3em] text-center font-mono"
        />
        {errorMessage && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {errorMessage}
          </p>
        )}
        {!factorId && (
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            onClick={() => setLoadAttempt((value) => value + 1)}
            disabled={verifying}
          >
            Try again
          </Button>
        )}
        <div className="mt-4 flex flex-col gap-2">
          <Button
            type="submit"
            disabled={verifying || !factorId || code.length !== 6}
            className="h-10"
          >
            {verifying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Verify
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={signOut}
            disabled={verifying}
            className="h-10"
          >
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </form>
    </div>
  );
}
