import assert from "node:assert/strict";

export async function checkCashPayments(db) {
  const id = (n) => `60000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ role: "service_role" }),
  ]);
  await db.exec(`
    insert into auth.users(id,email,email_confirmed_at) values('${id(1)}','cash@example.invalid',now());
    insert into businesses(id,owner_id,name,slug,currency) values('${id(2)}','${id(1)}','Cash fixture','cash-fixture','GBP');
    insert into services(id,business_id,name) values('${id(3)}','${id(2)}','Cut');
    insert into staff(id,business_id,name) values('${id(4)}','${id(2)}','Stylist');
    insert into bookings(id,business_id,service_id,staff_id,customer_name,starts_at,ends_at,price_cents,amount_paid_cents,payment_status)
    values('${id(5)}','${id(2)}','${id(3)}','${id(4)}','Cash customer','2031-01-01 10:00+00','2031-01-01 11:00+00',5000,1500,'deposit_paid');
  `);
  const record = (overrides = {}) => {
    const p = {
      business: id(2),
      booking: id(5),
      amount: 3500,
      currency: "gbp",
      request: id(6),
      user: id(1),
      ...overrides,
    };
    return db.query(
      "select record_cash_payment($1,$2,$3,$4,$5,$6) as booking",
      [p.business, p.booking, p.amount, p.currency, p.request, p.user],
    );
  };
  await assert.rejects(record({ user: id(99) }), /owner/i);
  await assert.rejects(record({ business: id(99) }), /owner/i);
  await assert.rejects(record({ booking: id(99) }), /not found/i);
  for (const amount of [0, -1, null])
    await assert.rejects(record({ amount }), /invalid/i);
  await assert.rejects(record({ amount: 3501 }), /balance has changed/i);
  await assert.rejects(record({ currency: "usd" }), /currency/i);
  await db.query("update bookings set status='cancelled' where id=$1", [id(5)]);
  await assert.rejects(record(), /review/i);
  await db.query(
    "update bookings set status='confirmed',amount_refunded_cents=100 where id=$1",
    [id(5)],
  );
  await assert.rejects(record(), /review/i);
  await db.query("update bookings set amount_refunded_cents=0 where id=$1", [
    id(5),
  ]);
  await db.exec(`update businesses set stripe_account_id='acct_cash_fixture',stripe_charges_enabled=true where id='${id(2)}';
    select claim_balance_checkout('${id(2)}','${id(5)}','https://example.invalid');`);
  await assert.rejects(record(), /existing card checkout/i);
  await db.query(
    "update balance_checkout_attempts set state='review' where booking_id=$1",
    [id(5)],
  );
  await assert.rejects(record(), /existing card checkout/i);
  await db.query(
    "update balance_checkout_attempts set state='expired' where booking_id=$1",
    [id(5)],
  );
  await db.query(
    "update businesses set stripe_account_id=null,stripe_charges_enabled=false where id=$1",
    [id(2)],
  );
  const first = (await record()).rows[0].booking;
  assert.equal(first.amount_paid_cents, 5000);
  assert.equal(first.amount_due_cents, 0);
  assert.equal(first.payment_status, "paid");
  assert.equal(
    first.status,
    "confirmed",
    "Payment does not finish the appointment",
  );
  assert.deepEqual(
    (await record()).rows[0].booking,
    first,
    "Retry does not add money twice",
  );
  await assert.rejects(record({ amount: 3501 }), /identity mismatch/i);
  await assert.rejects(record({ request: id(7) }), /balance has changed/i);
  const rows = (
    await db.query(
      "select payment_method,amount_cents,initiated_by_user_id,stripe_payment_intent_id from payments where booking_id=$1",
      [id(5)],
    )
  ).rows;
  assert.deepEqual(rows, [
    {
      payment_method: "cash",
      amount_cents: 3500,
      initiated_by_user_id: id(1),
      stripe_payment_intent_id: null,
    },
  ]);
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await assert.rejects(record(), /permission denied/i);
    await db.exec("reset role");
  }
  await db.exec("set role service_role");
  assert.equal((await record()).rows[0].booking.payment_status, "paid");
  await db.exec("reset role");
  console.log(
    "Cash payment database checks passed: balance, deposit, audit, retry, authorisation, currency and checkout conflicts; no Stripe required.",
  );
}
