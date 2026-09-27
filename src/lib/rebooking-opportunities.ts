/** Pure eligibility rules shared by the server function and fictional-data tests. */
export type RebookingConsent = {
  customer_id: string;
  status: string;
  channel: string;
  source: string;
  granted_at: string | null;
};

export type RebookingVisit = {
  id: string;
  customer_id: string | null;
  customer_name: string | null;
  ends_at: string;
  rebooking_reminder_sent_at: string | null;
  services: {
    id: string;
    name: string;
    rebooking_interval_days: number | null;
  } | null;
};

export type RebookingOpportunity = {
  customerId: string;
  customerName: string;
  serviceName: string;
  lastVisitAt: string;
  dueAt: string;
  draft: string;
};

export function selectRebookingOpportunities(input: {
  now: Date;
  businessName: string;
  consent: RebookingConsent[];
  visits: RebookingVisit[];
  futureCustomerIds: string[];
  limit?: number;
}): RebookingOpportunity[] {
  const eligible = new Set(
    input.consent
      .filter(
        (row) =>
          row.channel === "email" &&
          row.status === "subscribed" &&
          row.source === "booking" &&
          Number.isFinite(Date.parse(row.granted_at ?? "")),
      )
      .map((row) => row.customer_id),
  );
  const future = new Set(input.futureCustomerIds);
  const seen = new Set<string>();
  const result: RebookingOpportunity[] = [];
  const visits = [...input.visits].sort(
    (a, b) => Date.parse(b.ends_at) - Date.parse(a.ends_at),
  );
  for (const visit of visits) {
    const customerId = visit.customer_id;
    if (
      !customerId ||
      !eligible.has(customerId) ||
      future.has(customerId) ||
      seen.has(customerId)
    )
      continue;
    seen.add(customerId); // The latest completed visit controls eligibility; never fall back to older visits.
    const interval = visit.services?.rebooking_interval_days;
    const visitTime = Date.parse(visit.ends_at);
    if (
      !Number.isInteger(interval) ||
      interval! < 7 ||
      interval! > 365 ||
      !Number.isFinite(visitTime)
    )
      continue;
    const dueTime = visitTime + interval! * 86_400_000;
    if (dueTime > input.now.getTime() || visit.rebooking_reminder_sent_at)
      continue;
    const customerName = (visit.customer_name?.trim() || "Customer").slice(
      0,
      80,
    );
    const serviceName = (visit.services?.name.trim() || "appointment").slice(
      0,
      80,
    );
    const businessName = input.businessName.slice(0, 80);
    result.push({
      customerId,
      customerName,
      serviceName,
      lastVisitAt: visit.ends_at,
      dueAt: new Date(dueTime).toISOString(),
      draft: `Hi ${customerName}, it may be time for your next ${serviceName} at ${businessName}. If you'd like to book again, we'd love to see you.`,
    });
    if (result.length >= (input.limit ?? 10)) break;
  }
  return result;
}
