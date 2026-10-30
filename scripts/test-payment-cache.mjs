import assert from "node:assert/strict";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { invalidatePaymentViews } from "../src/lib/payment-cache.ts";

const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
});
let paid = 0;
const key = ["payments", "fictional-business", 0];
const observer = new QueryObserver(client, {
  queryKey: key,
  queryFn: async () => ({ collected: paid }),
});
const unsubscribe = observer.subscribe(() => {});
await observer.refetch();
assert.equal(client.getQueryData(key).collected, 0);
const inactiveKeys = [
  "payments-totals",
  "booking-payment-history",
  "booking-details",
  "calendar",
  "bookings-list",
  "dashboard-overview",
  "report-bookings",
  "daily-takings",
  "takings-unpaid",
];
for (const prefix of inactiveKeys)
  client.setQueryData([prefix, "fictional-business"], { collected: 0 });
client.setQueryData(["services", "fictional-business"], ["Haircut"]);
paid = 6500; // Database confirmation arrives after the list was cached.
await invalidatePaymentViews(client);
assert.equal(
  client.getQueryData(key).collected,
  6500,
  "Reopening a booking uses the refetched paid balance",
);
for (const prefix of inactiveKeys)
  assert.equal(
    client.getQueryState([prefix, "fictional-business"]).isInvalidated,
    true,
    `${prefix} must reload on next visit`,
  );
assert.equal(
  client.getQueryState(["services", "fictional-business"]).isInvalidated,
  false,
);
paid = 0; // A refund must refresh the same active balance views.
await invalidatePaymentViews(client);
assert.equal(client.getQueryData(key).collected, 0);
unsubscribe();
client.clear();
console.log(
  "Payment cache regression passed: active balances refetch, inactive reports become stale, unrelated services remain cached.",
);
