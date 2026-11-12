// Effective schema replay; all external Auth/Storage/cron services are local fixtures.
import fs from "node:fs";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
const db = new PGlite({ extensions: { pgcrypto } });
const replay = fs.readFileSync("scripts/test-schema-replay.mjs", "utf8");
const start = replay.indexOf("await db.exec(`") + "await db.exec(`".length;
const end = replay.indexOf("`);", start);
assert.ok(
  start > 0 && end > start,
  "schema fixture bootstrap must remain discoverable",
);
await db.exec(replay.slice(start, end));
const files = fs
  .readdirSync("supabase/migrations")
  .filter((f) => f.endsWith(".sql"))
  .sort();
for (const file of files) {
  const sql = fs
    .readFileSync("supabase/migrations/" + file, "utf8")
    .replace(
      /^create extension if not exists (pg_cron|pg_net) with schema extensions;\s*$/gim,
      "-- inert local service fixture",
    );
  await db.exec(sql);
}
const id = (n) => "92000000-0000-4000-8000-" + String(n).padStart(12, "0");
const owner = id(1),
  stranger = id(2),
  business = id(3);
await db.exec(
  `insert into auth.users(id,email,email_confirmed_at) values('${owner}','rollback-owner@example.invalid',now()),('${stranger}','rollback-stranger@example.invalid',now()); insert into businesses(id,owner_id,name,slug,plan) values('${business}','${owner}','Rollback fixture','rollback-fixture','studio');`,
);
const login = async (user = owner) => {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ role: "authenticated", sub: user, aal: "aal1" }),
  ]);
  await db.exec("set role authenticated");
};
const admin = async () => {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims','{}',false)");
};
let n = 100,
  checks = 0;
const batch = async () => {
  await admin();
  const batchId = id(n++),
    customer = id(n++);
  await db.query(
    "insert into import_batches(id,business_id,session_id,entity_type,source_filename,file_hash,row_count,status) values($1,$2,$3,'customers','fixture.csv',$1::uuid::text,1,'processing')",
    [batchId, business, id(n++)],
  );
  await db.query(
    "insert into customers(id,business_id,name,import_batch_id) values($1,$2,'Fictional customer',$3)",
    [customer, business, batchId],
  );
  await db.query("update import_batches set status='completed' where id=$1", [
    batchId,
  ]);
  return { batchId, customer };
};
const undo = async (b) =>
  db.query("select rollback_import_batch($1,$2)", [b.batchId, business]);
const exists = async (c) =>
  (await db.query("select count(*)::int n from customers where id=$1", [c]))
    .rows[0].n;
let b = await batch();
await login();
await undo(b);
assert.equal(await exists(b.customer), 0);
checks++;
assert.equal(
  (await db.query("select status from import_batches where id=$1", [b.batchId]))
    .rows[0].status,
  "rolled_back",
);
checks++;
await undo(b);
checks++;
b = await batch();
await login(stranger);
await assert.rejects(undo(b), /verified business owner/);
checks++;
await login();
assert.equal(await exists(b.customer), 1);
checks++;
b = await batch();
await admin();
await db.query(
  "update customers set notes='Changed after import' where id=$1",
  [b.customer],
);
await login();
await assert.rejects(undo(b), /edited records/);
assert.equal(await exists(b.customer), 1);
checks++;
b = await batch();
await admin();
await db.query("delete from import_row_fingerprints where batch_id=$1", [
  b.batchId,
]);
await login();
await assert.rejects(undo(b), /predates safe undo/);
assert.equal(await exists(b.customer), 1);
checks++;
b = await batch();
await admin();
await db.query(
  "insert into consultation_submissions(business_id,customer_id,booking_id,status) values($1,$2,null,'pending')",
  [business, b.customer],
);
await login();
await assert.rejects(undo(b), /Other records/);
assert.equal(await exists(b.customer), 1);
checks++;
await admin();
assert.equal(
  (
    await db.query(
      "select count(*)::int n from consultation_submissions where customer_id=$1",
      [b.customer],
    )
  ).rows[0].n,
  1,
);
checks++;
// An unforeseen future feature with a CASCADE FK must also be protected.
b = await batch();
await admin();
await db.exec(
  "create table public.rollback_future_dependency(customer_id uuid references public.customers(id) on delete cascade)",
);
await db.query("insert into rollback_future_dependency values($1)", [
  b.customer,
]);
await login();
await assert.rejects(undo(b), /Other records/);
checks++;
b = await batch();
await admin();
await db.query("update import_batches set status='processing' where id=$1", [
  b.batchId,
]);
await login();
await assert.rejects(undo(b), /still be running/);
checks++;

// Force a late delete to fail: the earlier booking/customer/service deletes
// must roll back too, unlike the old sequence of separate browser requests.
b = await batch();
await admin();
await db.query(
  "update import_batches set status='processing',entity_type='bookings' where id=$1",
  [b.batchId],
);
const staff = id(n++),
  service = id(n++),
  booking = id(n++);
await db.query(
  "insert into staff(id,business_id,name,import_batch_id) values($1,$2,'Imported team member',$3)",
  [staff, business, b.batchId],
);
await db.query(
  "insert into services(id,business_id,name,import_batch_id) values($1,$2,'Imported service',$3)",
  [service, business, b.batchId],
);
await db.query(
  "insert into bookings(id,business_id,staff_id,service_id,customer_id,customer_name,starts_at,ends_at,import_batch_id,external_id,notify_customer,confirmation_sent_at) values($1,$2,$3,$4,$5,'Fictional customer','2030-01-07T10:00Z','2030-01-07T11:00Z',$6,'safe-undo-fixture',false,now())",
  [booking, business, staff, service, b.customer, b.batchId],
);
await db.query("update import_batches set status='completed' where id=$1", [
  b.batchId,
]);
await login();
for (const table of ["bookings", "customers", "services", "staff"]) {
  await assert.rejects(
    db.query(`delete from ${table} where import_batch_id=$1`, [b.batchId]),
    /cannot be deleted directly/,
  );
  assert.equal(
    (
      await db.query(
        `select count(*)::int n from ${table} where import_batch_id=$1`,
        [b.batchId],
      )
    ).rows[0].n,
    1,
  );
  checks++;
}
await admin();
await db.exec(
  "create function reject_test_delete() returns trigger language plpgsql as $$begin raise exception 'injected late delete failure';end$$;create trigger reject_test_delete before delete on staff for each row execute function reject_test_delete();",
);
await login();
await assert.rejects(undo(b), /injected late delete failure/);
assert.equal(await exists(b.customer), 1);
assert.equal(
  (
    await db.query("select count(*)::int n from bookings where id=$1", [
      booking,
    ])
  ).rows[0].n,
  1,
);
checks++;
await admin();
await db.exec(
  "drop trigger reject_test_delete on staff;drop function reject_test_delete()",
);
await login();
await undo(b);
assert.equal(await exists(b.customer), 0);
assert.equal(
  (
    await db.query("select count(*)::int n from bookings where id=$1", [
      booking,
    ])
  ).rows[0].n,
  0,
);
checks++;
await admin();
assert.equal(
  (
    await db.query(
      "select has_function_privilege('anon','public.rollback_import_batch(uuid,uuid)','execute') as ok",
    )
  ).rows[0].ok,
  false,
);
checks++;
await login();
await assert.rejects(
  db.query("select * from import_row_fingerprints"),
  /permission denied/,
);
checks++;
await admin();
await db.exec("drop table public.rollback_future_dependency");
b = await batch();
await admin();
await db.query(
  "update customers set name='Deleted customer',email=null,phone=null where id=$1",
  [b.customer],
);
assert.equal(
  (
    await db.query(
      "select count(*)::int n from import_row_fingerprints where row_id=$1",
      [b.customer],
    )
  ).rows[0].n,
  0,
);
checks++;
b = await batch();
await login();
await undo(b);
await admin();
assert.equal(
  (
    await db.query(
      "select count(*)::int n from import_row_fingerprints where batch_id=$1",
      [b.batchId],
    )
  ).rows[0].n,
  0,
);
checks++;
// Cached versions used direct deletes. They must fail before even the first
// imported row is removed, and may not launder provenance by deleting a batch.
b = await batch();
await login();
await assert.rejects(
  db.query("delete from customers where import_batch_id=$1", [b.batchId]),
  /cannot be deleted directly/,
);
checks++;
await assert.rejects(
  db.query("update customers set import_batch_id=null where id=$1", [
    b.customer,
  ]),
  /provenance/,
);
checks++;
await assert.rejects(
  db.query("delete from import_batches where id=$1", [b.batchId]),
  /history cannot be deleted/,
);
checks++;
// Neither an arbitrary application flag nor a forged role claim grants access.
await db.query("select set_config('app.safe_import_undo','true',false)");
await db.query(
  "select set_config('request.jwt.claim.role','service_role',false)",
);
await assert.rejects(
  db.query("delete from customers where id=$1", [b.customer]),
  /cannot be deleted directly/,
);
checks++;
assert.equal(await exists(b.customer), 1);
await undo(b);
assert.equal(await exists(b.customer), 0);
checks++;
// Ordinary unimported records are unaffected; authorised erasure still works
// on imported customer records and discards their undo fingerprint.
b = await batch();
await login();
await db.query(
  "update customers set notes='Ordinary permitted edit' where id=$1",
  [b.customer],
);
checks++;
await admin();
const eraseRequest = id(n++);
await db.query(
  "insert into customer_data_requests(id,business_id,customer_id,email,kind) values($1,$2,$3,'fixture@example.invalid','deletion')",
  [eraseRequest, business, b.customer],
);
await db.exec("set role service_role");
await db.query(
  "select erase_customer_with_storage_job($1,$2,$3,$4,'{}'::text[])",
  [business, b.customer, eraseRequest, owner],
);
await admin();
assert.equal(
  (await db.query("select name from customers where id=$1", [b.customer]))
    .rows[0].name,
  "Deleted customer",
);
assert.equal(
  (
    await db.query(
      "select count(*)::int n from import_row_fingerprints where row_id=$1",
      [b.customer],
    )
  ).rows[0].n,
  0,
);
checks++;
const ordinary = id(n++);
await db.query(
  "insert into customers(id,business_id,name) values($1,$2,'Ordinary fixture')",
  [ordinary, business],
);
await login();
await db.query("delete from customers where id=$1", [ordinary]);
assert.equal(await exists(ordinary), 0);
checks++;
await db.close();
console.log(
  `${checks} transactional import undo checks passed after ${files.length} effective migrations, with health records, future CASCADE dependencies, ownership, edits and legacy rows protected.`,
);
