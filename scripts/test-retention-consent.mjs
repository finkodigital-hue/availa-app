import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import vm from "node:vm";
let revoked = false,
  missingEmail = false,
  unavailable = false,
  sends = [];
const db = {
  from(table) {
    let fields = "",
      filters = [],
      single = false;
    const q = {
      select(v) {
        fields = v;
        return q;
      },
      eq(k, v) {
        filters.push([k, v]);
        return q;
      },
      is() {
        return q;
      },
      not() {
        return q;
      },
      gt() {
        return q;
      },
      gte() {
        return q;
      },
      lte() {
        return q;
      },
      in() {
        return q;
      },
      order() {
        return q;
      },
      limit() {
        return q;
      },
      maybeSingle() {
        single = true;
        return q;
      },
      then(resolve, reject) {
        let data = [];
        let error = null;
        if (table === "businesses")
          data = [{ id: "tenant-a", name: "Fictional", slug: "fixture" }];
        if (table === "notification_preferences")
          data = {
            customer_aftercare_email: false,
            customer_rebooking_email: true,
          };
        if (table === "customer_marketing_preferences") {
          if (single) {
            assert.ok(
              filters.some(([k, v]) => k === "business_id" && v === "tenant-a"),
            );
            assert.ok(
              filters.some(
                ([k, v]) => k === "customer_id" && v === "customer-a",
              ),
            );
            assert.ok(
              filters.some(([k, v]) => k === "status" && v === "subscribed"),
            );
            error = unavailable ? new Error("Consent check unavailable") : null;
            data = revoked
              ? null
              : {
                  unsubscribe_token: "current-token",
                  customers: {
                    email: missingEmail ? null : "current@example.invalid",
                  },
                };
          } else
            data = [
              { customer_id: "customer-a", unsubscribe_token: "old-token" },
            ];
        }
        if (table === "bookings" && fields.includes("ends_at"))
          data = [
            {
              id: "booking-a",
              customer_id: "customer-a",
              customer_name: "Fictional",
              customer_email: "old@example.invalid",
              ends_at: "2020-01-01",
              customers: { email: "current@example.invalid" },
              services: {
                id: "service-a",
                name: "Fictional service",
                rebooking_interval_days: 7,
              },
            },
          ];
        return Promise.resolve({ data, error }).then(resolve, reject);
      },
    };
    return q;
  },
};
const exports = {};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync("src/lib/retention-sweep.server.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  {
    exports,
    Date,
    console: { error() {} },
    process: { env: {} },
    require(name) {
      if (name.endsWith("client.server")) return { supabaseAdmin: db };
      if (name.endsWith("resend.server"))
        return {
          sendEmail: async (args) => {
            sends.push(args);
          },
        };
      if (name.endsWith("notification-delivery.server"))
        return { markBookingNotification: async () => {} };
      if (name.endsWith("theme")) return { parseTheme: () => ({}) };
      if (name.endsWith("rebooking-email.server"))
        return {
          buildRebookingEmail: () => ({ subject: "fixture", html: "fixture" }),
        };
      return {};
    },
  },
);
await exports.runRetentionSweep();
assert.equal(
  sends[0]?.to,
  "current@example.invalid",
  "marketing must not use the stale booking address",
);
sends = [];
revoked = true;
await exports.runRetentionSweep();
assert.equal(
  sends.length,
  0,
  "withdrawal after candidate selection must suppress sending",
);
revoked = false;
missingEmail = true;
await exports.runRetentionSweep();
assert.equal(
  sends.length,
  0,
  "no fallback to old address if current profile has no email",
);
missingEmail = false;
unavailable = true;
const stats = await exports.runRetentionSweep();
assert.equal(sends.length, 0);
assert.equal(stats.rebookingFailed, 1);
console.log(
  "4 retention recipient/consent cases passed; all delivery calls inert.",
);
