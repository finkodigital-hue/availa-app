import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useRouter } from "@tanstack/react-router";
import { FlaskConical, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { devSeedProfessional, devMagicLink } from "@/lib/dev-seed.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

/**
 * Dev-only helper: seed and switch between the Salon Owner (current signed-in
 * user) and a demo Independent Professional account. Rendered only when
 * `import.meta.env.DEV` is true — Vite tree-shakes it out of production
 * builds.
 */
export function DevUserSwitcher() {
  if (!import.meta.env.DEV) return null;
  return <DevUserSwitcherInner />;
}

function DevUserSwitcherInner() {
  const { user } = useAuth();
  const router = useRouter();
  const seed = useServerFn(devSeedProfessional);
  const magic = useServerFn(devMagicLink);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<null | "seed" | "pro" | "owner">(null);
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null);

  const doSeed = async () => {
    setBusy("seed");
    try {
      const res = await seed({ data: undefined as any });
      setCreds({ email: res.email, password: res.password });
      toast.success("Demo professional ready");
    } catch (e: any) {
      toast.error(e?.message ?? "Seed failed");
    } finally {
      setBusy(null);
    }
  };

  // Auto-seed the demo pro account the first time the dialog opens so the
  // credentials shown are guaranteed to work immediately.
  useEffect(() => {
    if (open && !creds && busy === null) {
      doSeed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const signInAs = async (email: string, which: "pro" | "owner") => {
    setBusy(which);
    try {
      // Make sure the pro exists before we try to sign in
      if (which === "pro") {
        const res = await seed({ data: undefined as any });
        setCreds({ email: res.email, password: res.password });
      }
      // Use a magic-link OTP so we don't need the current session's password.
      const { token_hash } = await magic({ data: { email } });
      if (!token_hash) throw new Error("Could not generate sign-in token");
      await supabase.auth.signOut();
      const { error } = await supabase.auth.verifyOtp({
        type: "magiclink",
        token_hash,
      });
      if (error) throw error;
      toast.success(`Signed in as ${email}`);
      setOpen(false);
      router.navigate({ to: "/dashboard", replace: true });
      // Hard refresh to reset all cached business/queries
      setTimeout(() => window.location.reload(), 50);
    } catch (e: any) {
      toast.error(e?.message ?? "Sign-in failed");
    } finally {
      setBusy(null);
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied");
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-2 w-full flex items-center gap-2 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 transition-colors"
        title="Dev-only account switcher"
      >
        <FlaskConical className="h-3 w-3" />
        <span>Dev: Switch user</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-amber-500" /> Dev user switcher
            </DialogTitle>
            <DialogDescription>
              Only visible in development. Switch between your salon owner
              account and a demo Independent Professional linked to your salon.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-lg border p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Salon Owner (you)
              </div>
              <div className="mt-1 text-sm font-medium truncate">{user?.email}</div>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 w-full"
                disabled={!user?.email || busy !== null}
                onClick={() => signInAs(user!.email!, "owner")}
              >
                {busy === "owner" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Sign in as Salon Owner"
                )}
              </Button>
            </div>

            <div className="rounded-lg border p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Independent Professional (demo)
              </div>
              <div className="mt-1 text-sm font-medium">Alex Rivera</div>
              <div className="text-xs text-muted-foreground">
                Linked as Chair 3 · $500/mo rent · own services, staff & customers
              </div>

              {creds && (
                <div className="mt-2 space-y-1 rounded-md bg-muted/60 p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Email</span>
                    <div className="flex items-center gap-1">
                      <code className="text-[11px]">{creds.email}</code>
                      <button onClick={() => copy(creds.email)} className="p-1 hover:bg-background rounded">
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Password</span>
                    <div className="flex items-center gap-1">
                      <code className="text-[11px]">{creds.password}</code>
                      <button onClick={() => copy(creds.password)} className="p-1 hover:bg-background rounded">
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={doSeed}
                >
                  {busy === "seed" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Show credentials"}
                </Button>
                <Button
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => signInAs("finko@au.com", "pro")}
                >
                  {busy === "pro" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in as Pro"}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
