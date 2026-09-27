import assert from "node:assert/strict";
import fs from "node:fs";

const checkout = fs.readFileSync(
  new URL("../src/lib/stripe-connect.functions.ts", import.meta.url),
  "utf8",
);
const page = fs.readFileSync(
  new URL("../src/components/public-booking-page.tsx", import.meta.url),
  "utf8",
);

assert.match(
  checkout,
  /success_url:[\s\S]*hold_id=\$\{encodeURIComponent\(hold\.id\)\}[\s\S]*session_id=\{CHECKOUT_SESSION_ID\}/,
);
assert.match(checkout, /session\.metadata\?\.hold_id !== hold\.id/);
assert.match(
  checkout,
  /session\.metadata\?\.business_id !== hold\.business_id/,
);
assert.match(checkout, /session\.amount_total !== hold\.amount_cents/);
assert.match(checkout, /session\.payment_status !== "paid"/);
assert.match(checkout, /"fulfill_held_booking"/);
assert.match(
  page,
  /finalizeBookingCheckout\(\{ data: \{ sessionId, holdId \} \}\)/,
);
assert.match(page, /Confirmation is taking a little longer than usual/);

console.log("8 booking payment-return recovery wiring checks passed.");
