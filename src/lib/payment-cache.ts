import type { QueryClient } from "@tanstack/react-query";

/** Refresh every cached view of a booking balance after database confirmation. */
export async function invalidatePaymentViews(client: QueryClient) {
  await Promise.all(
    [
      "payments",
      "payments-totals",
      "booking-payment-history",
      "booking-details",
      "calendar",
      "bookings-list",
      "dashboard-overview",
      "report-bookings",
      "daily-takings",
      "takings-unpaid",
    ].map((key) => client.invalidateQueries({ queryKey: [key] })),
  );
}
