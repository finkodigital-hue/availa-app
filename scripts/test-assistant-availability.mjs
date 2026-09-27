import assert from "node:assert/strict";
import { verifiedAssistantSlots } from "../src/lib/assistant-availability.ts";

const base = {
  now: new Date("2026-03-29T06:00:00Z"), // UK clocks have moved forward.
  timeZone: "Europe/London",
  staff: [{ id: "stylist-1", name: "Fictional Stylist" }],
  services: [{ id: "cut", name: "Cut", duration_minutes: 60, buffer_before_min: 0, buffer_after_min: 0 }],
  serviceStaff: [],
  staffHours: [],
  businessHours: [],
  businessPeriods: [{ weekday: 0, open_time: "09:00", close_time: "12:00" }],
  bookings: [],
  blocks: [],
  holidayClosures: [],
  maxResults: 1,
};

assert.equal(verifiedAssistantSlots(base)[0].startsAt, "2026-03-29T08:00:00.000Z");
assert.equal(verifiedAssistantSlots({
  ...base,
  bookings: [{ staff_id: "stylist-1", status: "confirmed", starts_at: "2026-03-29T08:00:00Z", ends_at: "2026-03-29T09:00:00Z" }],
})[0].startsAt, "2026-03-29T09:00:00.000Z");
assert.equal(verifiedAssistantSlots({
  ...base,
  blocks: [{ staff_id: null, starts_at: "2026-03-29T08:00:00Z", ends_at: "2026-03-29T09:00:00Z" }],
})[0].startsAt, "2026-03-29T09:00:00.000Z");
assert.equal(verifiedAssistantSlots({
  ...base,
  holidayClosures: [{ starts_on: "2026-03-29", ends_on: "2026-03-29" }],
  businessPeriods: [{ weekday: 0, open_time: "09:00", close_time: "12:00" }],
}).length > 0, true); // Later default weekday remains available.
assert.equal(verifiedAssistantSlots({
  ...base,
  staffHours: [{ staff_id: "stylist-1", weekday: 0, closed: true, open_time: null, close_time: null }],
  businessHours: [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, closed: true, open_time: null, close_time: null })),
}).length, 0);
assert.equal(verifiedAssistantSlots({
  ...base,
  serviceStaff: [{ service_id: "cut", staff_id: "another-stylist" }],
}).length, 0);
assert.equal(verifiedAssistantSlots({
  ...base,
  businessPeriods: [{ weekday: 0, open_time: "23:00", close_time: "02:00" }],
  businessHours: [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, closed: true, open_time: null, close_time: null })),
}).length, 0); // Never offer a cross-midnight period unsupported by booking validation.

console.log("Assistant verified availability tests passed");
