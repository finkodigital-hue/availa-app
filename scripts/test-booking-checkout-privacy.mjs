import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import fs from "node:fs";

const db = new PGlite();
const migration = fs.readFileSync(
  new URL(
    "../supabase/migrations/20260927230000_minimise_stripe_checkout_data.sql",
    import.meta.url,
  ),
  "utf8",
);
const checkoutSource = fs.readFileSync(
  new URL("../src/lib/stripe-connect.functions.ts", import.meta.url),
  "utf8",
);
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role;
  create schema cron;
  create table cron.job(jobid bigint, jobname text);
  create function cron.unschedule(bigint) returns boolean language sql as $$select true$$;
  create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
  create table bookings(id uuid primary key);
  create table booking_checkout_holds(
    id uuid primary key,
    business_id uuid not null,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    fulfilled_booking_id uuid references bookings(id)
  );
  create table booking_payment_issues(
    payment_intent_id text primary key,
    hold_id uuid references booking_checkout_holds(id)
  );
  alter table booking_checkout_holds enable row level security;
  revoke all on booking_checkout_holds from public, anon, authenticated;
  grant all on booking_checkout_holds to service_role;
`);
await db.exec(migration);

await db.exec(`
  insert into bookings values ('${id(90)}');
  insert into booking_checkout_holds(
    id,business_id,created_at,expires_at,fulfilled_booking_id,
    customer_name,customer_email,customer_phone,notes,
    sms_reminder_notice,email_marketing_consent,booking_source
  ) values
    ('${id(1)}','${id(50)}',now()-interval '2 days',now()-interval '1 day','${id(90)}',
      'Fictional Client','client@example.invalid','+447000000001','private note',true,true,'conference'),
    ('${id(2)}','${id(50)}',now()-interval '2 days',now()-interval '2 days',null,
      'Expired Client','expired@example.invalid',null,'expired note',false,false,null),
    ('${id(3)}','${id(50)}',now()-interval '2 days',now()-interval '2 days',null,
      'Review Client','review@example.invalid',null,'review note',false,false,null);
  insert into booking_payment_issues values ('pi_review','${id(3)}');
`);

const result = await db.query(
  "select prune_expired_booking_checkout_holds() as deleted",
);
assert.equal(result.rows[0].deleted, 1);
const rows = (
  await db.query(
    "select id,customer_name,customer_email,customer_phone,notes,sms_reminder_notice,email_marketing_consent,booking_source from booking_checkout_holds order by id",
  )
).rows;
assert.equal(rows.length, 2);
assert.equal(rows[0].id, id(1));
assert.equal(rows[0].customer_name, null);
assert.equal(rows[0].customer_email, null);
assert.equal(rows[0].customer_phone, null);
assert.equal(rows[0].notes, null);
assert.equal(rows[0].sms_reminder_notice, false);
assert.equal(rows[0].email_marketing_consent, false);
assert.equal(rows[0].booking_source, null);
assert.equal(rows[1].id, id(3));
assert.equal(rows[1].customer_name, "Review Client");

for (const field of [
  "customer_name",
  "customer_email",
  "customer_phone",
  "notes",
  "sms_reminder_notice",
  "email_marketing_consent",
  "booking_source",
  "starts_at",
  "ends_at",
  "payment_mode",
]) {
  assert.equal(
    checkoutSource.includes(`\"metadata[${field}]\"`),
    false,
    `Stripe Checkout metadata must not contain ${field}`,
  );
}

assert.match(checkoutSource, /customer_email: data\.customerEmail\.trim\(\)/);
assert.match(
  checkoutSource,
  /\.from\("booking_checkout_holds"\)[\s\S]*customer_name/,
);

await db.close();
console.log(
  "Booking checkout privacy checks passed: details stay in the private hold, fulfilled PII is scrubbed and stale holds are pruned.",
);
