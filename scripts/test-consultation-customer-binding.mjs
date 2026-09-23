import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Structural safeguards supplement, rather than replace, a signed-in integration test.
const server = readFileSync(new URL("../src/lib/consultations.functions.ts", import.meta.url), "utf8");
const start = server.slice(server.indexOf("export const startConsultationSubmission"), server.indexOf("export const getBookingConsultationStatus"));
assert.match(start, /if \(!validUuid\(data\.customerId\)\)/);
assert.match(start, /if \(data\.customerId\)\s*\{[\s\S]*?\.eq\("business_id", business\.id\)\.eq\("id", data\.customerId\)\.maybeSingle\(\)/);
assert.match(start, /if \(!selected\) throw new Error\("That customer is not available in this salon\."\)/);
assert.match(start, /if \(!customer && data\.customerEmail\)/);
assert.match(start, /if \(!customer && data\.customerPhone\)/);
assert.ok(start.indexOf("if (data.customerId)") < start.indexOf("if (!customer && data.customerEmail)"));
const ui = readFileSync(new URL("../src/routes/_authenticated/consultations.tsx", import.meta.url), "utf8") + readFileSync(new URL("../src/components/start-signing-dialog.tsx", import.meta.url), "utf8");
assert.match(ui, /\(!!customerId && !detailsConfirmed\)/);
assert.doesNotMatch(start, /answers:|signature_data:|consented:/);
assert.match(ui, /setSignatureData\(null\)/);
assert.match(ui, /setConsented\(false\)/);
console.log("10 consultation customer-binding and fresh-consent structural checks passed.");
