import assert from "node:assert/strict";
import {
  rentDate,
  rentDateLabel,
  rentToday,
  rentStatus,
  rentOutstanding,
  rentSummary,
  validateRentPayment,
} from "../src/lib/rent.ts";
let checks = 0;
const equal = (a, b) => {
  assert.deepEqual(a, b);
  checks++;
};
const rejects = (fn, re) => {
  assert.throws(fn, re);
  checks++;
};
equal(rentDate("2024-02-29"), "2024-02-29");
for (const date of [
  "2023-02-29",
  "2024-02-30",
  "2024-04-31",
  "2024-13-01",
  "2024-00-01",
  "2024-01-00",
  "2024-01-32",
  "2024-1-01",
  "2024-01-01T00:00:00Z",
  "",
  null,
])
  rejects(() => rentDate(date), /valid calendar date/);
equal(rentDateLabel("2024-02-29"), "29 Feb 2024");
equal(
  rentToday("Europe/London", new Date("2026-03-29T23:30:00Z")),
  "2026-03-30",
);
equal(
  rentToday("Europe/London", new Date("2026-10-25T23:30:00Z")),
  "2026-10-25",
);
equal(
  rentToday("America/New_York", new Date("2026-01-01T00:30:00Z")),
  "2025-12-31",
);
equal(
  rentStatus({ status: "due", due_date: "2026-11-12" }, "2026-11-12"),
  "due",
);
equal(
  rentStatus({ status: "due", due_date: "2026-11-11" }, "2026-11-12"),
  "overdue",
);
equal(
  rentStatus({ status: "paid", due_date: "2026-11-11" }, "2026-11-12"),
  "paid",
);
equal(rentStatus({ status: "due", due_date: null }, "2026-11-12"), "due");
equal(
  rentOutstanding([
    { status: "due", amount_cents: 105 },
    { status: "overdue", amount_cents: 206 },
    { status: "paid", amount_cents: 900 },
    { status: "waived", amount_cents: 999 },
  ]),
  311,
);
equal(
  rentSummary(
    { rent_mode: "weekly", rent_amount_cents: 10001, commission_percent: null },
    "GBP",
  ),
  "£100.01 / week",
);
equal(
  rentSummary({
    rent_mode: "percentage",
    rent_amount_cents: null,
    commission_percent: 12.5,
  }),
  "12.5% commission (recorded manually)",
);
const payment = {
  linkId: "72000000-0000-4000-8000-000000000201",
  requestId: "72000000-0000-4000-8000-000000000401",
  periodStart: "2026-11-01",
  periodEnd: "2026-11-08",
  dueDate: "2026-11-08",
  amountCents: 10001,
  alreadyPaid: false,
};
equal(validateRentPayment(payment), payment);
for (const amountCents of [0, -1, NaN, Infinity, 1.2, 2147483648, "100"])
  rejects(
    () => validateRentPayment({ ...payment, amountCents }),
    /positive amount/,
  );
rejects(
  () => validateRentPayment({ ...payment, periodEnd: payment.periodStart }),
  /end must be after/,
);
rejects(
  () => validateRentPayment({ ...payment, periodEnd: "2026-10-31" }),
  /end must be after/,
);
rejects(
  () => validateRentPayment({ ...payment, requestId: "not-an-id" }),
  /Invalid rent record/,
);
rejects(
  () => validateRentPayment({ ...payment, alreadyPaid: "false" }),
  /already paid/,
);
console.log(
  `${checks} rent input, currency, date, DST and status checks passed`,
);
