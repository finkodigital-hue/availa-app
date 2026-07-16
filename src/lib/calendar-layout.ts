// Side-by-side layout for overlapping calendar bookings, so a busy staff
// member's appointments never render stacked directly on top of each other.
//
// Overlapping bookings are grouped into clusters (a sweep over start times —
// a booking joins the current cluster whenever it starts before the
// cluster's running max end time), then given a column index within that
// cluster via greedy interval-graph colouring: each booking takes the first
// column whose last booking already ended, or opens a new column.
//
// Real-world overlap depth (checked against the actual imported dataset —
// 40k+ bookings across 18 staff) is almost always 1-3 concurrent bookings
// per staff, occasionally 4; genuine 5+ only ever occurs when several
// different staff members' bookings are pooled into one shared column (e.g.
// Week view's per-day column). Splitting a cluster into more than a
// few columns makes every column too narrow to read, so beyond
// MAX_REAL_COLS individually-placed columns, the rest are grouped into a
// single overflow slot the UI renders as a "+N" chip instead of shrinking
// everything into unreadable slivers.
export type LayoutInterval = { id: string; startMs: number; endMs: number };
export type LayoutSlot = { col: number; cols: number };
export type OverflowGroup = { col: number; cols: number; startMs: number; endMs: number; ids: string[] };

const DEFAULT_MAX_REAL_COLS = 3;

// `maxRealCols` is tunable per caller: Day view's staff columns are wide
// enough for 3 real side-by-side slots to stay readable, but Week view
// pools every staff member into one narrower per-day column, where even 3
// columns leaves too little width to show a name — so it calls this with a
// lower cap and pushes more into the overflow chip sooner.
export function layoutOverlaps(
  items: LayoutInterval[],
  maxRealCols: number = DEFAULT_MAX_REAL_COLS,
): { slots: Map<string, LayoutSlot>; overflow: OverflowGroup[] } {
  const slots = new Map<string, LayoutSlot>();
  const overflow: OverflowGroup[] = [];
  const sorted = [...items].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  let cluster: LayoutInterval[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (cluster.length === 0) return;
    const columnEnds: number[] = [];
    const colOf = new Map<string, number>();
    const overflowIds: string[] = [];
    for (const it of cluster) {
      let placed = false;
      for (let c = 0; c < columnEnds.length; c++) {
        if (columnEnds[c] <= it.startMs) {
          columnEnds[c] = it.endMs;
          colOf.set(it.id, c);
          placed = true;
          break;
        }
      }
      if (!placed) {
        if (columnEnds.length < maxRealCols) {
          columnEnds.push(it.endMs);
          colOf.set(it.id, columnEnds.length - 1);
        } else {
          overflowIds.push(it.id);
        }
      }
    }
    const hasOverflow = overflowIds.length > 0;
    const cols = hasOverflow ? maxRealCols + 1 : Math.max(columnEnds.length, 1);
    for (const it of cluster) {
      const col = colOf.get(it.id);
      if (col !== undefined) slots.set(it.id, { col, cols });
    }
    if (hasOverflow) {
      let startMs = Infinity;
      let endMs = -Infinity;
      for (const id of overflowIds) {
        const it = cluster.find((x) => x.id === id)!;
        startMs = Math.min(startMs, it.startMs);
        endMs = Math.max(endMs, it.endMs);
      }
      overflow.push({ col: maxRealCols, cols, startMs, endMs, ids: overflowIds });
    }
    cluster = [];
  };

  for (const it of sorted) {
    if (cluster.length === 0 || it.startMs < clusterEnd) {
      cluster.push(it);
      clusterEnd = Math.max(clusterEnd, it.endMs);
    } else {
      flush();
      cluster.push(it);
      clusterEnd = it.endMs;
    }
  }
  flush();

  return { slots, overflow };
}

// CSS left/width for a slot, keeping the same outer edge padding a
// full-width booking used (EDGE px each side) with a small GAP between
// side-by-side siblings.
const EDGE = 6;
const GAP = 4;

export function packedStyle(slot: LayoutSlot | undefined): { left: string; width: string } {
  const { col, cols } = slot ?? { col: 0, cols: 1 };
  const usable = `(100% - ${2 * EDGE}px - ${(cols - 1) * GAP}px)`;
  const width = `calc(${usable} / ${cols})`;
  const left = col === 0 ? `${EDGE}px` : `calc(${EDGE}px + ${col} * (${width} + ${GAP}px))`;
  return { left, width };
}
