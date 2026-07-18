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
  isFocusMode = false,
  onToggleFocusMode,
}: {
  view: View;
  onViewChange: (v: View) => void;
  anchor: Date;
  title: string;
  onToday: () => void;
  onNavigate: (dir: -1 | 1) => void;
  isFocusMode?: boolean;
  onToggleFocusMode?: () => void;
}) {
  // Driven by the shared clock, not a one-shot `new Date()`, so this stays
  // correct even if the tab has been open since before midnight.
  const now = useNow();
  const isOnToday = anchor.toDateString() === now.toDateString();

  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 mb-4 ${isFocusMode ? "mt-0" : "mt-4"}`}>
      <div className="inline-flex rounded-[8px] border bg-card p-1 shadow-soft">
        {(["day", "week", "month"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => onViewChange(v)}
            className={`px-4 py-1.5 text-xs rounded-[6px] capitalize transition-all duration-200 ${
              view === v ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        {onToggleFocusMode && (
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={onToggleFocusMode}
            aria-label={isFocusMode ? "Show calendar summary" : "Focus on calendar"}
            title={isFocusMode ? "Show calendar summary" : "Focus on calendar"}
          >
            {isFocusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        )}
        <Button
          variant={isOnToday ? "default" : "outline"}
          className={`h-9 ${isOnToday ? "shadow-glow" : ""}`}
          onClick={onToday}
          aria-pressed={isOnToday}
        >
          Today
        </Button>
        <div className="inline-flex items-center rounded-[8px] border bg-card shadow-soft">
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-r-none" onClick={() => onNavigate(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[9.5rem] px-2 h-9 flex items-center justify-center border-x text-sm font-medium tabular-nums whitespace-nowrap">
            {title}
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-l-none" onClick={() => onNavigate(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
