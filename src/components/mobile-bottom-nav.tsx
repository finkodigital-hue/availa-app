import { Link, useRouterState } from "@tanstack/react-router";
import { Calendar, CreditCard, Inbox, Plus, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  onAdd?: () => void;
  onMore?: () => void;
};

const TABS = [
  { to: "/calendar", icon: Calendar, label: "Calendar" },
  { to: "/payments", icon: CreditCard, label: "Sales" },
  { to: "/bookings", icon: Inbox, label: "Inbox" },
] as const;

export function MobileBottomNav({ onAdd, onMore }: Props) {
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <>
      {/* Glass bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 pointer-events-none"
        aria-label="Primary"
      >
        <div
          className="pointer-events-auto mx-3 mb-[max(env(safe-area-inset-bottom),0.5rem)] rounded-3xl border bg-card/70 backdrop-blur-2xl"
          style={{
            boxShadow:
              "0 -1px 0 oklch(1 0 0 / 0.6) inset, 0 18px 40px -18px oklch(0 0 0 / 0.28), 0 4px 12px -4px oklch(0 0 0 / 0.12)",
          }}
        >
          <div className="grid grid-cols-5 items-center h-16 px-1">
            <NavItem item={TABS[0]} active={path.startsWith("/calendar")} />
            <NavItem item={TABS[1]} active={path.startsWith("/payments")} />
            <div aria-hidden /> {/* center spacer for floating + */}
            <NavItem item={TABS[2]} active={path.startsWith("/bookings")} />
            <button
              type="button"
              onClick={onMore}
              aria-label="More menu"
              className="flex flex-col items-center justify-center gap-0.5 h-full min-h-11 min-w-11 text-[10px] text-muted-foreground active:scale-95 transition-transform"
            >
              <MoreHorizontal className="h-5 w-5" />
              <span>More</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Floating Add — separate fixed element so it can never be clipped or
          covered by the bar. Sits above the bar with its own z-index. */}
      <button
        type="button"
        onClick={onAdd}
        aria-label="New booking"
        className="md:hidden fixed left-1/2 -translate-x-1/2 z-50 h-14 w-14 rounded-full grid place-items-center text-primary-foreground bg-primary active:scale-95 transition-transform duration-150"
        style={{
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 2.75rem)",
          boxShadow:
            "0 14px 32px -10px color-mix(in oklab, var(--color-primary) 55%, transparent), 0 6px 14px -4px oklch(0 0 0 / 0.22)",
        }}
      >
        <Plus className="h-6 w-6" strokeWidth={2.4} />
      </button>
    </>
  );
}

function NavItem({
  item,
  active,
}: {
  item: { to: string; icon: any; label: string };
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 h-full min-h-11 min-w-11 text-[10px] transition-colors active:scale-95",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "relative flex items-center justify-center h-7 w-12 rounded-full transition-all",
          active && "bg-primary/12",
        )}
      >
        <Icon className={cn("h-5 w-5 transition-transform", active && "scale-110")} />
      </span>
      <span className={cn(active && "font-medium")}>{item.label}</span>
    </Link>
  );
}
