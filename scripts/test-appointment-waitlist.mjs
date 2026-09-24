import assert from "node:assert/strict";
import { requestMatchesCancelledSlot, salonDateWindow } from "../src/lib/appointment-waitlist.ts";

assert.deepEqual(salonDateWindow("2026-03-29", "2026-03-29", "Europe/London"), {
  after: "2026-03-29T00:00:00.000Z",
  before: "2026-03-29T23:00:00.000Z",
});
assert.deepEqual(salonDateWindow("2026-10-25", "2026-10-25", "Europe/London"), {
  after: "2026-10-24T23:00:00.000Z",
  before: "2026-10-26T00:00:00.000Z",
});
assert.throws(() => salonDateWindow("2026-02-30", "2026-03-01", "UTC"));

const request = { id: "r", service_id: "colour", preferred_staff_id: "s1",
  preferred_after: "2026-10-24T23:00:00Z", preferred_before: "2026-10-26T00:00:00Z",
  preferred_time: "morning", status: "active" };
const slot = { id: "b", service_id: "colour", staff_id: "s1",
  starts_at: "2026-10-25T10:00:00Z", ends_at: "2026-10-25T11:00:00Z" };
const now = new Date("2026-10-24T00:00:00Z");
assert.equal(requestMatchesCancelledSlot(request, slot, "Europe/London", now), true);
assert.equal(requestMatchesCancelledSlot({ ...request, service_id: "cut" }, slot, "Europe/London", now), false);
assert.equal(requestMatchesCancelledSlot({ ...request, preferred_staff_id: "s2" }, slot, "Europe/London", now), false);
assert.equal(requestMatchesCancelledSlot({ ...request, preferred_time: "evening" }, slot, "Europe/London", now), false);
assert.equal(requestMatchesCancelledSlot({ ...request, status: "closed" }, slot, "Europe/London", now), false);
assert.equal(requestMatchesCancelledSlot(request, { ...slot, starts_at: "2026-10-27T10:00:00Z" }, "Europe/London", now), false);
console.log("Appointment waitlist matching tests passed");
