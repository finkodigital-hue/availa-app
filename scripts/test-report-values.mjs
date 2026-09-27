import assert from "node:assert/strict";
import {
  displayedBookingCollection,
  netCollected,
} from "../src/lib/report-values.ts";

assert.equal(
  netCollected({ amount_paid_cents: 5000, amount_refunded_cents: 0 }),
  5000,
);
assert.equal(
  netCollected({ amount_paid_cents: 5000, amount_refunded_cents: 1250 }),
  3750,
);
assert.equal(
  netCollected({ amount_paid_cents: 5000, amount_refunded_cents: 5000 }),
  0,
);
assert.equal(
  netCollected({ amount_paid_cents: null, amount_refunded_cents: null }),
  0,
);
assert.equal(
  netCollected({ amount_paid_cents: 1000, amount_refunded_cents: 1500 }),
  0,
);
assert.equal(
  displayedBookingCollection({
    payment_status: "paid",
    price_cents: 5000,
    amount_paid_cents: 0,
    amount_refunded_cents: 0,
  }),
  5000,
);
assert.equal(
  displayedBookingCollection({
    payment_status: "refunded",
    price_cents: 5000,
    amount_paid_cents: 5000,
    amount_refunded_cents: 5000,
  }),
  0,
);
assert.equal(
  displayedBookingCollection({
    payment_status: "partially_refunded",
    price_cents: 5000,
    amount_paid_cents: 5000,
    amount_refunded_cents: 1200,
  }),
  3800,
);

console.log("8 report and payment reconciliation checks passed.");
