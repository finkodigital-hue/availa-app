import assert from 'node:assert/strict';

export async function checkApprovedPlans(db) {
  const id = n => `91000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  let checks = 0;
  const q = async (sql, args = []) => (await db.query(sql, args)).rows;
  const same = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
  const denied = async sql => { await assert.rejects(db.query(sql), /Studio plan/); checks++; };
  await db.exec('reset role; begin');
  try {
    await q("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({role:'service_role'})]);
    await db.exec(`
      insert into auth.users(id,email,email_confirmed_at) values
        ('${id(1)}','plans-owner@example.invalid',now()),('${id(2)}','plans-staff@example.invalid',now());
      insert into businesses(id,owner_id,name,slug,plan) values
        ('${id(3)}','${id(1)}','Plan fixture','plan-fixture','studio');
      insert into staff(id,business_id,name) values ('${id(4)}','${id(3)}','Plan stylist');
      insert into staff_memberships(business_id,staff_id,user_id,access_role) values
        ('${id(3)}','${id(4)}','${id(2)}','manager');
      insert into inventory_items(id,business_id,name,current_stock) values ('${id(5)}','${id(3)}','Plan product',10);
      insert into gift_card_orders(id,business_id,amount_cents,currency,purchaser_name,purchaser_email,recipient_name,code_hash,code_hint,display_token_hash,request_key,stripe_checkout_session_id)
      values ('${id(6)}','${id(3)}',2500,'gbp','Buyer','buyer@example.invalid','Recipient','${'a'.repeat(64)}','TEST','${'b'.repeat(64)}','${'c'.repeat(64)}','cs_plan_fixture');
      update businesses set custom_domain='book.example.invalid',email_footer='Studio footer' where id='${id(3)}';
      insert into services(id,business_id,name,duration_minutes,price_cents) values ('${id(7)}','${id(3)}','Plan service',30,2500);
      insert into service_recipe_items(business_id,service_id,inventory_item_id,quantity) values ('${id(3)}','${id(7)}','${id(5)}',2);
      insert into bookings(id,business_id,service_id,staff_id,customer_name,starts_at,ends_at,status) values
        ('${id(8)}','${id(3)}','${id(7)}','${id(4)}','Studio stock fixture','2031-01-01 10:00+00','2031-01-01 10:30+00','confirmed'),
        ('${id(9)}','${id(3)}','${id(7)}','${id(4)}','Free stock fixture','2031-01-01 11:00+00','2031-01-01 11:30+00','confirmed');
      update bookings set status='completed' where id='${id(8)}';

    `);
    await q("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({role:'authenticated',sub:id(2),aal:'aal2'})]);
    same((await q(`select has_business_permission('${id(3)}','calendar.manage') as allowed`))[0].allowed,true,'Studio staff access');
    await q("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({role:'service_role'})]);
    await db.exec(`update businesses set plan='free' where id='${id(3)}'`);
    await db.exec(`update bookings set status='completed' where id='${id(9)}'`);
    same(Number((await q(`select current_stock from inventory_items where id='${id(5)}'`))[0].current_stock),8,'Free completion skips saved Studio recipes');
    same((await q(`select count(*)::int as n from booking_stock_deductions where booking_id='${id(9)}'`))[0].n,0,'Free completion records no stock usage');
    await db.exec(`update bookings set status='confirmed' where id='${id(8)}'`);
    same(Number((await q(`select current_stock from inventory_items where id='${id(5)}'`))[0].current_stock),10,'Reversal restores old Studio deduction on Free');

    // Savepoints allow expected database errors without aborting the fixture transaction.
    const reject = async sql => {
      await db.exec('savepoint expected_denial');
      await denied(sql);
      await db.exec('rollback to savepoint expected_denial');
    };
    await reject(`update businesses set custom_domain='other.example.invalid' where id='${id(3)}'`);
    await reject(`update businesses set email_footer='Changed' where id='${id(3)}'`);
    await reject(`update staff_memberships set access_role='front_desk' where business_id='${id(3)}'`);
    await reject(`insert into gift_card_orders(business_id,amount_cents,currency,purchaser_name,purchaser_email,recipient_name,code_hash,code_hint,display_token_hash,request_key)
      values ('${id(3)}',2500,'gbp','Buyer','buyer@example.invalid','Recipient','${'d'.repeat(64)}','TEST','${'e'.repeat(64)}','${'f'.repeat(64)}')`);
    await reject(`insert into gift_cards(business_id,code_hash,code_hint,initial_balance_cents,balance_cents,currency,source)
      values ('${id(3)}','${'d'.repeat(64)}','TEST',2500,2500,'gbp','complimentary')`);
    await reject(`insert into calendar_connections(business_id,provider,account_email,calendar_id,access_token_secret_id,refresh_token_secret_id,access_token_expires_at)
      values ('${id(3)}','google','owner@example.invalid','primary','${id(10)}','${id(11)}',now())`);
    // An order accepted before downgrade must still settle exactly once.
    const purchase = `select fulfill_gift_card_purchase('${id(6)}','${id(3)}',2500,'gbp','cs_plan_fixture','pi_plan_fixture') as id`;
    const card = (await q(purchase))[0].id;
    same((await q(purchase))[0].id,card,'In-flight fulfilment stays idempotent on Free');
    await reject(`insert into gift_card_transactions(business_id,gift_card_id,type,amount_cents,balance_after_cents,idempotency_key)
      values ('${id(3)}','${card}','redemption',-100,2400,'free-plan-redemption')`);
    // Owner can still change basic details and enable reviews on Free.
    await q("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({role:'authenticated',sub:id(1),email:'plans-owner@example.invalid',aal:'aal2'})]);
    await db.exec('set role authenticated');
    await db.exec(`update businesses set review_requests_enabled=true,name='Free salon' where id='${id(3)}'`);
    same((await q(`select review_requests_enabled from businesses where id='${id(3)}'`))[0].review_requests_enabled,true,'Free review requests can be enabled');
    same((await q(`select count(*)::int as n from inventory_items where business_id='${id(3)}'`))[0].n,0,'Free cannot read Studio inventory');
    await db.exec('reset role');
    same(Number((await q(`select current_stock from inventory_items where id='${id(5)}'`))[0].current_stock),10,'Downgrade keeps stored inventory');
    same((await q(`select custom_domain from businesses where id='${id(3)}'`))[0].custom_domain,'book.example.invalid','Downgrade keeps branding');
    await q("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({role:'authenticated',sub:id(2),aal:'aal2'})]);
    same((await q(`select has_business_permission('${id(3)}','calendar.manage') as allowed`))[0].allowed,false,'Downgrade suspends existing staff access');
    await q("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({role:'service_role'})]);
    await db.exec(`update businesses set plan='studio' where id='${id(3)}'`);
    await q("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({role:'authenticated',sub:id(2),aal:'aal2'})]);
    same((await q(`select has_business_permission('${id(3)}','calendar.manage') as allowed`))[0].allowed,true,'Upgrade restores stored staff access');
    console.log(`Approved plans: ${checks} database checks passed (Free, Studio, downgrade, reviews and in-flight payments).`);
  } finally {
    await db.exec('reset role; rollback');
    await q("select set_config('request.jwt.claims','{}',false)");
  }
}
