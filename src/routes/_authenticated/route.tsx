import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useMyBusiness } from "@/lib/business";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: Layout,
});

function Layout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { data: biz, isLoading: bizLoading } = useMyBusiness();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!loading && user && !bizLoading && biz === null && window.location.pathname !== "/onboarding") {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [loading, user, biz, bizLoading, navigate]);

  if (loading || !user || bizLoading) {
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
  if (!biz) {
    return <Outlet />;
  }
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
