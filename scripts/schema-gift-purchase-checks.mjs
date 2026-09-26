import assert from 'node:assert/strict';

export async function checkGiftPurchases(db) {
  const id=n=>`11000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const businessId='10000000-0000-4000-8000-000000000101';
  let checks=0;
  const same=(actual,expected)=>{assert.deepEqual(actual,expected);checks++;};
  const fail=async(promise,pattern)=>{await assert.rejects(promise,pattern);checks++;};
  const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
  const fulfill=(amount=2500,currency='gbp',session='cs_gift_fixture',intent='pi_gift_purchase_fixture')=>
    q('select fulfill_gift_card_purchase($1,$2,$3,$4,$5,$6) as id',
      [id(901),businessId,amount,currency,session,intent]);

  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role'})]);
  await db.query(`insert into gift_card_orders(
    id,business_id,amount_cents,currency,purchaser_name,purchaser_email,
    recipient_name,code_hash,code_hint,display_token_hash,request_key,
    stripe_checkout_session_id
  ) values($1,$2,2500,'gbp','Buyer','buyer@example.invalid','Recipient',$3,'TEST',$4,$5,'cs_gift_fixture')`,
    [id(901),businessId,'f'.repeat(64),'a'.repeat(64),'b'.repeat(64)]);

  await fail(fulfill(null),/Invalid gift card payment details/);
  await fail(fulfill(2500,null),/Invalid gift card payment details/);
  await fail(fulfill(2500,'gbp',''),/Invalid gift card payment details/);
  await fail(fulfill(2500,'gbp','cs_gift_fixture',' '),/Invalid gift card payment details/);
  await fail(fulfill(2400),/Unexpected gift card purchase amount/);
  await fail(fulfill(2500,'usd'),/Unexpected gift card purchase amount/);
  await fail(fulfill(2500,'gbp','cs_wrong'),/checkout session mismatch/);

  const first=await fulfill();
  same(first.length,1);
  same((await fulfill())[0].id,first[0].id);
  same((await q('select count(*)::int as n from gift_cards where stripe_payment_intent_id=$1',['pi_gift_purchase_fixture']))[0].n,1);
  same((await q("select count(*)::int as n from gift_card_transactions where idempotency_key='stripe:pi_gift_purchase_fixture'"))[0].n,1);
  await fail(fulfill(2501),/Unexpected gift card purchase amount/);
  await fail(fulfill(2500,'usd'),/Unexpected gift card purchase amount/);
  await fail(fulfill(2500,'gbp','cs_gift_fixture','pi_other'),/payment mismatch/);

  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:id(1),aal:'aal2'})]);
  await fail(fulfill(),/permission denied/);
  await db.exec('reset role');
  console.log(`Gift purchases: ${checks} full-schema assertions passed.`);
}
