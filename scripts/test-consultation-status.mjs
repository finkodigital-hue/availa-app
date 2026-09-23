import assert from "node:assert/strict";
import { consultationStatus } from "../src/lib/consultation-status.ts";

const now = Date.parse("2026-09-23T12:00:00Z");
const signed = { status: "signed" };
assert.equal(consultationStatus(signed, now).label, "Signed");
assert.equal(consultationStatus({ status: "pending" }, now).attention, true);
assert.equal(
  consultationStatus({ status: "withdrawn" }, now).label,
  "Consent withdrawn",
);
assert.equal(
  consultationStatus({ ...signed, expires_at: "2026-09-23T12:00:00Z" }, now)
    .label,
  "Expired",
);
assert.equal(
  consultationStatus({ ...signed, expires_at: "2026-09-24T12:00:00Z" }, now)
    .attention,
  false,
);
const patch = { ...signed, template_snapshot: { kind: "patch_test" } };
assert.equal(consultationStatus(patch, now).label, "Result needed");
assert.equal(
  consultationStatus({ ...patch, patch_test_outcome: "failed" }, now).attention,
  true,
);
assert.equal(
  consultationStatus({ ...patch, patch_test_outcome: "retest_required" }, now)
    .label,
  "Retest required",
);
assert.equal(
  consultationStatus({ ...patch, patch_test_outcome: "passed" }, now).label,
  "Pass recorded",
);
assert.equal(
  consultationStatus(
    { ...patch, patch_test_outcome: "passed", expires_at: "2026-09-22" },
    now,
  ).label,
  "Expired",
);
assert.equal(
  consultationStatus(
    { ...signed, consultation_templates: [{ kind: "patch_test" }] },
    now,
  ).attention,
  true,
);
console.log("11 consultation status checks passed.");
