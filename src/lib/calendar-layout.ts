// Side-by-side layout for overlapping calendar bookings, so a busy staff
// member's appointments never render stacked directly on top of each other.
//
// Overlapping bookings are grouped into clusters (a sweep over start times —
// a booking joins the current cluster whenever it starts before the
// cluster's running max end time), then given a column index within that
// cluster via greedy interval-graph colouring: each booking takes the first
// column whose last booking already ended, or opens a new column.
export type LayoutInterval = { id: string; startMs: number; endMs: number };
export type LayoutSlot = { col: number; cols: number };

export function layoutOverlaps(items: LayoutInterval[]): Map<string, LayoutSlot> {
  const result = new Map<string, LayoutSlot>();
  const sorted = [...items].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  let cluster: LayoutInterval[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (cluster.length === 0) return;
    const columnEnds: number[] = [];
    const colOf = new Map<string, number>();
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
        columnEnds.push(it.endMs);
        colOf.set(it.id, columnEnds.length - 1);
      }
    }
    const cols = columnEnds.length;
    for (const it of cluster) result.set(it.id, { col: colOf.get(it.id)!, cols });
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

  return result;
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
