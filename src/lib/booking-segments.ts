export type SlotService = {
  duration_minutes: number;
  buffer_before_min?: number | null;
  buffer_after_min?: number | null;
  gap_min?: number | null;
  active_after_min?: number | null;
};
export type Segment = { start: number; end: number };

export function expandBookingSegments(b: {
  starts_at: string; ends_at: string; gap_min?: number | null; active_after_min?: number | null;
  buffer_before_min?: number | null; buffer_after_min?: number | null;
}): Segment[] {
  const start = new Date(b.starts_at).getTime();
  const end = new Date(b.ends_at).getTime();
  const paddedStart = start - (b.buffer_before_min ?? 0) * 60000;
  const paddedEnd = end + (b.buffer_after_min ?? 0) * 60000;
  if (!b.gap_min || !b.active_after_min) return [{ start: paddedStart, end: paddedEnd }];
  const activeAfterStart = end - b.active_after_min * 60000;
  return [{ start: paddedStart, end: activeAfterStart - b.gap_min * 60000 }, { start: activeAfterStart, end: paddedEnd }];
}

// t is the start of preparation time; the displayed appointment begins after
// buffer_before_min. Keep the processing gap free between the active segments.
export function expandCandidateSegments(t: number, service: SlotService): Segment[] {
  const before = (service.buffer_before_min ?? 0) * 60000;
  const after = (service.buffer_after_min ?? 0) * 60000;
  const duration = service.duration_minutes * 60000;
  if (!service.gap_min || !service.active_after_min) return [{ start: t, end: t + before + duration + after }];
  const firstEnd = t + before + duration;
  const secondStart = firstEnd + service.gap_min * 60000;
  return [{ start: t, end: firstEnd }, { start: secondStart, end: secondStart + service.active_after_min * 60000 + after }];
}

export function segmentsOverlap(a: Segment[], b: Segment[]): boolean {
  return a.some(x => b.some(y => x.start < y.end && x.end > y.start));
}
