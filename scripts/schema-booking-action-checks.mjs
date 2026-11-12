import assert from 'node:assert/strict';

export async function checkBookingActions(db) {
  const id = n => `51000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  await db.exec(`reset role;select set_config('request.jwt.claims','{"role":"service_role"}',false);
    insert into auth.users(id,email,email_confirmed_at) values('${id(1)}','atomic-action@example.invalid',now());
    insert into businesses(id,owner_id,name,slug,timezone) values('${id(2)}','${id(1)}','Atomic fixture','atomic-action-fixture','UTC');
    insert into services(id,business_id,name) values('${id(3)}','${id(2)}','Fixture');
    insert into staff(id,business_id,name) values('${id(4)}','${id(2)}','Fixture');
    insert into bookings(id,business_id,service_id,staff_id,customer_name,starts_at,ends_at)
      values('${id(5)}','${id(2)}','${id(3)}','${id(4)}','Fictional customer','2030-01-07 10:00+00','2030-01-07 11:00+00');
    insert into booking_action_tokens(booking_id,action,token_hash,expires_at) values
      ('${id(5)}','confirm','${'1'.repeat(64)}','2030-01-08'),('${id(5)}','cancel','${'2'.repeat(64)}','2030-01-08');
    set role service_role;`);
  const act = async (hash, action) => (await db.query('select apply_booking_action_token($1,$2) as r',[hash.repeat(64),action])).rows[0].r;
  assert.equal((await act('1','confirm')).ok,true);
  assert.equal((await act('1','confirm')).reason,'used');
  assert.equal((await act('2','cancel')).ok,true);
  await db.exec('reset role');
  const booking=(await db.query('select status,client_confirmed_at,customer_name from bookings where id=$1',[id(5)])).rows[0];
  assert.equal(booking.status,'cancelled');
  assert.ok(booking.client_confirmed_at);
  assert.equal(booking.customer_name,'Fictional customer');
  assert.equal((await db.query("select count(*)::int as n from booking_change_email_outbox where booking_id=$1 and change_type='cancelled'",[id(5)])).rows[0].n,1);
  await db.exec("select set_config('request.jwt.claims','{}',false)");
  console.log('Atomic booking actions: 7 full-schema confirmation, cancellation and outbox assertions passed.');
}
