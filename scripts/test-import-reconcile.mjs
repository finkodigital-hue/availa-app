import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const exported = {};
const source = fs.readFileSync("src/lib/import/reconcile.ts", "utf8");
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  {
    exports: exported,
    require: () => ({
      normalizeName: (value) =>
        (value ?? "").trim().replace(/\s+/g, " ").toLowerCase(),
    }),
    Map,
    Date,
  },
);

const future = new Date("2030-05-01T10:00:00.000Z");
const end = new Date("2030-05-01T11:00:00.000Z");
const sourceRow = {
  externalId: "booking-1",
  clientName: "Alex Smith",
  staffName: "Sam",
  serviceName: "Cut",
  startsAt: future,
  endsAt: end,
  status: "confirmed",
};
const savedRow = {
  external_id: "booking-1",
  customer_name: "Alex Smith",
  starts_at: future.toISOString(),
  ends_at: end.toISOString(),
  status: "confirmed",
  staff: { name: "Sam" },
  services: { name: "Cut" },
};
const now = new Date("2029-01-01T00:00:00.000Z");

const matched = exported.reconcileUpcomingAppointments(
  [sourceRow],
  [savedRow],
  now,
);
assert.equal(matched.sourceCount, 1);
assert.equal(matched.matched, 1);
assert.equal(matched.issues.length, 0);

const missing = exported.reconcileUpcomingAppointments([sourceRow], [], now);
assert.equal(missing.matched, 0);
assert.equal(missing.issues[0].reason, "missing");

const changed = exported.reconcileUpcomingAppointments(
  [sourceRow],
  [{ ...savedRow, starts_at: "2030-05-01T10:30:00.000Z" }],
  now,
);
assert.equal(changed.issues[0].reason, "different");

const past = exported.reconcileUpcomingAppointments(
  [{ ...sourceRow, startsAt: new Date("2020-01-01T10:00:00.000Z") }],
  [],
  now,
);
assert.equal(past.sourceCount, 0);
const cancelled = exported.reconcileUpcomingAppointments(
  [{ ...sourceRow, status: "cancelled" }],
  [],
  now,
);
assert.equal(cancelled.sourceCount, 0);

const duplicatedIdentity = exported.reconcileUpcomingAppointments(
  [sourceRow, { ...sourceRow, clientName: "Another client" }],
  [savedRow],
  now,
);
assert.equal(duplicatedIdentity.sourceCount, 2);
assert.equal(duplicatedIdentity.matched, 1);
assert.equal(duplicatedIdentity.issues[0].reason, "different");

console.log(
  "Import reconciliation checks passed: matching, missing, changed, duplicate, past and cancelled bookings.",
);
