import assert from "node:assert/strict";

export async function checkDailyTakings(db) {
  const id = (n) => `61000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ role: "service_role" }),
  ]);
  await db.exec(`
    insert into auth.users(id,email,email_confirmed_at) values('${id(1)}','takings@example.invalid',now());
    insert into businesses(id,owner_id,name,slug,currency,timezone) values('${id(2)}','${id(1)}','Takings fixture','takings-fixture','GBP','Europe/London');
    insert into services(id,business_id,name) values('${id(3)}','${id(2)}','Cut');
    insert into staff(id,business_id,name) values('${id(4)}','${id(2)}','Stylist');
    insert into bookings(id,business_id,service_id,staff_id,customer_name,starts_at,ends_at,price_cents)
      values('${id(5)}','${id(2)}','${id(3)}','${id(4)}','Takings customer','2031-01-01 10:00+00','2031-01-01 11:00+00',10000);
  `);
  const record = (
    amount = 3000,
    method = "cash",
    key = id(6),
    currency = "GBP",
    actor = id(1),
  ) =>
    db.query("select record_manual_receipt($1,$2,$3,$4,$5,$6,$7) as id", [
      id(2),
      id(5),
      amount,
      method,
      key,
      actor,
      currency,
    ]);
  await assert.rejects(record(0), /valid amount/);
  await assert.rejects(record(-1), /valid amount/);
  await assert.rejects(record(10001), /remaining balance/);
  await assert.rejects(record(3000, "unknown"), /valid amount/);
  await assert.rejects(record(3000, "cash", id(6), "USD"), /currency/);
  await assert.rejects(
    record(3000, "cash", id(6), "GBP", id(99)),
    /Business not found/,
  );
  await db.query(
    "update businesses set stripe_account_id='acct_takings_fixture',stripe_charges_enabled=true where id=$1",
    [id(2)],
  );
  await db.query(
    "select claim_balance_checkout($1,$2,'https://example.invalid')",
    [id(2), id(5)],
  );
  await assert.rejects(record(), /existing card checkout/);
  await db.query(
    "update balance_checkout_attempts set state='review' where booking_id=$1",
    [id(5)],
  );
  await assert.rejects(record(), /existing card checkout/);
  await db.query(
    "update balance_checkout_attempts set state='expired' where booking_id=$1",
    [id(5)],
  );
  const first = (await record()).rows[0].id;
  assert.equal((await record()).rows[0].id, first);
  await assert.rejects(record(3001), /already been used/);
  await record(7000, "bank_transfer", id(7));
  assert.deepEqual(
    (
      await db.query(
        "select amount_paid_cents,amount_due_cents,payment_status from bookings where id=$1",
        [id(5)],
      )
    ).rows[0],
    { amount_paid_cents: 10000, amount_due_cents: 0, payment_status: "paid" },
  );
  const today = (
    await db.query(
      "select (now() at time zone 'Europe/London')::date::text as day",
    )
  ).rows[0].day;
  const report = async (day) =>
    (await db.query("select get_daily_takings($1,$2) as report", [id(2), day]))
      .rows[0].report;
  assert.equal((await report(today)).rows.length, 2);
  await db.query("update bookings set status='cancelled' where id=$1", [id(5)]);
  assert.equal((await report(today)).rows.length, 2);
  await db.exec(`insert into bookings(id,business_id,service_id,staff_id,customer_name,starts_at,ends_at,price_cents,amount_paid_cents,payment_status,source)
    values('${id(8)}','${id(2)}','${id(3)}','${id(4)}','Initial paid','2031-01-02 10:00+00','2031-01-02 11:00+00',5000,2000,'deposit_paid','walkin');`);
  assert.equal(
    (await report(today)).rows.find((row) => row.bookingId === id(8)).method,
    "unknown",
  );
  for (const [day, start, end] of [
    ["2026-03-29", "2026-03-29T00:00:00Z", "2026-03-29T23:00:00Z"],
    ["2026-10-25", "2026-10-24T23:00:00Z", "2026-10-26T00:00:00Z"],
  ]) {
    for (const time of [
      new Date(Date.parse(start) - 1).toISOString(),
      start,
      new Date(Date.parse(end) - 1).toISOString(),
      end,
    ])
      await db.query(
        "insert into payments(business_id,type,status,amount_cents,currency,created_at,payment_method) values($1,'charge','succeeded',100,'GBP',$2,'cash')",
        [id(2), time],
      );
    assert.equal((await report(day)).rows.length, 2);
  }
  await db.query(
    "insert into payments(business_id,type,status,amount_cents,currency,created_at) select $1,'charge','succeeded',1,'GBP','2026-08-01T12:00:00Z' from generate_series(1,1200)",
    [id(2)],
  );
  assert.equal((await report("2026-08-01")).rows.length, 1200);
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await assert.rejects(record(), /permission denied/);
    await assert.rejects(report(today), /permission denied/);
    await db.exec("reset role");
  }
  await db.exec("set role service_role");
  assert.equal((await record()).rows[0].id, first);
  await db.exec("reset role");
  console.log(
    "Daily takings checks passed: owner access, split receipts, retry identity, currency, active/review checkout guards, initial receipts, cancellation, DST boundaries and >1000 rows.",
  );
}
