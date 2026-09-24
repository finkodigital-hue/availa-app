import assert from "node:assert/strict";
import {
  preparationBalance,
  preparationFormSummary,
} from "../src/lib/dashboard-preparation.ts";
const now = Date.parse("2026-09-24T12:00:00Z");
assert.equal(preparationFormSummary(null, now), "Form checks unavailable");
assert.equal(
  preparationFormSummary([], now),
  "No forms linked to this appointment",
);
assert.equal(
  preparationFormSummary(
    [
      { status: "signed", expires_at: null, withdrawn_at: null },
      { status: "pending", expires_at: null, withdrawn_at: null },
      {
        status: "signed",
        expires_at: "2026-09-24T12:00:00Z",
        withdrawn_at: null,
      },
      { status: "signed", expires_at: null, withdrawn_at: "2026-09-23" },
    ],
    now,
  ),
  "1 current signed form · 3 to review",
);
assert.equal(preparationBalance(5000, 1000, "deposit_paid"), 4000);
for (const status of ["paid", "refunded", "partially_refunded"])
  assert.equal(preparationBalance(5000, 0, status), 0);
assert.equal(preparationBalance(1000, 2000, "unpaid"), 0);
console.log("Dashboard preparation summary checks passed.");
