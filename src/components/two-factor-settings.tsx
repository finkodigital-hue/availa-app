import { useEffect, useState } from "react";
import { ShieldCheck, ShieldOff, Loader2, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "sonner";

// TOTP two-factor auth, built entirely on Supabase Auth's client-side MFA
// API (auth.mfa.*) — no service-role key, dashboard toggle, or migration
// needed. Works the moment this ships.
type Factor = { id: string; status: "verified" | "unverified"; friendly_name?: string | null };

export function TwoFactorSettings() {
  const [loading, setLoading] = useState(true);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enrolling, setEnrolling] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [pendingFactorId, setPendingFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    setLoading(false);
    if (error) return toast.error(error.message);
    setFactors((data?.totp ?? []) as Factor[]);
  };

  useEffect(() => {
    refresh();
  }, []);

  const verified = factors.find((f) => f.status === "verified");

  const startEnroll = async () => {
    setEnrolling(true);
    try {
      // Clear out any stale unverified factor from an abandoned attempt
      // before starting a fresh one — Supabase caps factors per user.
      const stale = factors.filter((f) => f.status === "unverified");
      for (const f of stale) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error) throw error;
      setPendingFactorId(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
    } catch (e: any) {
      toast.error(e.message ?? "Could not start enrollment");
      setEnrolling(false);
    }
  };

  const cancelEnroll = async () => {
    if (pendingFactorId) {
      await supabase.auth.mfa.unenroll({ factorId: pendingFactorId });
    }
    setEnrolling(false);
    setQr(null);
    setSecret(null);
    setPendingFactorId(null);
    setCode("");
    refresh();
  };

  const confirmEnroll = async () => {
    if (!pendingFactorId || code.trim().length < 6) return toast.error("Enter the 6-digit code");
    setVerifying(true);
    try {
      const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: pendingFactorId });
      if (challengeErr) throw challengeErr;
      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId: pendingFactorId,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (verifyErr) throw verifyErr;
      toast.success("Two-factor authentication enabled");
      setEnrolling(false);
      setQr(null);
      setSecret(null);
      setPendingFactorId(null);
      setCode("");
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Invalid code");
    } finally {
      setVerifying(false);
    }
  };

  const remove = async (factorId: string) => {
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) return toast.error(error.message);
    toast.success("Two-factor authentication disabled");
    refresh();
  };

  const copySecret = () => {
    if (!secret) return;
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (loading) {
    return <div className="h-16 rounded-xl bg-secondary/40 animate-pulse" />;
  }

  if (verified) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background p-4">
        <div className="flex items-center gap-3">
          <span className="h-9 w-9 shrink-0 rounded-xl grid place-items-center bg-[color:var(--confirmed)]/15 text-[color:var(--confirmed)]">
            <ShieldCheck className="h-4.5 w-4.5" />
          </span>
          <div>
            <p className="text-sm font-medium flex items-center gap-2">
              Two-factor authentication <Badge variant="secondary" className="text-[10px]">Enabled</Badge>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              You'll be asked for a code from your authenticator app when signing in.
            </p>
          </div>
        </div>
        <ConfirmDialog
          trigger={<Button type="button" variant="outline" size="sm"><ShieldOff className="h-3.5 w-3.5 mr-1.5" /> Disable</Button>}
          title="Disable two-factor authentication?"
          description="Your account will only require a password to sign in."
          confirmLabel="Disable"
          onConfirm={async () => { await remove(verified.id); }}
        />
      </div>
    );
  }

  if (enrolling && qr) {
    return (
      <div className="rounded-xl border bg-background p-5 space-y-4">
        <div>
          <p className="text-sm font-medium">Scan this QR code</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Use an authenticator app (Google Authenticator, 1Password, Authy) to scan the code below.
          </p>
        </div>
        <div className="flex justify-center">
          <div
            className="h-44 w-44 rounded-xl border bg-white p-2 [&_svg]:h-full [&_svg]:w-full"
            dangerouslySetInnerHTML={{ __html: qr }}
          />
        </div>
        {secret && (
          <div>
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Can't scan? Enter manually</Label>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="flex-1 text-xs bg-secondary/60 rounded-lg px-3 py-2 tracking-wider truncate">{secret}</code>
              <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={copySecret} aria-label="Copy secret">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        )}
        <div>
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">6-digit code</Label>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            inputMode="numeric"
            className="mt-1.5 h-10 tracking-[0.3em] text-center font-mono"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={cancelEnroll}>Cancel</Button>
          <Button type="button" onClick={confirmEnroll} disabled={verifying || code.length < 6}>
            {verifying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Verify & enable
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background p-4">
      <div className="flex items-center gap-3">
        <span className="h-9 w-9 shrink-0 rounded-xl grid place-items-center bg-secondary text-foreground">
          <ShieldOff className="h-4.5 w-4.5" />
        </span>
        <div>
          <p className="text-sm font-medium">Two-factor authentication</p>
          <p className="text-xs text-muted-foreground mt-0.5">Add an authenticator-app code on top of your password.</p>
        </div>
      </div>
      <Button type="button" onClick={startEnroll} disabled={enrolling}>
        {enrolling && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Enable
      </Button>
    </div>
  );
}
