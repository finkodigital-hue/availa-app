import assert from 'node:assert/strict';

export async function checkBetterTimeOffers(db) {
  const ids = {
    owner: '40000000-0000-4000-8000-000000000001',
    business: '40000000-0000-4000-8000-000000000002',
    service: '40000000-0000-4000-8000-000000000003',
    staff: '40000000-0000-4000-8000-000000000004',
    booking: '40000000-0000-4000-8000-000000000005',
    request: '40000000-0000-4000-8000-000000000006',
    secondRequest: '40000000-0000-4000-8000-000000000007',
    oldRequest: '40000000-0000-4000-8000-000000000008',
    paidBooking: '40000000-0000-4000-8000-000000000009',
    paidRequest: '40000000-0000-4000-8000-00000000000a',
  };
  const target = new Date();
  const days = (8 - target.getUTCDay()) % 7 || 7;
  target.setUTCDate(target.getUTCDate() + days + 1);
  target.setUTCHours(11, 0, 0, 0);
  const end = new Date(target.getTime() + 60 * 60_000);
  await db.query(`insert into auth.users(id,email,email_confirmed_at) values($1,'better-time-fixture@example.invalid',now())`, [ids.owner]);
  await db.query(`insert into businesses(id,owner_id,name,slug,timezone,payment_mode)
    values($1,$2,'Better time fixture','better-time-fixture','UTC','none')`, [ids.business, ids.owner]);
  await db.query(`insert into services(id,business_id,name,duration_minutes,price_cents)
    values($1,$2,'Cut',60,1200)`, [ids.service, ids.business]);
  await db.query(`insert into staff(id,business_id,name) values($1,$2,'Stylist')`, [ids.staff, ids.business]);
  await db.query(`insert into bookings(id,business_id,service_id,staff_id,customer_name,starts_at,ends_at,status)
    values($1,$2,$3,$4,'Cancelled fixture',$5,$6,'cancelled')`,
    [ids.booking, ids.business, ids.service, ids.staff, target.toISOString(), end.toISOString()]);
  for (const [id, optedIn] of [[ids.request, true], [ids.secondRequest, true], [ids.oldRequest, false]]) {
    await db.query(`insert into appointment_waitlist_requests
      (id,business_id,service_id,customer_name,customer_email,preferred_after,preferred_before,automatic_offer_email_opt_in_at)
      values($1,$2,$3,'Test Client',$5,now()-interval '1 day',now()+interval '14 days',
        case when $4 then now() else null end)`, [id, ids.business, ids.service, optedIn,
        id===ids.secondRequest ? 'second-client@example.invalid' : 'test-client@example.invalid']);
  }
  await assert.rejects(db.query(`select reserve_appointment_waitlist_offer($1,$2,$3,$4)`,
    [ids.oldRequest, ids.booking, 'c'.repeat(64), 'd'.repeat(64)]), /eligible/i);
  const first = await db.query(`select reserve_appointment_waitlist_offer($1,$2,$3,$4) as offer`,
    [ids.request, ids.booking, 'a'.repeat(64), 'b'.repeat(64)]);
  const offered = first.rows[0].offer;
  assert.equal(offered.customer_email, 'test-client@example.invalid');
  assert.equal((await db.query(`select count(*)::int as n from public_booking_slots where staff_id=$1 and starts_at=$2`,
    [ids.staff, target.toISOString()])).rows[0].n, 1, 'offer hold must be visible to availability');
  await assert.rejects(db.query(`select reserve_appointment_waitlist_offer($1,$2,$3,$4)`,
    [ids.secondRequest, ids.booking, 'e'.repeat(64), 'f'.repeat(64)]), /SLOT_TAKEN/i);
  await assert.rejects(db.query(`select create_public_booking($1,$2,$3,'Other','other@example.invalid','',$4,$5,'',null,null)`,
    [ids.business, ids.service, ids.staff, target.toISOString(), end.toISOString()]), /SLOT_TAKEN/i);
  const claimed = await db.query(`select accept_appointment_waitlist_offer_free($1) as booking_id`, ['a'.repeat(64)]);
  assert.ok(claimed.rows[0].booking_id, 'recipient can book their held time');
  await assert.rejects(db.query(`select accept_appointment_waitlist_offer_free($1)`, ['a'.repeat(64)]), /expired|no longer/i);
  assert.equal((await db.query(`select status from appointment_waitlist_requests where id=$1`, [ids.request])).rows[0].status, 'closed');
  assert.equal((await db.query(`select status from appointment_waitlist_offers where id=$1`, [offered.offer_id])).rows[0].status, 'accepted');
  const paidStart = new Date(target.getTime() + 24 * 60 * 60_000);
  const paidEnd = new Date(paidStart.getTime() + 60 * 60_000);
  await db.query(`insert into appointment_waitlist_requests
    (id,business_id,service_id,customer_name,customer_email,preferred_after,preferred_before,automatic_offer_email_opt_in_at)
    values($1,$2,$3,'Paid Client','paid-client@example.invalid',now()-interval '1 day',now()+interval '14 days',now())`,
    [ids.paidRequest,ids.business,ids.service]);
  await db.query(`insert into bookings(id,business_id,service_id,staff_id,customer_name,starts_at,ends_at,status)
    values($1,$2,$3,$4,'Paid cancelled fixture',$5,$6,'confirmed')`,
    [ids.paidBooking,ids.business,ids.service,ids.staff,paidStart.toISOString(),paidEnd.toISOString()]);
  await db.query(`update bookings set status='cancelled' where id=$1`,[ids.paidBooking]);
  assert.equal((await db.query(`select count(*)::int as n from appointment_opening_events where booking_id=$1 and processed_at is null`,[ids.paidBooking])).rows[0].n,1);
  const second = await db.query(`select reserve_appointment_waitlist_offer($1,$2,$3,$4) as offer`,
    [ids.paidRequest,ids.paidBooking,'e'.repeat(64),'f'.repeat(64)]);
  const paidOffer = second.rows[0].offer;
  await db.query(`update businesses set payment_mode='full',stripe_account_id='acct_fixture',stripe_charges_enabled=true where id=$1`, [ids.business]);
  const converted = await db.query(`select accept_appointment_waitlist_offer_checkout($1,$2,$3,$4,$5,$6) as hold`,
    ['e'.repeat(64),ids.business,ids.service,ids.staff,paidStart.toISOString(),'f'.repeat(64)]);
  assert.equal(converted.rows[0].hold.amount_cents, 1200);
  assert.equal(converted.rows[0].hold.payment_mode, 'full');
  assert.equal((await db.query(`select status from appointment_waitlist_offers where id=$1`, [paidOffer.offer_id])).rows[0].status,'checkout');
  assert.equal((await db.query(`select stop_appointment_waitlist_offer_alerts($1) as stopped`, ['e'.repeat(64)])).rows[0].stopped,true);
  assert.equal((await db.query(`select status from appointment_waitlist_requests where id=$1`, [ids.paidRequest])).rows[0].status,'closed');
  assert.ok(new Date((await db.query(`select expires_at from booking_checkout_holds where id=$1`,[converted.rows[0].hold.id])).rows[0].expires_at).getTime() > Date.now(),
    'stopping alerts must not invalidate a checkout already in progress');
  await assert.rejects(db.query(`select reserve_appointment_waitlist_offer($1,$2,$3,$4)`,
    [ids.secondRequest,ids.paidBooking,'1'.repeat(64),'2'.repeat(64)]), /SLOT_TAKEN/i);
  await db.query(`update booking_checkout_holds set expires_at=now() where id=$1`,[converted.rows[0].hold.id]);
  const nextOffer = await db.query(`select reserve_appointment_waitlist_offer($1,$2,$3,$4) as offer`,
    [ids.secondRequest,ids.paidBooking,'1'.repeat(64),'2'.repeat(64)]);
  assert.ok(nextOffer.rows[0].offer.offer_id, 'the next eligible client can receive the slot after expiry');
  console.log('Better-time offer checks passed: explicit opt-in, one hold, public conflict, single-use booking, paid conversion, safe opt-out and next-in-line.');
}
