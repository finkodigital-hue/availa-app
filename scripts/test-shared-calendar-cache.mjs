import assert from "node:assert/strict";
import { QueryClient, QueryObserver } from "@tanstack/query-core";
import {
  sharedCalendarKey,
  visibleSharedCalendar,
} from "../src/lib/shared-calendar.ts";

const client = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});
const data = {
  staff: [
    { id: "staff-a", business_id: "a" },
    { id: "staff-b", business_id: "b" },
  ],
  busy: [
    { id: "booking-a", business_id: "a", kind: "booking" },
    { id: "block-a", business_id: "a", kind: "block" },
    { id: "booking-b", business_id: "b", kind: "booking" },
    { id: "block-b", business_id: "b", kind: "block" },
  ],
};
const key = sharedCalendarKey("salon", ["b", "a"], "start", "end");
client.setQueryData(key, data);
// Exercise actual Query behaviour: disabling does not discard data. Rendering
// must reject withdrawn memberships even when an earlier result still exists.
const observer = new QueryObserver(client, {
  queryKey: key,
  enabled: false,
  queryFn: async () => data,
});
const cached = observer.getCurrentResult().data;
assert.equal(cached.busy.length, 4);
assert.deepEqual(visibleSharedCalendar(cached, [], true), {
  staff: [],
  busy: [],
});
const reduced = visibleSharedCalendar(cached, ["b"], true);
assert.deepEqual(
  reduced.staff.map((s) => s.id),
  ["staff-b"],
);
assert.deepEqual(
  reduced.busy.map((s) => s.id),
  ["booking-b", "block-b"],
);
// Plan loss or a failed permissions refresh hides all three rendered kinds.
assert.deepEqual(visibleSharedCalendar(cached, ["a", "b"], false), {
  staff: [],
  busy: [],
});
assert.deepEqual(visibleSharedCalendar(undefined, ["a"], true), {
  staff: [],
  busy: [],
});
assert.deepEqual(visibleSharedCalendar(cached, ["a", "b"], true), data);
assert.deepEqual(
  key,
  sharedCalendarKey("salon", ["a", "b", "a"], "start", "end"),
);
assert.notDeepEqual(key, sharedCalendarKey("salon", ["a"], "start", "end"));
assert.notDeepEqual(
  key,
  sharedCalendarKey("other-salon", ["a", "b"], "start", "end"),
);
const next = new QueryObserver(client, {
  queryKey: sharedCalendarKey("salon", ["a"], "start", "end"),
  enabled: false,
  queryFn: async () => data,
});
assert.equal(next.getCurrentResult().data, undefined);
// A stale cached response is filtered without mutating the cache/other views.
assert.equal(cached.busy.length, 4);
client.clear();
console.log(
  "12 shared calendar cache, membership, plan and display assertions passed using actual QueryObserver behaviour.",
);
