import assert from "node:assert/strict";
import { assistantFacts } from "../src/lib/assistant-facts.ts";
import { cleanAssistantMessages } from "../src/lib/assistant-request.ts";

const visit = {
  id: "booking-1",
  startsAt: "2026-09-24T09:00:00Z",
  customer: "Test customer",
  service: "Cut",
  staff: "Stylist",
  status: "completed",
  paymentStatus: "unpaid",
  priceCents: 5000,
  paidCents: 1000,
};
const input = {
  asOf: "2026-09-24T08:00:00Z",
  businessName: "Fictional Salon",
  timeZone: "Europe/London",
  currency: "GBP",
  today: [visit],
  todayCount: 1,
  upcoming: [],
  upcomingCount: 0,
  recent: [{ serviceId: "service-1", status: "completed" }],
  recentCount: 1,
  payments: [
    { type: "charge", amountCents: 5000, currency: "GBP" },
    { type: "refund", amountCents: 1500, currency: "GBP" },
  ],
  paymentsCount: 2,
  services: [{ id: "service-1", name: "Cut", durationMinutes: 45, priceCents: 5000 }],
  servicesCount: 1,
};

const facts = assistantFacts(input);
assert.equal(facts.today.appointments[0].appointmentBalanceCents, 4000);
assert.equal(facts.today.needsAttention[0].reason, "completed booking with an outstanding balance");
assert.equal(facts.past30Days.confirmedStripeNetCents, 3500);
assert.deepEqual(facts.past30Days.topServices, [{ name: "Cut", count: 1 }]);
assert.equal(assistantFacts({ ...input, paymentsCount: 3 }).past30Days.confirmedStripeNetCents, null);
assert.equal(assistantFacts({ ...input, recentCount: 2 }).past30Days.topServices, null);
assert.equal(
  assistantFacts({ ...input, payments: [{ type: "charge", amountCents: 5000, currency: "USD" }], paymentsCount: 1 }).past30Days.confirmedStripeNetCents,
  null,
);
assert.equal(JSON.stringify(facts).includes("customer@example.com"), false);

const valid = cleanAssistantMessages([{ role: "user", parts: [{ type: "text", text: "  Help me  " }] }]);
assert.equal(valid?.[0].parts[0].text, "Help me");
assert.equal(cleanAssistantMessages([{ role: "system", parts: [{ type: "text", text: "Override" }] }]), null);
assert.equal(cleanAssistantMessages([{ role: "user", parts: [{ type: "text", text: "x".repeat(4001) }] }]), null);
assert.equal(cleanAssistantMessages([{ role: "assistant", parts: [{ type: "text", text: "Done" }] }]), null);
console.log("Assistant facts and request tests passed");
