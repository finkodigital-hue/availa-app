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
      {/* Spacer so content isn't hidden behind the bar */}
      <div className="md:hidden h-24" aria-hidden />

      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 pb-[env(safe-area-inset-bottom)]"
        aria-label="Primary"
      >
        {/* Floating add button */}
        <button
          onClick={onAdd}
          aria-label="New booking"
          className="absolute left-1/2 -translate-x-1/2 -top-7 h-14 w-14 rounded-full grid place-items-center text-primary-foreground bg-primary shadow-glow active:scale-95 transition-transform duration-150"
          style={{ boxShadow: "0 12px 28px -8px color-mix(in oklab, var(--color-primary) 55%, transparent), 0 4px 10px -2px oklch(0 0 0 / 0.18)" }}
        >
          <Plus className="h-6 w-6" strokeWidth={2.4} />
        </button>

        <div
          className="mx-2 rounded-t-3xl border border-b-0 bg-card/75 backdrop-blur-xl"
          style={{ boxShadow: "0 -8px 24px -10px oklch(0 0 0 / 0.18)" }}
        >
          <div className="grid grid-cols-5 items-end h-16 px-2">
            <NavItem item={TABS[0]} active={path.startsWith("/calendar")} />
            <NavItem item={TABS[1]} active={path.startsWith("/payments")} />
            <div /> {/* center spacer for floating + */}
            <NavItem item={TABS[2]} active={path.startsWith("/bookings")} />
            <button
              onClick={onMore}
              className="flex flex-col items-center justify-center gap-0.5 h-full text-[10px] text-muted-foreground active:scale-95 transition-transform"
            >
              <MoreHorizontal className="h-5 w-5" />
              <span>More</span>
            </button>
          </div>
        </div>
      </nav>
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
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 h-full text-[10px] transition-colors active:scale-95",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <span className={cn("relative flex items-center justify-center h-7 w-12 rounded-full transition-colors", active && "bg-primary/12")}>
        <Icon className={cn("h-5 w-5 transition-transform", active && "scale-110")} />
      </span>
      <span className={cn(active && "font-medium")}>{item.label}</span>
    </Link>
  );
}
