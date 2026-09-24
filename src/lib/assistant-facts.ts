export type AssistantVisit = {
  id: string;
  startsAt: string;
  customer: string;
  service: string;
  staff: string;
  status: string;
  paymentStatus: string;
  priceCents: number;
  paidCents: number;
};

export type AssistantPayment = {
  type: string;
  amountCents: number;
  currency: string;
};

export type AssistantService = {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
};

export type AssistantFactsInput = {
  asOf: string;
  businessName: string;
  timeZone: string;
  currency: string;
  today: AssistantVisit[];
  todayCount: number;
  upcoming: AssistantVisit[];
  upcomingCount: number;
  recent: { serviceId: string | null; status: string }[];
  recentCount: number;
  payments: AssistantPayment[];
  paymentsCount: number;
  services: AssistantService[];
  servicesCount: number;
  reviewRequestsEnabled?: boolean;
  verifiedSlots?: { startsAt: string; staff: string; service: string }[] | null;
  availabilityNote?: string;
};

export function assistantFacts(input: AssistantFactsInput) {
  const currentCurrency = input.currency.toLowerCase();
  const paymentCoverageComplete = input.payments.length === input.paymentsCount;
  const mismatchedCurrency = input.payments.some(
    (payment) => payment.currency.toLowerCase() !== currentCurrency,
  );
  const stripeNetCents =
    paymentCoverageComplete && !mismatchedCurrency
      ? input.payments.reduce(
          (sum, payment) =>
            sum +
            (payment.type === "charge"
              ? payment.amountCents
              : payment.type === "refund"
                ? -payment.amountCents
                : 0),
          0,
        )
      : null;

  const activeToday = input.today.filter(
    (visit) => !["cancelled", "no_show"].includes(visit.status),
  );
  const needsAttention = activeToday
    .filter(
      (visit) =>
        visit.status === "pending" ||
        visit.paymentStatus === "failed" ||
        (visit.status === "completed" &&
          !["paid", "refunded", "partially_refunded"].includes(
            visit.paymentStatus,
          ) &&
          visit.priceCents > visit.paidCents),
    )
    .slice(0, 12)
    .map((visit) => ({
      bookingId: visit.id,
      customer: visit.customer,
      startsAt: visit.startsAt,
      reason:
        visit.paymentStatus === "failed"
          ? "payment failed"
          : visit.status === "pending"
            ? "booking pending confirmation"
            : "completed booking with an outstanding balance",
    }));

  const serviceNames = new Map(
    input.services.map((service) => [service.id, service.name]),
  );
  const serviceCounts = new Map<string, number>();
  for (const visit of input.recent) {
    if (!visit.serviceId || visit.status === "cancelled") continue;
    serviceCounts.set(
      visit.serviceId,
      (serviceCounts.get(visit.serviceId) ?? 0) + 1,
    );
  }

  return {
    asOfUtc: input.asOf,
    business: input.businessName,
    timezone: input.timeZone,
    currency: input.currency,
    today: {
      total: input.todayCount,
      listed: input.today.length,
      appointments: activeToday.slice(0, 20).map((visit) => ({
        bookingId: visit.id,
        startsAt: visit.startsAt,
        customer: visit.customer,
        service: visit.service,
        staff: visit.staff,
        status: visit.status,
        paymentStatus: visit.paymentStatus,
        appointmentBalanceCents: Math.max(
          0,
          visit.priceCents - visit.paidCents,
        ),
      })),
      needsAttention,
    },
    next14Days: {
      total: input.upcomingCount,
      listed: input.upcoming.length,
      firstAppointments: input.upcoming.slice(0, 12).map((visit) => ({
        bookingId: visit.id,
        startsAt: visit.startsAt,
        service: visit.service,
        staff: visit.staff,
      })),
    },
    past30Days: {
      bookingCount: input.recentCount,
      bookingRowsAvailable: input.recent.length,
      topServices:
        input.recent.length === input.recentCount &&
        input.services.length === input.servicesCount
          ? [...serviceCounts.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([id, count]) => ({
                name: serviceNames.get(id) ?? "Archived service",
                count,
              }))
          : null,
      confirmedStripeNetCents: stripeNetCents,
      stripePaymentRows: input.paymentsCount,
    },
    activeServices: input.services.slice(0, 30).map((service) => ({
      name: service.name,
      durationMinutes: service.durationMinutes,
      currentPriceCents: service.priceCents,
    })),
    reviewRequestsEnabled: input.reviewRequestsEnabled ?? null,
    next7DaysVerifiedSlots:
      input.verifiedSlots === undefined ? null : input.verifiedSlots,
    availabilityNote:
      input.availabilityNote ??
      "Verified slots are unavailable. Check Calendar before sharing a time.",
    limitations: [
      "Appointment balance is price minus recorded amount paid, not a verified charge or refund ledger.",
      "Confirmed Stripe net includes succeeded charges minus refunds in the past 30 days only; it excludes cash, gift cards and other offline sales.",
      "Only next7DaysVerifiedSlots were checked against working hours, service/staff eligibility, existing appointments and blocked time. They may change; recheck Calendar before promising a slot. Null means availability could not be verified.",
      "No customer email addresses, consultation answers or private notes are included.",
      "A truncated list is not a complete report; use total and listed counts to identify truncation.",
    ],
  };
}
