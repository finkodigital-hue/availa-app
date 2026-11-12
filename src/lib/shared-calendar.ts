/** Display filtering only. The database RPC remains the access boundary. */
export function sharedCalendarKey(
  businessId: string | undefined,
  linkedBusinessIds: readonly string[],
  start: string,
  end: string,
) {
  return [
    "shared-calendar",
    businessId,
    [...new Set(linkedBusinessIds)].sort().join(","),
    start,
    end,
  ] as const;
}

export function visibleSharedCalendar<
  Staff extends { business_id: string },
  Busy extends { business_id: string },
>(
  data: { staff: Staff[]; busy: Busy[] } | undefined,
  linkedBusinessIds: readonly string[],
  enabled: boolean,
): { staff: Staff[]; busy: Busy[] } {
  if (!enabled || !data) return { staff: [], busy: [] };
  const allowed = new Set(linkedBusinessIds);
  return {
    staff: data.staff.filter((row) => allowed.has(row.business_id)),
    busy: data.busy.filter((row) => allowed.has(row.business_id)),
  };
}
