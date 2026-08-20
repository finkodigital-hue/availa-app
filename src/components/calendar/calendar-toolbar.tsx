import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useNow } from "./use-now";
import type { View } from "./types";

export function CalendarToolbar({
  view,
  onViewChange,
  anchor,
  title,
  onToday,
  onNavigate,
  isFullscreen = false,
  onToggleFullscreen,
  actions,
}: {
  view: View;
  onViewChange: (v: View) => void;
  anchor: Date;
  title: string;
  onToday: () => void;
  onNavigate: (dir: -1 | 1) => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  // Extra buttons (New booking / Block time) shown here instead — used when
  // the page's normal header is hidden, i.e. while the calendar is
  // fullscreen/focus-mode, since this toolbar stays visible in both.
  actions?: ReactNode;
}) {
  // Driven by the shared clock, not a one-shot `new Date()`, so this stays
  // correct even if the tab has been open since before midnight.
  const now = useNow();
  const isOnToday = anchor.toDateString() === now.toDateString();

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mb-4 mt-4 shrink-0" data-calendar-toolbar>
      <div className="inline-flex rounded-[8px] border bg-card p-1 shadow-soft" data-calendar-view-switcher>
        {(["day", "week", "month"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => onViewChange(v)}
            data-state={view === v ? "active" : "inactive"}
            aria-pressed={view === v}
            className={`px-4 py-1.5 text-xs rounded-[6px] capitalize transition-all duration-200 ${
              view === v ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
      {/* flex-wrap + shrink-0 on every child here on purpose: this row can
          hold up to 5 buttons at once in full screen (Block time, New
          booking, Exit, Today, the date picker). Without flex-wrap they had
          nowhere to go but to flex-shrink below their own content size,
          which let icon+text overflow one button's box and visually collide
          with the next one instead of cleanly dropping to a second line. */}
      <div className="flex flex-wrap items-center justify-end gap-x-1.5 gap-y-2" data-calendar-date-controls>
        {actions}
        {onToggleFullscreen && (
          // Icon-only when not expanded (matches the old look), but a
          // labeled button once expanded — an unlabeled icon squeezed in
          // next to "Block time"/"New booking" was easy to miss as the way
          // back out, especially once it's the *only* way back (the sidebar
          // is hidden in this mode too).
          <Button
            variant="outline"
            size={isFullscreen ? "sm" : "icon"}
            className={isFullscreen ? "h-9 px-3 shrink-0" : "h-9 w-9 shrink-0"}
            onClick={onToggleFullscreen}
            aria-label={isFullscreen ? "Exit calendar full screen" : "Open calendar full screen"}
            title={isFullscreen ? "Exit full screen" : "Full screen"}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4 mr-1.5" /> : <Maximize2 className="h-4 w-4" />}
            {isFullscreen && "Exit"}
          </Button>
        )}
        <Button
          variant={isOnToday ? "default" : "outline"}
          className={`h-9 shrink-0 ${isOnToday ? "shadow-glow" : ""}`}
          onClick={onToday}
          aria-pressed={isOnToday}
        >
          Today
        </Button>
        <div className="inline-flex items-center rounded-[8px] border bg-card shadow-soft shrink-0" data-calendar-date-picker>
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-r-none shrink-0" onClick={() => onNavigate(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[9.5rem] px-2 h-9 flex items-center justify-center border-x text-sm font-medium tabular-nums whitespace-nowrap">
            {title}
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-l-none shrink-0" onClick={() => onNavigate(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
