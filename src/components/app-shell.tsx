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
  X,
  Plus,
  Sparkles,
  CalendarCheck,
  CreditCard,
  BarChart3,
  UserPlus,
  Upload,
  Package,
  LayoutTemplate,
  HelpCircle,
  ClipboardCheck,
  Gift,
} from "lucide-react";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  useMyBusiness,
  useWorkspaceAccess,
  type WorkspacePermission,
} from "@/lib/business";
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
import { DevUserSwitcher } from "@/components/dev-user-switcher";
import { GlobalSearch } from "@/components/global-search";
import { FeedbackDialog } from "@/components/feedback-dialog";
import { ContactSupportDialog } from "@/components/contact-support-dialog";
import { NotificationsBell } from "@/components/notifications-bell";

type SidebarNavItem = {
  to: string;
  icon: typeof Calendar;
  label: string;
  permission?: WorkspacePermission;
  ownerOnly?: boolean;
};

const NAV_GROUPS: readonly {
  label: string;
  items: readonly SidebarNavItem[];
}[] = [
  {
    label: "Today",
    items: [
      { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
      { to: "/calendar", icon: Calendar, label: "Calendar" },
      { to: "/bookings", icon: CalendarCheck, label: "Bookings" },
    ],
  },
  {
    label: "Clients",
    items: [
      {
        to: "/customers",
        icon: UserCircle,
        label: "Customers",
        permission: "customers.manage",
      },
      {
        to: "/consultations",
        icon: ClipboardCheck,
        label: "Consultations",
        permission: "customers.manage",
      },
    ],
  },
  {
    label: "Team & services",
    items: [
      {
        to: "/staff",
        icon: Users,
        label: "Staff",
        permission: "staff.manage",
      },
      {
        to: "/professionals",
        icon: UserPlus,
        label: "Professionals",
        ownerOnly: true,
      },
      {
        to: "/services",
        icon: Scissors,
        label: "Services",
        permission: "services.manage",
      },
      {
        to: "/stock",
        icon: Package,
        label: "Stock",
        permission: "inventory.manage",
      },
    ],
  },
  {
    label: "Money",
    items: [
      {
        to: "/payments",
        icon: CreditCard,
        label: "Payments",
        ownerOnly: true,
      },
      {
        to: "/gift-cards",
        icon: Gift,
        label: "Gift Cards",
        ownerOnly: true,
      },
      {
        to: "/reports",
        icon: BarChart3,
        label: "Reports",
        permission: "reports.read",
      },
    ],
  },
  {
    label: "Grow",
    items: [
      {
        to: "/assistant",
        icon: Sparkles,
        label: "Assistant",
        ownerOnly: true,
      },
      {
        to: "/page-builder",
        icon: LayoutTemplate,
        label: "Page Builder",
        ownerOnly: true,
      },
    ],
  },
  {
    label: "Workspace",
    items: [
      {
        to: "/settings",
        icon: Settings,
        label: "Settings",
        ownerOnly: true,
      },
      {
        to: "/import",
        icon: Upload,
        label: "Import Data",
        ownerOnly: true,
      },
    ],
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data: biz } = useMyBusiness();
  const { user } = useAuth();
  const access = useWorkspaceAccess();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [calendarFocusMode, setCalendarFocusMode] = useState(false);

  // The calendar owns its focus/full-screen state. Keeping that state here as
  // well lets the mobile shell get out of the way completely while someone is
  // managing a day, rather than leaving the header and floating add button
  // over the booking grid.
  useEffect(() => {
    const onCalendarFocusChange = (event: Event) => {
      setCalendarFocusMode(
        Boolean((event as CustomEvent<{ active?: boolean }>).detail?.active),
      );
    };
    window.addEventListener("bookzenvo:calendar-focus", onCalendarFocusChange);
    return () =>
      window.removeEventListener(
        "bookzenvo:calendar-focus",
        onCalendarFocusChange,
      );
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  };

  const accountName =
    user?.user_metadata?.full_name ||
    (biz?.name ? `${biz.name} Owner` : "Member");
  const initials = (accountName || user?.email || "U")
    .split(" ")
    .map((s: string) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const SidebarContent = (
    <>
      <div className="px-4 pb-4 pt-5">
        <Link
          to="/dashboard"
          className="inline-block px-1 font-display text-xl tracking-tight"
        >
          Bookzenvo<span className="text-[color:var(--gold-deep)]">.</span>
        </Link>
        {biz?.slug && (
          <a
            href={`/book/${biz.slug}`}
            target="_blank"
            rel="noreferrer"
            className="group mt-4 flex items-center justify-between gap-3 rounded-2xl border border-white/60 bg-background/65 px-3.5 py-3 text-left shadow-[0_1px_2px_rgb(0_0_0/0.04),inset_0_1px_0_rgb(255_255_255/0.7)] backdrop-blur-xl transition-[background-color,border-color,transform] duration-150 ease-out hover:border-border hover:bg-background/90 active:scale-[0.985]"
          >
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold tracking-[-0.01em] text-foreground">
                View booking page
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                /book/{biz.slug}
              </span>
            </span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
          </a>
        )}
      </div>

      <nav
        className="flex flex-1 flex-col overflow-y-auto px-3 pb-4 [scrollbar-width:thin]"
        aria-label="Workspace navigation"
      >
        <div className="px-1 pb-2">
          <GlobalSearch />
        </div>
        <div className="px-1 pb-5">
          <NotificationsBell closeOn={mobileOpen} />
        </div>

        <div className="space-y-4">
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter(
              (item) =>
                (!item.ownerOnly || access.isOwner) &&
                (!item.permission || access.can(item.permission)),
            );
            if (items.length === 0) return null;

            return (
              <section key={group.label} aria-label={group.label}>
                <h2 className="mb-1.5 px-3 font-sans text-[13px] font-semibold leading-5 tracking-[-0.01em] text-foreground/60">
                  {group.label}
                </h2>
                <div className="space-y-1">
                  {items.map((item) => {
                    const active =
                      path === item.to ||
                      (item.to !== "/dashboard" && path.startsWith(item.to));
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={() => setMobileOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group relative flex min-h-10 items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-[15px] tracking-[-0.01em] transition-[background-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.985]",
                          active
                            ? "bg-foreground/[0.07] font-semibold text-foreground shadow-[inset_0_0_0_1px_rgb(0_0_0/0.025)]"
                            : "font-medium text-muted-foreground hover:bg-foreground/[0.045] hover:text-foreground",
                        )}
                      >
                        <span
                          className={cn(
                            "grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-[background-color,color,box-shadow] duration-150",
                            active
                              ? "bg-primary/15 text-primary shadow-[inset_0_0_0_1px_rgb(255_255_255/0.3)]"
                              : "text-muted-foreground group-hover:bg-background/70 group-hover:text-foreground",
                          )}
                        >
                          <Icon className="h-[17px] w-[17px]" />
                        </span>
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <div className="mt-5 border-t border-border/50 pt-3">
          <Link
            to="/help"
            onClick={() => setMobileOpen(false)}
            aria-current={path.startsWith("/help") ? "page" : undefined}
            className={cn(
              "group relative flex min-h-10 items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-[15px] font-medium tracking-[-0.01em] transition-[background-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.985]",
              path.startsWith("/help")
                ? "bg-foreground/[0.07] font-semibold text-foreground shadow-[inset_0_0_0_1px_rgb(0_0_0/0.025)]"
                : "text-muted-foreground hover:bg-foreground/[0.045] hover:text-foreground",
            )}
          >
            <span
              className={cn(
                "grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-[background-color,color,box-shadow] duration-150",
                path.startsWith("/help")
                  ? "bg-primary/15 text-primary shadow-[inset_0_0_0_1px_rgb(255_255_255/0.3)]"
                  : "text-muted-foreground group-hover:bg-background/70 group-hover:text-foreground",
              )}
            >
              <HelpCircle className="h-[17px] w-[17px]" />
            </span>
            <span>Help Centre</span>
          </Link>
        </div>
      </nav>

      <div className="border-t border-border/50 p-3">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left transition-[background-color,transform] duration-150 ease-out hover:bg-background/65 active:scale-[0.985]">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-foreground text-xs font-semibold text-background shadow-sm">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{accountName}</div>
              {!access.isOwner && access.role && (
                <div className="text-[10px] capitalize text-muted-foreground">
                  {access.role.replace("_", " ")}
                </div>
              )}
              <div className="text-xs text-muted-foreground truncate">
                {user?.email}
              </div>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="text-xs text-muted-foreground">Signed in as</div>
              <div className="truncate text-sm">{user?.email}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {access.isOwner && (
              <DropdownMenuItem asChild>
                <Link to="/settings">
                  <Settings className="h-4 w-4 mr-2" /> Settings
                </Link>
              </DropdownMenuItem>
            )}
            {biz?.slug && (
              <DropdownMenuItem asChild>
                <a href={`/book/${biz.slug}`} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" /> View booking page
                </a>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={signOut}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="h-4 w-4 mr-2" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <FeedbackDialog />
        <ContactSupportDialog />
        <DevUserSwitcher />
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar — hidden in calendar focus/full-screen mode too.
          calendarFocusMode used to only ever fire on compact viewports (this
          aside is already `hidden` there via xl:flex), so nothing gated it
          before; now the calendar's full-screen toggle uses this same
          overlay on desktop as well, and without this it stayed on screen,
          overlapping the calendar grid underneath the overlay. */}
      {!calendarFocusMode && (
        <aside className="sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border/50 bg-sidebar/85 shadow-[inset_-1px_0_0_rgb(255_255_255/0.45)] backdrop-blur-2xl xl:flex xl:min-h-screen xl:w-[17rem] print:hidden">
          {SidebarContent}
        </aside>
      )}

      {/* Mobile header */}
      {!calendarFocusMode && (
        <div className="xl:hidden fixed top-0 left-0 right-0 z-40 h-14 border-b bg-background/85 backdrop-blur-xl flex items-center justify-between px-4 print:hidden">
          <Link to="/dashboard" className="font-display text-lg">
            Bookzenvo<span className="text-[color:var(--gold-deep)]">.</span>
          </Link>
          <div className="flex items-center gap-1">
            <NotificationsBell variant="icon" closeOn={mobileOpen} />
          </div>
        </div>
      )}

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="xl:hidden fixed inset-0 z-50 animate-in fade-in duration-200">
          <div
            className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute bottom-0 left-0 top-0 flex w-72 flex-col border-r border-border/50 bg-sidebar/95 shadow-2xl backdrop-blur-2xl animate-in slide-in-from-left duration-200">
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

      <main
        className={`flex-1 min-w-0 overflow-x-clip ${calendarFocusMode ? "pt-0 pb-0" : "pt-14 pb-[calc(9rem+env(safe-area-inset-bottom))]"} xl:pt-0 xl:pb-0 print:pt-0 print:pb-0`}
      >
        {children}
      </main>

      {!calendarFocusMode && (
        <div className="print:hidden">
          <MobileBottomNav
            menuOpen={mobileOpen}
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
      )}
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
    <div
      className="flex min-w-0 max-w-full flex-col items-stretch gap-4 mb-8 animate-rise sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
      data-page-header
    >
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-[11px] uppercase tracking-[0.18em] text-primary mb-2">
            {eyebrow}
          </div>
        )}
        <h1
          className="font-sans text-[clamp(2rem,3vw,2.65rem)] font-semibold leading-[1.05] tracking-[-0.035em] text-balance"
          data-page-title
        >
          {title}
        </h1>
        {subtitle && (
          <p
            className="text-muted-foreground mt-2 text-sm text-pretty"
            data-page-subtitle
          >
            {subtitle}
          </p>
        )}
      </div>
      {action && (
        <div
          className="w-full min-w-0 max-w-full shrink-0 sm:w-auto [&>button]:w-full sm:[&>button]:w-auto"
          data-page-header-action
        >
          {action}
        </div>
      )}
    </div>
  );
}

export { Plus };
