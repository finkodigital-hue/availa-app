import assert from 'node:assert/strict';

export async function checkSchemaRoles(db) {
 const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 let checks=0;
 const same=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;};
 const rows=async sql=>(await db.query(sql)).rows;
 const fail=async(sql,pattern)=>{await assert.rejects(db.query(sql),pattern);checks++;};
 const login=async(user,aal='aal1')=>{
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:user?'authenticated':'anon',sub:user?id(user):undefined,email:user?`fixture${user}@example.invalid`:undefined,aal})]);
  await db.exec(user?'set role authenticated':'set role anon');
 };
 await db.exec(`insert into auth.users(id,email,email_confirmed_at) select ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'fixture'||n||'@example.invalid',case when n=8 then null else now() end from generate_series(1,9) n;
 insert into businesses(id,owner_id,name,slug,timezone,email_suppressed,sms_suppressed,plan) values
 ('${id(101)}','${id(1)}','Fictional A','fictional-a','Europe/London',true,true,'studio'),('${id(102)}','${id(2)}','Fictional B','fictional-b','Europe/London',true,true,'studio');
 insert into staff(id,business_id,name) values ('${id(201)}','${id(101)}','A owner'),('${id(202)}','${id(102)}','B owner'),('${id(203)}','${id(101)}','A manager'),('${id(204)}','${id(101)}','A front desk'),('${id(205)}','${id(101)}','A practitioner'),('${id(206)}','${id(101)}','A invite');
 insert into staff_memberships(business_id,staff_id,user_id,access_role) values ('${id(101)}','${id(203)}','${id(3)}','manager'),('${id(101)}','${id(204)}','${id(4)}','front_desk'),('${id(101)}','${id(205)}','${id(5)}','practitioner');
 insert into services(id,business_id,name,duration_minutes,price_cents) values ('${id(301)}','${id(101)}','A cut',30,1000),('${id(302)}','${id(102)}','B cut',30,1000);
 insert into customers(id,business_id,name,email) values ('${id(401)}','${id(101)}','Customer A','fixture7@example.invalid'),('${id(402)}','${id(102)}','Customer B','other@example.invalid');
 insert into bookings(id,business_id,service_id,staff_id,customer_id,customer_name,customer_email,starts_at,ends_at) values
 ('${id(501)}','${id(101)}','${id(301)}','${id(201)}','${id(401)}','Customer A','fixture7@example.invalid',date_trunc('week',now())+interval '14 days 10 hours',date_trunc('week',now())+interval '14 days 10 hours 30 minutes'),
 ('${id(502)}','${id(102)}','${id(302)}','${id(202)}','${id(402)}','Customer B','other@example.invalid',date_trunc('week',now())+interval '14 days 10 hours',date_trunc('week',now())+interval '14 days 10 hours 30 minutes'),
 ('${id(503)}','${id(101)}','${id(301)}','${id(205)}','${id(401)}','Customer A','fixture7@example.invalid',date_trunc('week',now())+interval '14 days 11 hours',date_trunc('week',now())+interval '14 days 11 hours 30 minutes');
 insert into storage.buckets(id,name,public) values('business-assets','business-assets',false) on conflict do nothing;
 insert into storage.objects(bucket_id,name,owner) values
 ('business-assets','${id(101)}/private.txt','${id(1)}'),
 ('business-assets','${id(102)}/private.txt','${id(2)}'),
 ('business-public-assets','${id(101)}/logo/public.jpg','${id(1)}'),
 ('business-public-assets','${id(102)}/logo/public.jpg','${id(2)}');
 `);
 await login(1);
 same((await rows('select id from bookings order by id')).map(x=>x.id),[id(501),id(503)],'Owner sees own appointments only');
 same((await rows('select id from customers')).map(x=>x.id),[id(401)],'Owner sees own customers only');
 same((await rows("select name from storage.objects where bucket_id='business-assets'")).map(x=>x.name),[`${id(101)}/private.txt`],'Private storage owner scope');
 same((await rows("select name from storage.objects where bucket_id='business-public-assets'")).map(x=>x.name),[`${id(101)}/logo/public.jpg`],'Owner can manage own public asset metadata');
 await fail(`insert into storage.objects(bucket_id,name,owner) values('business-public-assets','${id(102)}/overwrite.png','${id(1)}')`,/row-level security/);
 same((await rows(`update bookings set notes='cross-tenant attack' where id='${id(502)}' returning id`)),[],'Cross-tenant update denied');
 const exported=(await rows(`select export_owner_workspace('${id(101)}') as data`))[0].data;
 same(exported.bookings?.length??exported.tables?.bookings?.length,2,'Full schema export includes own bookings');
 await fail(`select export_owner_workspace('${id(102)}')`,/Workspace not found/);
 await login(6);
 same(await rows('select id from businesses'),[],'Stranger cannot read base business secrets');
 same(await rows('select id from staff'),[],'Stranger cannot read private staff');
 same(await rows('select id from customers'),[],'Stranger cannot read customers');
 same(await rows('select id from bookings'),[],'Stranger cannot read bookings');
 same(await rows("select name from storage.objects where bucket_id='business-assets'"),[],'Stranger cannot read private files');
 same(await rows("select name from storage.objects where bucket_id='business-public-assets'"),[],'Stranger cannot list public asset metadata');
 await fail(`insert into customers(business_id,name) values('${id(101)}','Injected')`,/row-level security/);
 await fail(`select get_calendar_credentials('${id(101)}')`,/permission denied/);
 await fail(`select * from balance_checkout_attempts`,/permission denied/);
 same((await rows('select id from public_businesses')).length,2,'Public discovery remains available');
 await login(3);
 same((await rows('select id from bookings')).length,2,'Manager own workspace');
 same((await rows(`select has_business_permission('${id(101)}','services.manage') as ok`))[0].ok,true,'Manager services');
 same(await rows(`update businesses set name='Escalation' where id='${id(101)}' returning id`),[],'Manager cannot change owner settings');
 await fail(`select * from consultation_submissions`,/permission denied/);
 await login(4);
 same((await rows('select id from bookings')).length,2,'Front desk calendar');
 same((await rows(`select has_business_permission('${id(101)}','services.manage') as ok`))[0].ok,false,'Front desk cannot manage services');
 await fail(`select * from consultation_submissions`,/permission denied/);
 await login(5);
 same((await rows('select id from bookings')).map(x=>x.id),[id(503)],'Practitioner only assigned calendar');
 same(await rows(`update bookings set notes='Forbidden edit' where id='${id(503)}' returning id`),[],'Practitioner calendar read only');
 await login(7);
 same((await rows('select id from bookings order by id')).map(x=>x.id),[id(501),id(503)],'Customer own email only');
 await fail(`update bookings set price_cents=1 where id='${id(501)}'`,/only change booking status/);
 await login(1);
 const invitation=(await rows(`select * from create_staff_account_invitation('${id(206)}','fixture9@example.invalid','front_desk')`))[0];
 await login(6);await fail(`select accept_staff_account_invitation('${invitation.token}')`,/invited email/);
 await login(9);same((await rows(`select accept_staff_account_invitation('${invitation.token}') as business`))[0].business,id(101),'Intended invite accepted');
 await fail(`select accept_staff_account_invitation('${invitation.token}')`,/invalid or expired/);
 await login(1);await db.exec(`update staff_memberships set active=false where user_id='${id(9)}'`);
 await login(9);same(await rows('select id from bookings'),[],'Revocation applies to existing identity');
 await db.exec('reset role');await db.exec(`insert into auth.mfa_factors values('${id(601)}','${id(1)}','verified')`);
 await login(1);await fail('select check_request_assurance()',/verification required/);
 same(await rows('select id from bookings'),[],'MFA AAL1 denied by restrictive RLS');
 same(await rows("select name from storage.objects where bucket_id='business-assets'"),[],'MFA AAL1 private storage denied');
 await login(1,'aal2');await db.query('select check_request_assurance()');checks++;
 same((await rows('select id from bookings')).length,2,'MFA AAL2 legitimate access');
 await login(8);await fail('select check_request_assurance()',/verification required/);
 same(await rows('select id from bookings'),[],'Unverified identity denied');
 await login(null);same((await rows('select id from public_businesses')).length,2,'Anonymous discovery');
 same(await rows("select name from storage.objects where bucket_id='business-public-assets'"),[],'Anonymous callers cannot enumerate public asset names');
 // These four views intentionally run as their owner so public booking can
 // read a narrow projection without opening the underlying tenant tables.
 // Lock down the projection: a later migration must not silently expose a
 // private field through a security-definer view.
 const viewColumns=async name=>(await db.query(`select column_name from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position`,[name])).rows.map(row=>row.column_name);
 same(await viewColumns('blocked_dates_public'),['id','business_id','staff_id','starts_at','ends_at','kind'],'Public blocked dates expose only scheduling fields');
 same(await viewColumns('public_staff'),['id','business_id','name','role','photo_url','bio','bookable','active'],'Public staff expose no contact or account fields');
 same(await viewColumns('public_businesses'),['id','name','slug','logo_url','description','address','phone','email','website','timezone','instagram','facebook','twitter','tiktok','cover_image_url','welcome_message','booking_instructions','cancellation_policy','terms','faq','show_prices','show_staff','show_durations','emergency_message','emergency_active','custom_domain','favicon_url','browser_title','currency','hide_powered_by','deposit_percent','payment_mode','cancellation_window_hours','page_theme','reminder_hours_before'],'Public business view exposes only published storefront fields');
 same(await viewColumns('public_booking_slots'),['business_id','staff_id','starts_at','ends_at','gap_min','active_after_min','buffer_before_min','buffer_after_min','occupied_starts_at','occupied_ends_at'],'Public booking slots expose no customer or payment fields');
 await fail(`select join_waitlist('fixture@example.invalid',null)`,/permission denied/);
 await fail(`select create_public_booking('${id(101)}','${id(301)}','${id(201)}','Fixture','','',now()+interval '7 days',now()+interval '7 days 1 hour','',null,null)`,/permission denied/);
 await fail(`select assert_no_booking_conflict('${id(201)}',now()+interval '7 days',now()+interval '7 days 1 hour',null,null,null)`,/permission denied/);
 await fail('select * from balance_checkout_attempts',/permission denied/);
 await fail(`select claim_balance_checkout('${id(101)}','${id(501)}','https://example.invalid')`,/permission denied/);
 await db.exec('reset role');
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role'})]);
 await db.exec(`insert into bookings(id,business_id,service_id,staff_id,customer_id,customer_name,customer_email,starts_at,ends_at)
  values('${id(504)}','${id(101)}','${id(301)}','${id(201)}','${id(401)}','Customer A','fixture7@example.invalid',now()-interval '1 hour',now()-interval '30 minutes')`);
 await login(7);await fail(`update bookings set status='cancelled' where id='${id(504)}'`,/cancellation window/);
 await login(4);
 same((await rows(`update bookings set status='completed' where id='${id(504)}' returning status`))[0].status,'completed','Reception can complete current appointment');
 same((await rows(`update bookings set status='cancelled' where id='${id(504)}' returning status`))[0].status,'cancelled','Reception can cancel on customer behalf');
 await fail(`update bookings set stripe_payment_intent_id='pi_forged' where id='${id(504)}'`,/server|payment|Stripe/i);
 await db.exec('reset role');
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'service_role'})]);
 await db.exec('set role service_role');
 const publicBooking=(await rows(`select create_public_booking('${id(101)}','${id(301)}','${id(201)}','Public fictional customer','public-fixture@example.invalid','',date_trunc('week',now())+interval '14 days 13 hours',date_trunc('week',now())+interval '14 days 23 hours','',null,null) as id`))[0].id;
 same((await rows(`select price_cents from bookings where id='${publicBooking}'`))[0].price_cents,1000,'Server booking preserves authoritative price');
 same((await rows(`select extract(epoch from ends_at-starts_at)::integer as seconds from bookings where id='${publicBooking}'`))[0].seconds,1800,'Server booking ignores forged duration');
 await db.exec('reset role');
 console.log(`${checks} full-application-schema role, invitation, export, MFA and storage-policy assertions passed (local Auth/Storage fixtures).`);
 return checks;
}
