import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { Calendar, LayoutDashboard, Scissors, Users, UserCircle, Settings, LogOut, ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Overview" },
  { to: "/calendar", icon: Calendar, label: "Calendar" },
  { to: "/services", icon: Scissors, label: "Services" },
  { to: "/staff", icon: Users, label: "Staff" },
  { to: "/customers", icon: UserCircle, label: "Customers" },
  { to: "/settings", icon: Settings, label: "Settings" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data: biz } = useMyBusiness();

  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      <aside className="md:w-64 md:min-h-screen md:border-r border-b md:border-b-0 bg-sidebar/60 backdrop-blur flex md:flex-col">
        <div className="px-5 py-5 md:py-7 flex md:block items-center justify-between md:justify-start gap-3 w-full md:w-auto">
          <Link to="/dashboard" className="font-display text-xl tracking-tight">
            Atelier<span className="text-primary">.</span>
          </Link>
          {biz?.slug && (
            <a
              href={`/book/${biz.slug}`}
              target="_blank"
              rel="noreferrer"
              className="hidden md:flex mt-3 text-xs text-muted-foreground items-center gap-1.5 hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" /> /book/{biz.slug}
            </a>
          )}
        </div>
        <nav className="flex md:flex-col md:gap-1 px-2 md:px-3 pb-3 overflow-x-auto md:overflow-visible flex-1">
          {NAV.map((n) => {
            const active = path.startsWith(n.to);
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-xl text-sm whitespace-nowrap transition-colors",
                  active
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/60"
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{n.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="hidden md:block p-3 border-t">
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={signOut}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-8">
      <div>
        <h1 className="font-display text-3xl md:text-4xl">{title}</h1>
        {subtitle && <p className="text-muted-foreground mt-1.5 text-sm">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
