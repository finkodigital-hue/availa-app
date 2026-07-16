export type View = "day" | "week" | "month";

// Pointer-driven drag state for the day view — lifted to DayView so a move
// can be hit-tested against any staff column, not just the one it started in.
export type DragMode = "move" | "resize-start" | "resize-end";
export type DragState = {
  id: string;
  mode: DragMode;
  originStaffId: string;
  startClientY: number;
  origTop: number;
  origHeight: number;
  origStartIso: string;
  origEndIso: string;
  currentStaffId: string;
  currentTop: number;
  currentHeight: number;
  currentStartIso: string;
  currentEndIso: string;
  customerName: string;
};
