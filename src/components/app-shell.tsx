import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import {
  Calendar,
  LayoutDashboard,
  Scissors,
  Users,
  UserCircle,
  Settings,
  LogOut,
  ExternalLink,
  Menu,
  X,
  Plus,
  Sparkles,
  CalendarCheck,
  CreditCard,
  BarChart3,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";

const NAV = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/calendar", icon: Calendar, label: "Calendar" },
  { to: "/bookings", icon: CalendarCheck, label: "Bookings" },
  { to: "/customers", icon: UserCircle, label: "Customers" },
  { to: "/staff", icon: Users, label: "Staff" },
  { to: "/services", icon: Scissors, label: "Services" },
  { to: "/payments", icon: CreditCard, label: "Payments" },
  { to: "/reports", icon: BarChart3, label: "Reports" },
  { to: "/assistant", icon: Sparkles, label: "Assistant" },
  { to: "/settings", icon: Settings, label: "Settings" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data: biz } = useMyBusiness();
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  };

  const initials = (user?.user_metadata?.full_name || user?.email || "U")
    .split(" ")
    .map((s: string) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const SidebarContent = (
    <>
      <div className="px-5 pt-6 pb-4">
        <Link to="/dashboard" className="font-display text-xl tracking-tight inline-block">
          Chairly<span className="text-primary">.</span>
        </Link>
        {biz?.slug && (
          <a
            href={`/book/${biz.slug}`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 group flex items-center justify-between gap-2 text-xs rounded-lg border bg-card/60 px-2.5 py-2 text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
          >
            <span className="truncate">/book/{biz.slug}</span>
            <ExternalLink className="h-3 w-3 shrink-0 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </a>
        )}
      </div>

      <nav className="flex flex-col gap-0.5 px-3 flex-1 overflow-y-auto">
        <div className="px-2 pb-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Workspace
        </div>
        {NAV.map((n) => {
          const active = path === n.to || (n.to !== "/dashboard" && path.startsWith(n.to));
          const Icon = n.icon;
          return (
            <Link
              key={n.to}
              to={n.to}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-200",
                active
                  ? "bg-card text-foreground shadow-soft"
                  : "text-muted-foreground hover:text-foreground hover:bg-card/60",
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r-full bg-primary" />
              )}
              <Icon className="h-4 w-4" />
              <span>{n.label}</span>
            </Link>
          );
        })}
        {biz?.slug && (
          <a
            href={`/book/${biz.slug}`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-card/60"
          >
            <ExternalLink className="h-4 w-4" />
            <span>Preview page</span>
          </a>
        )}
      </nav>

      <div className="p-3 border-t border-border/60">
        <DropdownMenu>
          <DropdownMenuTrigger className="w-full flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-card/60 transition-colors text-left">
            <div className="h-9 w-9 shrink-0 rounded-full bg-primary text-primary-foreground grid place-items-center text-xs font-semibold">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">
                {user?.user_metadata?.full_name ?? "Member"}
              </div>
              <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="text-xs text-muted-foreground">Signed in as</div>
              <div className="truncate text-sm">{user?.email}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/settings">
                <Settings className="h-4 w-4 mr-2" /> Settings
              </Link>
            </DropdownMenuItem>
            {biz?.slug && (
              <DropdownMenuItem asChild>
                <a href={`/book/${biz.slug}`} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" /> View booking page
                </a>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4 mr-2" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-60 md:min-h-screen border-r bg-sidebar/70 backdrop-blur flex-col sticky top-0 h-screen">
        {SidebarContent}
      </aside>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 border-b bg-background/85 backdrop-blur-xl flex items-center justify-between px-4">
        <Link to="/dashboard" className="font-display text-lg">
          Chairly<span className="text-primary">.</span>
        </Link>
        <button
          onClick={() => setMobileOpen(true)}
          className="h-9 w-9 grid place-items-center rounded-lg hover:bg-card"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 animate-in fade-in duration-200">
          <div
            className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-sidebar border-r flex flex-col animate-in slide-in-from-left duration-200">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 h-8 w-8 grid place-items-center rounded-lg hover:bg-card"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
            {SidebarContent}
          </div>
        </div>
      )}

      <main className="flex-1 min-w-0 pt-14 md:pt-0 pb-28 md:pb-0">{children}</main>

      <MobileBottomNav
        onMore={() => setMobileOpen(true)}
        onAdd={() => {
          // Dispatch a global event the Calendar listens for. If we're not
          // already on /calendar, navigate first so the listener is mounted.
          if (path.startsWith("/calendar")) {
            window.dispatchEvent(new CustomEvent("luma:new-booking"));
          } else {
            router.navigate({ to: "/calendar", search: { new: 1 } as any });
          }
        }}
      />
    </div>
  );
}


export function PageHeader({
  title,
  subtitle,
  action,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 mb-8 animate-rise">
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-[11px] uppercase tracking-[0.18em] text-primary mb-2">
            {eyebrow}
          </div>
        )}
        <h1 className="font-display text-3xl md:text-4xl tracking-tight text-balance">
          {title}
        </h1>
        {subtitle && (
          <p className="text-muted-foreground mt-2 text-sm text-pretty">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export { Plus };
