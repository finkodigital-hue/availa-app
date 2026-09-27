import assert from "node:assert/strict";
import { selectRebookingOpportunities } from "../src/lib/rebooking-opportunities.ts";

const now = new Date("2026-09-24T12:00:00.000Z");
const consent = (customer_id, overrides = {}) => ({
  customer_id,
  channel: "email",
  status: "subscribed",
  source: "booking",
  granted_at: "2026-06-01T12:00:00.000Z",
  ...overrides,
});
const visit = (customer_id, overrides = {}) => ({
  id: `visit-${customer_id}`,
  customer_id,
  customer_name: customer_id,
  ends_at: "2026-08-01T12:00:00.000Z",
  rebooking_reminder_sent_at: null,
  services: { id: "cut", name: "Haircut", rebooking_interval_days: 42 },
  ...overrides,
});
const base = {
  now,
  businessName: "Fictional Salon",
  futureCustomerIds: [],
  consent: [consent("eligible")],
  visits: [visit("eligible")],
};

const [eligible] = selectRebookingOpportunities(base);
assert.equal(eligible.customerId, "eligible");
assert.equal(eligible.serviceName, "Haircut");
assert.match(eligible.draft, /Fictional Salon/);
assert.equal(
  selectRebookingOpportunities({ ...base, futureCustomerIds: ["eligible"] })
    .length,
  0,
);
assert.equal(
  selectRebookingOpportunities({
    ...base,
    consent: [consent("eligible", { status: "unsubscribed" })],
  }).length,
  0,
);
assert.equal(
  selectRebookingOpportunities({
    ...base,
    consent: [consent("eligible", { source: "salon" })],
  }).length,
  0,
);
assert.equal(
  selectRebookingOpportunities({
    ...base,
    consent: [consent("eligible", { channel: "sms" })],
  }).length,
  0,
);
assert.equal(
  selectRebookingOpportunities({
    ...base,
    consent: [consent("eligible", { granted_at: null })],
  }).length,
  0,
);
assert.equal(
  selectRebookingOpportunities({
    ...base,
    visits: [
      visit("eligible", { rebooking_reminder_sent_at: now.toISOString() }),
    ],
  }).length,
  0,
);
assert.equal(
  selectRebookingOpportunities({
    ...base,
    visits: [visit("eligible", { ends_at: "2026-09-01T12:00:00.000Z" })],
  }).length,
  0,
);
assert.equal(
  selectRebookingOpportunities({
    ...base,
    visits: [visit("eligible", { services: null })],
  }).length,
  0,
);
assert.equal(
  selectRebookingOpportunities({
    ...base,
    visits: [
      visit("eligible", {
        ends_at: "2026-09-20T12:00:00.000Z",
        services: null,
      }),
      visit("eligible"),
    ],
  }).length,
  0,
  "an older visit cannot override the most recent visit",
);
console.log("Rebooking opportunities: fictional eligibility checks passed.");
