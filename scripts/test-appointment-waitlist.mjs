import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  firstRequestedSalonDay,
  formatRequestedSalonDates,
  requestMatchesCancelledSlot,
  salonDateWindow,
  collectRequestPages,
  requestDateBounds,
  requestStaffOptions,
} from "../src/lib/appointment-waitlist.ts";

const routeTree = readFileSync(new URL("../src/routeTree.gen.ts", import.meta.url), "utf8");
assert.match(
  routeTree,
  /const BookSlugWaitlistRoute = BookSlugWaitlistRouteImport\.update\(\{[\s\S]*?getParentRoute: \(\) => rootRouteImport/,
  "the public request page must not render inside the booking page",
);

assert.deepEqual(salonDateWindow("2026-03-29", "2026-03-29", "Europe/London"), {
  after: "2026-03-29T00:00:00.000Z",
  before: "2026-03-29T23:00:00.000Z",
});
assert.deepEqual(salonDateWindow("2026-10-25", "2026-10-25", "Europe/London"), {
  after: "2026-10-24T23:00:00.000Z",
  before: "2026-10-26T00:00:00.000Z",
});
assert.throws(() => salonDateWindow("2026-02-30", "2026-03-01", "UTC"));

const springDay = salonDateWindow("2026-03-29", "2026-03-29", "Europe/London");
assert.equal(
  formatRequestedSalonDates(springDay.after, springDay.before, "Europe/London"),
  "29 Mar 2026",
);
const autumnDay = salonDateWindow("2026-10-25", "2026-10-25", "Europe/London");
assert.equal(
  formatRequestedSalonDates(autumnDay.after, autumnDay.before, "Europe/London"),
  "25 Oct 2026",
);
const twoDays = salonDateWindow("2026-10-24", "2026-10-25", "Europe/London");
assert.equal(
  formatRequestedSalonDates(twoDays.after, twoDays.before, "Europe/London"),
  "24 Oct 2026 – 25 Oct 2026",
);
assert.equal(
  formatRequestedSalonDates("bad", autumnDay.before, "Europe/London"),
  "Date unavailable",
);
assert.equal(firstRequestedSalonDay(springDay.after, "Europe/London"), "2026-03-29");
assert.equal(firstRequestedSalonDay(autumnDay.after, "Europe/London"), "2026-10-25");

const request = {
  id: "r",
  service_id: "colour",
  preferred_staff_id: "s1",
  preferred_after: "2026-10-24T23:00:00Z",
  preferred_before: "2026-10-26T00:00:00Z",
  preferred_time: "morning",
  status: "active",
};
const slot = {
  id: "b",
  service_id: "colour",
  staff_id: "s1",
  starts_at: "2026-10-25T10:00:00Z",
  ends_at: "2026-10-25T11:00:00Z",
};
const now = new Date("2026-10-24T00:00:00Z");
assert.equal(
  requestMatchesCancelledSlot(request, slot, "Europe/London", now),
  true,
);
assert.equal(
  requestMatchesCancelledSlot(
    { ...request, service_id: "cut" },
    slot,
    "Europe/London",
    now,
  ),
  false,
);
assert.equal(
  requestMatchesCancelledSlot(
    { ...request, preferred_staff_id: "s2" },
    slot,
    "Europe/London",
    now,
  ),
  false,
);
assert.equal(
  requestMatchesCancelledSlot(
    { ...request, preferred_time: "evening" },
    slot,
    "Europe/London",
    now,
  ),
  false,
);
assert.equal(
  requestMatchesCancelledSlot(
    { ...request, status: "closed" },
    slot,
    "Europe/London",
    now,
  ),
  false,
);
assert.equal(
  requestMatchesCancelledSlot(
    request,
    { ...slot, starts_at: "2026-10-27T10:00:00Z" },
    "Europe/London",
    now,
  ),
  false,
);
console.log("Appointment waitlist matching tests passed");

assert.deepEqual(requestDateBounds('Europe/London', Date.parse('2026-07-01T23:30:00Z')), {first:'2026-07-02',last:'2026-08-31'});
assert.deepEqual(requestDateBounds('America/New_York', Date.parse('2026-07-01T01:00:00Z')), {first:'2026-06-30',last:'2026-08-29'});
const manyRequests = Array.from({length:1201}, (_,id)=>({id,status:id<1200?'closed':'active'}));
const pages=[];
const all = await collectRequestPages(async(from,to)=>{pages.push([from,to]);return {data:manyRequests.slice(from,to+1),error:null};});
assert.equal(all.length,1201);
assert.equal(all.filter(r=>r.status==='active').length,1);
assert.deepEqual(pages,[[0,499],[500,999],[1000,1499]]);
await assert.rejects(collectRequestPages(async()=>({data:null,error:new Error('offline')})),/offline/);
const team=[{id:'a'},{id:'b'}];
assert.deepEqual(requestStaffOptions(team,[{service_id:'colour',staff_id:'a'}],'colour'),[{id:'a'}]);
assert.deepEqual(requestStaffOptions(team,[{service_id:'colour',staff_id:'a'}],'cut'),team);
assert.deepEqual(requestStaffOptions(team,[{service_id:'colour',staff_id:'inactive'}],'colour'),[]);
console.log('Request pagination, salon date bounds and service/staff regression checks passed');
