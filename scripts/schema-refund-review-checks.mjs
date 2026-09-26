import assert from 'node:assert/strict';
export async function checkRefundReviews(db) {
 const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 let checks=0;const same=(a,b)=>{assert.deepEqual(a,b);checks++;};
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const fail=async(p,re)=>{await assert.rejects(p,re);checks++;};
 await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role'})]);
 const record=(status='failed',refund='re_review',pi='pi_schema_refund',business=id(101))=>q('select record_stripe_refund_review($1,$2,$3,$4)',[business,pi,refund,status]);
 await record();await record();same((await q('select count(*)::int as n from stripe_refund_reviews'))[0].n,1);
 same((await q('select manual_review from stripe_refund_reviews'))[0].manual_review,true);
 await record('requires_action');same((await q('select provider_status from stripe_refund_reviews'))[0].provider_status,'requires_action');
 await fail(record('succeeded'),/Invalid/);await fail(record('failed','re_other','pi_missing'),/not yet/);
 await fail(record('failed','re_review','pi_gift_fixture'),/identity/);
 await record('canceled','re_gift_review','pi_gift_fixture');
 same((await q('select count(*)::int as n from stripe_refund_reviews'))[0].n,2);
 same((await q("select amount_refunded_cents from bookings where id=$1",[id(501)]))[0].amount_refunded_cents,5000);
 await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:id(1),aal:'aal2'})]);
 same((await q('select count(*)::int as n from stripe_refund_reviews'))[0].n,2);
 await fail(record(),/permission denied/);
 await fail(db.query('update stripe_refund_reviews set manual_review=false'),/permission denied/);
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:id(2),aal:'aal2'})]);
 same((await q('select count(*)::int as n from stripe_refund_reviews'))[0].n,0);
 await db.exec('reset role');
 console.log(`Refund reviews: ${checks} full-schema assertions passed.`);
}
