import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const migration = fs.readFileSync(
  new URL(
    "../supabase/migrations/20260926013000_reconcile_concurrent_stock_usage.sql",
    import.meta.url,
  ),
  "utf8",
);
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

await db.exec(`
  create role anon; create role authenticated;
  create table businesses(id uuid primary key);
  create table services(id uuid primary key, business_id uuid not null);
  create table bookings(id uuid primary key, business_id uuid not null, service_id uuid, status text not null);
  create table inventory_items(id uuid primary key, business_id uuid not null, current_stock numeric not null);
  create table service_recipe_items(id uuid primary key default gen_random_uuid(), business_id uuid not null, service_id uuid not null, inventory_item_id uuid not null, quantity numeric not null);
  create table booking_stock_deductions(id uuid primary key default gen_random_uuid(), business_id uuid not null, booking_id uuid not null, inventory_item_id uuid not null, quantity numeric not null);
  create function apply_booking_stock_deduction() returns trigger language plpgsql as $$begin return new;end$$;
  create trigger bookings_stock_deduction after update of status on bookings for each row execute function apply_booking_stock_deduction();
`);
await db.exec(migration);
await db.exec(`
  insert into businesses values('${id(1)}');
  insert into services values('${id(2)}','${id(1)}');
  insert into inventory_items values('${id(3)}','${id(1)}',5);
  insert into service_recipe_items(business_id,service_id,inventory_item_id,quantity)
  values('${id(1)}','${id(2)}','${id(3)}',2),('${id(1)}','${id(2)}','${id(3)}',2);
  insert into bookings values('${id(4)}','${id(1)}','${id(2)}','confirmed'),('${id(5)}','${id(1)}','${id(2)}','confirmed');
`);

const stock = async () =>
  Number(
    (await db.query("select current_stock from inventory_items")).rows[0]
      .current_stock,
  );
const ledger = async (booking) =>
  Number(
    (
      await db.query(
        `select coalesce(sum(quantity),0) as used from booking_stock_deductions where booking_id='${booking}'`,
      )
    ).rows[0].used,
  );

await db.exec(`update bookings set status='completed' where id='${id(4)}'`);
assert.equal(await stock(), 1);
assert.equal(await ledger(id(4)), 4);
await db.exec(`update bookings set status='completed' where id='${id(5)}'`);
assert.equal(await stock(), 0);
assert.equal(await ledger(id(5)), 1);
await db.exec(`update bookings set status='confirmed' where id='${id(5)}'`);
assert.equal(await stock(), 1);
await db.exec(`update bookings set status='confirmed' where id='${id(4)}'`);
assert.equal(await stock(), 5);

await db.exec(`update bookings set status='completed' where id='${id(4)}'`);
const deductionId = (
  await db.query(
    `select id from booking_stock_deductions where booking_id='${id(4)}'`,
  )
).rows[0].id;
await db.exec(`select adjust_booking_stock_deduction('${deductionId}',5)`);
assert.equal(await stock(), 0);
await assert.rejects(
  db.query(`select adjust_booking_stock_deduction('${deductionId}',6)`),
  /Not enough stock/,
);
await db.exec(`select adjust_booking_stock_deduction('${deductionId}',2)`);
assert.equal(await stock(), 3);
await db.exec(`update bookings set status='confirmed' where id='${id(4)}'`);
assert.equal(await stock(), 5);

await db.close();
console.log(
  "11 stock deduction, exhaustion, adjustment and reversal reconciliation checks passed.",
);
