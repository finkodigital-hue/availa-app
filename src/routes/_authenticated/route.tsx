import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useMyBusiness, useWorkspaceAccess, type WorkspacePermission } from "@/lib/business";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { EmailVerifyGate } from "@/components/email-verify-gate";
import { MfaChallengeGate } from "@/components/mfa-challenge-gate";

export const Route = createFileRoute("/_authenticated")({
    ssr: false,
    head: () => ({
        meta: [{ name: "robots", content: "noindex, nofollow" }],
    }),
    component: Layout,
});

function Layout() {
    const { user, loading, session } = useAuth();
    const navigate = useNavigate();
    const { data: biz, isLoading: bizLoading } = useMyBusiness();
    const [needsMfa, setNeedsMfa] = useState<boolean | null>(null);
    const [verificationError, setVerificationError] = useState(false);
    const [verificationAttempt, setVerificationAttempt] = useState(0);
    const queryClient = useQueryClient();
    const access = useWorkspaceAccess();
    const path = useRouterState({ select: (state) => state.location.pathname });
  
    useEffect(() => {
          if (!loading && !user) navigate({ to: "/auth", replace: true });
    }, [loading, user, navigate]);
  
    useEffect(() => {
          if (!loading && user && !bizLoading && biz === null && window.location.pathname !== "/onboarding") {
                  navigate({ to: "/onboarding", replace: true });
          }
    }, [loading, user, biz, bizLoading, navigate]);

    useEffect(() => {
      if (!biz || access.isLoading || !access.role) return;
      const ownerOnly = ["/settings", "/payments", "/professionals", "/assistant", "/page-builder", "/import"];
      const gated: [string, WorkspacePermission][] = [["/customers","customers.manage"],["/consultations","customers.manage"],["/staff","staff.manage"],["/services","services.manage"],["/stock","inventory.manage"],["/reports","reports.read"]];
      if ((!access.isOwner && ownerOnly.some((p) => path.startsWith(p))) || gated.some(([p, permission]) => path.startsWith(p) && !access.can(permission))) navigate({ to: "/dashboard", replace: true });
    }, [access, biz, navigate, path]);
  
    // A verified TOTP factor requires the session to step up to aal2 before
    // the app unlocks  a fresh password sign-in only reaches aal1. Checked
    // per session (not per navigation) since it doesn't change mid-session.
    useEffect(() => {
          if (loading || !user) return;
          let cancelled = false;
          setNeedsMfa(null);
          setVerificationError(false);
          supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data, error }) => {
                  if (cancelled) return;
                  if (error || !data) return setVerificationError(true);
                  setNeedsMfa(data.nextLevel === "aal2" && data.currentLevel !== "aal2");
          }).catch(() => { if (!cancelled) setVerificationError(true); });
          return () => { cancelled = true; };
    }, [loading, user, session?.access_token, verificationAttempt]);

    if (verificationError) return <main className="min-h-screen grid place-items-center p-6"><div role="alert" className="max-w-sm space-y-4 text-center"><p>We couldn’t verify your account security. Please try again.</p><button className="rounded-lg border px-4 py-2" onClick={() => setVerificationAttempt((value) => value + 1)}>Try again</button></div></main>;
    if (needsMfa) return <MfaChallengeGate onVerified={() => { setNeedsMfa(false); void queryClient.invalidateQueries(); }} />;
  
    if (loading || !user || bizLoading || (!!biz && access.isLoading) || needsMfa === null) {
          return (
                  <div className="min-h-screen grid place-items-center bg-background">
                      <div className="flex flex-col items-center gap-3 animate-rise">
                                  <div className="h-10 w-10 rounded-2xl bg-primary/10 grid place-items-center">
                                                <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                        </div>
                                  <p className="text-xs text-muted-foreground uppercase tracking-[0.18em]">Loading your workspace</p>
              </div>
                    </div>
                );
    }
    if (!user.email_confirmed_at && user.app_metadata?.provider === "email") {
          return <EmailVerifyGate email={user.email} />;
    }
    if (!biz) {
          return <Outlet />;
    }
    return (
          <AppShell>
              <Outlet />
            </AppShell>
        );
}
