import assert from "node:assert/strict";
import {
  aggregateDailyTakings,
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

const takings = aggregateDailyTakings(
  [
    {
      type: "charge",
      status: "succeeded",
      amount_cents: 5000,
      currency: "gbp",
      payment_method: "card",
    },
    {
      type: "refund",
      status: "succeeded",
      amount_cents: 1200,
      currency: "GBP",
      payment_method: "card",
    },
    {
      type: "charge",
      status: "succeeded",
      amount_cents: 3000,
      currency: "GBP",
      payment_method: "cash",
    },
    {
      type: "failure",
      status: "failed",
      amount_cents: 9000,
      currency: "GBP",
      payment_method: "card",
    },
    {
      type: "charge",
      status: "pending",
      amount_cents: 7000,
      currency: "GBP",
      payment_method: "card",
    },
    {
      type: "refund",
      status: "succeeded",
      amount_cents: 2500,
      currency: "USD",
      payment_method: "card",
    },
  ],
  "GBP",
);
assert.deepEqual(takings, [
  {
    currency: "GBP",
    card: { received: 5000, refunded: 1200, net: 3800 },
    cash: { received: 3000, refunded: 0, net: 3000 },
    total: { received: 8000, refunded: 1200, net: 6800 },
  },
  {
    currency: "USD",
    card: { received: 0, refunded: 2500, net: -2500 },
    cash: { received: 0, refunded: 0, net: 0 },
    total: { received: 0, refunded: 2500, net: -2500 },
  },
]);
assert.throws(
  () =>
    aggregateDailyTakings([
      {
        type: "charge",
        status: "succeeded",
        amount_cents: -1,
        currency: "GBP",
        payment_method: "cash",
      },
    ]),
  /invalid amount/,
);
assert.throws(
  () =>
    aggregateDailyTakings([
      {
        type: "charge",
        status: "succeeded",
        amount_cents: 1,
        currency: "GBP",
        payment_method: "voucher",
      },
    ]),
  /unsupported payment method/,
);

console.log(
  "11 report, daily takings and payment reconciliation checks passed.",
);
