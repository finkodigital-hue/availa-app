import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const owner = id(1),
  otherOwner = id(2),
  business = id(3),
  otherBusiness = id(4);
const booking = id(5),
  reader = id(6),
  request = id(7),
  request2 = id(8);
let checks = 0;
const same = (actual, expected) => {
  assert.deepEqual(actual, expected);
  checks++;
};
const rejects = async (promise, pattern) => {
  await assert.rejects(promise, pattern);
  checks++;
};

const terminalServerSource = fs.readFileSync(
  new URL("../src/lib/stripe-terminal.server.ts", import.meta.url),
  "utf8",
);
same(terminalServerSource.includes('"address[line1]"'), true);
same(terminalServerSource.includes('"address[city]"'), true);
same(terminalServerSource.includes('"address[postal_code]"'), true);
same(
  terminalServerSource.includes(
    "/v1/test_helpers/terminal/readers/${encodeURIComponent(readerId)}/present_payment_method",
  ),
  true,
);
const terminalFunctionsSource = fs.readFileSync(
  new URL("../src/lib/terminal.functions.ts", import.meta.url),
  "utf8",
);
same(
  /if \(isStripeTestMode\(\)\)[\s\S]*presentSimulatedTerminalPayment/.test(
    terminalFunctionsSource,
  ),
  true,
);

await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users(id uuid primary key);
  create function set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;
  create table businesses(
    id uuid primary key, owner_id uuid not null, currency text not null,
    stripe_account_id text, stripe_charges_enabled boolean not null default false,
    deletion_requested_at timestamptz
  );
  create table bookings(
    id uuid primary key, business_id uuid not null references businesses(id),
    price_cents integer not null, amount_paid_cents integer not null default 0,
    amount_due_cents integer not null default 0, amount_refunded_cents integer not null default 0,
    payment_status text not null default 'unpaid', status text not null default 'confirmed',
    customer_name text, customer_email text, stripe_payment_intent_id text, stripe_charge_id text
  );
  create table payments(
    id uuid primary key default gen_random_uuid(), business_id uuid, booking_id uuid,
    stripe_payment_intent_id text, stripe_charge_id text, type text, status text,
    amount_cents integer, currency text, payment_method text, customer_name text,
    customer_email text, description text, initiated_by_user_id uuid
  );
  create table balance_checkout_attempts(
    id uuid primary key default gen_random_uuid(), booking_id uuid not null,
    state text not null default 'active'
  );
  insert into auth.users values ('${owner}'),('${otherOwner}');
  insert into businesses values
    ('${business}','${owner}','gbp','acct_fixture',true,null),
    ('${otherBusiness}','${otherOwner}','gbp','acct_other',true,null);
  insert into bookings(id,business_id,price_cents,amount_paid_cents,amount_due_cents,customer_name,customer_email)
    values('${booking}','${business}',5000,1000,4000,'Fictional Person','person@example.invalid');
`);
await db.exec(
  fs.readFileSync(
    new URL(
      "../supabase/migrations/20260927220000_stripe_terminal_payments.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);

const scalar = async (name, args) =>
  (
    await db.query(
      `select ${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) as value`,
      args,
    )
  ).rows[0].value;

const mapped = await scalar("upsert_terminal_reader", [
  business,
  "acct_fixture",
  "tml_fixture",
  "tmr_fixture",
  "Front desk",
  "bbpos_wisepos_e",
  "online",
]);
same(mapped.business_id, business);
same(mapped.stripe_reader_id, "tmr_fixture");
same(mapped.provider_status, "online");
await rejects(
  scalar("upsert_terminal_reader", [
    business,
    "acct_wrong",
    "tml_fixture",
    "tmr_wrong",
    "Wrong",
    null,
    "online",
  ]),
  /does not match/,
);

const attempt = await scalar("claim_terminal_payment", [
  business,
  booking,
  mapped.id,
  request,
  owner,
]);
same(attempt.amount_cents, 4000);
same(attempt.currency, "gbp");
same(attempt.state, "creating");
same(
  (
    await scalar("claim_terminal_payment", [
      business,
      booking,
      mapped.id,
      request,
      owner,
    ])
  ).id,
  request,
);
await rejects(
  scalar("claim_terminal_payment", [
    business,
    booking,
    mapped.id,
    request,
    otherOwner,
  ]),
  /identity mismatch/,
);
await rejects(
  scalar("claim_terminal_payment", [
    business,
    booking,
    mapped.id,
    request2,
    owner,
  ]),
  /unique constraint/,
);

await scalar("attach_terminal_payment_intent", [
  request,
  "pi_terminal_fixture",
]);
await scalar("attach_terminal_payment_intent", [
  request,
  "pi_terminal_fixture",
]);
await rejects(
  scalar("attach_terminal_payment_intent", [request, "pi_other"]),
  /cannot accept/,
);
await rejects(
  db.query(
    `insert into balance_checkout_attempts(booking_id) values('${booking}')`,
  ),
  /must be resolved/,
);
await rejects(
  db.query(`update bookings set amount_paid_cents=2000 where id='${booking}'`),
  /must be resolved/,
);

const paymentId = await scalar("fulfill_terminal_payment", [
  request,
  "pi_terminal_fixture",
  null,
  4000,
  "gbp",
]);
same(typeof paymentId, "string");
same(
  (
    await db.query(
      `select amount_paid_cents,amount_due_cents,payment_status from bookings where id='${booking}'`,
    )
  ).rows[0],
  {
    amount_paid_cents: 5000,
    amount_due_cents: 0,
    payment_status: "paid",
  },
);
same(
  (
    await db.query(
      `select payment_method,description from payments where id=$1`,
      [paymentId],
    )
  ).rows[0],
  {
    payment_method: "card",
    description: "Card reader payment",
  },
);
same(
  await scalar("fulfill_terminal_payment", [
    request,
    "pi_terminal_fixture",
    null,
    4000,
    "gbp",
  ]),
  paymentId,
);
same(
  (
    await db.query(
      `select count(*)::int as n from payments where stripe_payment_intent_id='pi_terminal_fixture'`,
    )
  ).rows[0].n,
  1,
);

await db.exec(`
  update bookings set price_cents=7000,amount_paid_cents=5000,amount_due_cents=2000,payment_status='deposit_paid' where id='${booking}';
`);
const retry = await scalar("claim_terminal_payment", [
  business,
  booking,
  mapped.id,
  request2,
  owner,
]);
same(retry.amount_cents, 2000);
await scalar("attach_terminal_payment_intent", [request2, "pi_declined"]);
await scalar("close_terminal_payment", [
  request2,
  "pi_declined",
  "failed",
  "card_declined",
  "Fictional decline",
]);
same(
  (
    await db.query(
      `select state from terminal_payment_attempts where id='${request2}'`,
    )
  ).rows[0].state,
  "failed",
);
const lateSuccessPayment = await scalar("fulfill_terminal_payment", [
  request2,
  "pi_declined",
  "ch_late_success",
  2000,
  "gbp",
]);
same(Boolean(lateSuccessPayment), true);
same(
  (
    await db.query(
      `select state from terminal_payment_attempts where id='${request2}'`,
    )
  ).rows[0].state,
  "succeeded",
);
await db.query(
  `insert into balance_checkout_attempts(booking_id) values('${booking}')`,
);
checks++;
await db.exec(
  `delete from balance_checkout_attempts where booking_id='${booking}'`,
);
await db.exec(`
  update bookings set price_cents=7000,amount_paid_cents=5000,amount_due_cents=2000,payment_status='deposit_paid' where id='${booking}';
`);
const preIntentRequest = id(9);
await scalar("claim_terminal_payment", [
  business,
  booking,
  mapped.id,
  preIntentRequest,
  owner,
]);
await scalar("close_terminal_payment", [
  preIntentRequest,
  null,
  "failed",
  "provider_rejected",
  "Fictional setup failure",
]);
same(
  (
    await db.query(
      `select state from terminal_payment_attempts where id='${preIntentRequest}'`,
    )
  ).rows[0].state,
  "failed",
);
await db.query(
  `insert into balance_checkout_attempts(booking_id) values('${booking}')`,
);
checks++;

await db.exec("set role anon");
await rejects(db.query("select * from terminal_readers"), /permission denied/);
await rejects(
  db.query(
    `select claim_terminal_payment('${business}','${booking}','${reader}','${id(10)}','${owner}')`,
  ),
  /permission denied/,
);
await db.exec("reset role; set role authenticated");
await rejects(
  db.query(
    `select fulfill_terminal_payment('${request}','pi_terminal_fixture',null,4000,'gbp')`,
  ),
  /permission denied/,
);
await db.exec("reset role");

const policies = (
  await db.query(`select count(*)::int as n from pg_policy where polrelid in (
  'terminal_readers'::regclass,'terminal_payment_attempts'::regclass
)`)
).rows[0].n;
same(policies, 2);

await db.close();
console.log(
  `${checks} Stripe Terminal database, idempotency, balance-lock and access assertions passed (fictional provider; no charge).`,
);
