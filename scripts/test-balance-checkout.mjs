import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { openBalanceCheckout } from '../src/lib/balance-checkout.server.ts';
const db = new PGlite();
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const business = id(1), other = id(2), booking = id(3);
let checks=0;
const same=(a,b)=>{assert.deepEqual(a,b);checks++;};
const rejects=async(p,re)=>{await assert.rejects(p,re);checks++;};
await db.exec(`create role anon;create role authenticated;create role service_role;
create table businesses(id uuid primary key,slug text,currency text,stripe_account_id text,stripe_charges_enabled boolean,deletion_requested_at timestamptz);
create table bookings(id uuid primary key,business_id uuid,price_cents integer,amount_paid_cents integer,amount_due_cents integer,amount_refunded_cents integer default 0,payment_status text default 'deposit_paid',status text default 'confirmed',customer_name text,customer_email text);
create table payments(id uuid default gen_random_uuid(),booking_id uuid,business_id uuid,stripe_payment_intent_id text,stripe_charge_id text,type text,status text,amount_cents integer,currency text,customer_name text,customer_email text,description text);
create unique index unique_charge on payments(stripe_payment_intent_id) where type='charge';
insert into businesses values('${business}','fixture','gbp','acct_fixture',true,null),('${other}','other','gbp','acct_other',true,null);
insert into bookings(id,business_id,price_cents,amount_paid_cents,amount_due_cents,customer_name,customer_email) values('${booking}','${business}',5000,1500,3500,'Fictional','person@example.invalid');`);
await db.exec(fs.readFileSync(new URL('../supabase/migrations/20260923004000_balance_checkout_safety.sql',import.meta.url),'utf8'));
const signatures={claim_balance_checkout:['p_business_id','p_booking_id','p_origin'],record_balance_checkout_session:['p_attempt_id','p_session_id'],expire_balance_checkout:['p_attempt_id','p_session_id'],fulfill_balance_checkout:['p_attempt_id','p_session_id','p_payment_intent_id','p_amount_cents','p_currency']};
const database={
 async rpc(name,args){try {const keys=signatures[name];if(!keys)throw Error('Unknown RPC');const result=await db.query(`select ${name}(${keys.map((_,i)=>'$'+(i+1)).join(',')}) as value`,keys.map(k=>args[k]));return {data:result.rows[0].value};}catch(error){return {error};}},
 from(name){assert.equal(name,'balance_checkout_attempts');return {update(values){this.values=values;this.filters={};return this;},eq(k,v){this.filters[k]=v;return this;},async then(resolve){try{await db.query('update balance_checkout_attempts set state=$1,last_error=$2 where id=$3 and state=$4',[this.values.state,this.values.last_error,this.filters.id,this.filters.state]);resolve({error:null});}catch(error){resolve({error});}}};}
};
const claim=async(b=business,bk=booking)=>{const r=await database.rpc('claim_balance_checkout',{p_business_id:b,p_booking_id:bk,p_origin:'https://example.invalid'});if(r.error)throw r.error;return r.data;};
const first=await claim(); same(first.amount_cents,3500); same((await claim()).id,first.id);
await rejects(claim(other),/Booking not found/);
await db.exec(`update bookings set price_cents=6000`);await rejects(claim(),/previous checkout/);await db.exec(`update bookings set price_cents=5000`);
await db.exec(`update businesses set currency='usd' where id='${business}'`);await rejects(claim(),/previous checkout/);await db.exec(`update businesses set currency='gbp' where id='${business}'`);
await db.exec(`update bookings set status='cancelled'`);await rejects(claim(),/payment review/);await db.exec(`update bookings set status='confirmed',amount_refunded_cents=1`);await rejects(claim(),/payment review/);await db.exec(`update bookings set amount_refunded_cents=0`);
await db.exec(`update businesses set deletion_requested_at=now() where id='${business}'`);await rejects(claim(),/unavailable/);await db.exec(`update businesses set deletion_requested_at=null`);
await db.exec(`set role anon`);await rejects(db.query('select * from balance_checkout_attempts'),/permission denied/);await rejects(db.query(`select claim_balance_checkout('${business}','${booking}','x')`),/permission denied/);await db.exec(`reset role;set role authenticated`);await rejects(db.query(`select fulfill_stripe_balance_payment('${booking}','${business}',3500,'gbp','pi_bad',null)`),/permission denied/);await db.exec('reset role');

const makeSession=(a,extra={})=>({id:'cs_fixture',status:'open',payment_status:'unpaid',amount_total:a.amount_cents,currency:a.currency,url:'https://checkout.stripe.com/c/pay/fixture',metadata:{balance_attempt_id:a.id,business_id:business,booking_id:booking},...extra});
let requests=[], session=makeSession(first), posted=[];
const provider=async(url,options)=>{requests.push({url,method:options.method??'GET'});same(options.headers['Stripe-Account'],'acct_fixture');if(options.method==='POST'){posted.push({body:options.body.toString(),key:options.headers['Idempotency-Key']});return Response.json(session);}return Response.json(session);};
const deps={database,stripeFetch:provider,key:'fictional',origin:'https://example.invalid'};
same(await openBalanceCheckout(business,booking,deps),{checkoutUrl:session.url});
same(requests.map(r=>r.method),['POST','GET']);
requests=[];same(await openBalanceCheckout(business,booking,deps),{checkoutUrl:session.url});same(requests.map(r=>r.method),['GET']);
// A crash before saving the session reuses the exact request and key, even if
// the customer's editable email or the configured origin has changed.
await db.exec(`update balance_checkout_attempts set session_id=null;update bookings set customer_email='changed@example.invalid'`);
await openBalanceCheckout(business,booking,{...deps,origin:'https://changed.example.invalid'});same(posted[0],posted[1]);
await rejects(openBalanceCheckout(business,booking,{...deps,stripeFetch:async()=>{throw Error('fictional timeout');}}),/timeout/);
same((await claim()).id,first.id);
const tampered=async()=>Response.json({...session,currency:'usd'});await rejects(openBalanceCheckout(business,booking,{...deps,stripeFetch:tampered}),/do not match/);
session={...session,status:'complete',payment_status:'unpaid'};await rejects(openBalanceCheckout(business,booking,deps),/being checked/);
// Expiry is provider-verified before the attempt can be replaced.
session={...session,status:'expired'};await rejects(openBalanceCheckout(business,booking,deps),/expired safely/);
const next=await claim();assert.notEqual(next.id,first.id);checks++;
session=makeSession(next,{id:'cs_second'});await openBalanceCheckout(business,booking,deps);
// A paid cached creation response is never blindly returned as an open link.
session={...session,status:'complete',payment_status:'paid',payment_intent:'pi_balance'};
same(await openBalanceCheckout(business,booking,deps),{paid:true});
same((await db.query(`select amount_paid_cents,amount_due_cents,payment_status from bookings where id='${booking}'`)).rows[0],{amount_paid_cents:5000,amount_due_cents:0,payment_status:'paid'});
const fulfill=(attempt=next.id,pi='pi_balance',amount=3500,currency='gbp',sid='cs_second')=>db.query('select fulfill_balance_checkout($1,$2,$3,$4,$5)',[attempt,sid,pi,amount,currency]);
await fulfill();same((await db.query(`select count(*)::integer as n from payments where type='charge'`)).rows[0].n,1);
await rejects(fulfill(next.id,'pi_other'),/mismatch/);await rejects(fulfill(next.id,'pi_balance',3500,'usd'),/mismatch/);await rejects(fulfill(next.id,'pi_balance',3500,'gbp','cs_other'),/mismatch/);
await rejects(db.query(`select fulfill_stripe_balance_payment('${id(90)}','${other}',3500,'gbp','pi_balance',null)`),/identity mismatch/);
await rejects(db.query(`select fulfill_stripe_balance_payment('${booking}','${business}',null,'gbp','pi_invalid',null)`),/Invalid balance/);
// A failure audit row cannot masquerade as a successfully fulfilled charge.
await db.exec(`update bookings set amount_paid_cents=1500,amount_due_cents=3500,payment_status='deposit_paid';insert into payments(type,status,stripe_payment_intent_id,amount_cents,currency) values('failure','failed','pi_after_failure',3500,'gbp')`);
await db.query(`select fulfill_stripe_balance_payment('${booking}','${business}',3500,'gbp','pi_after_failure',null)`);
same((await db.query(`select count(*)::int as n from payments where type='charge' and stripe_payment_intent_id='pi_after_failure'`)).rows[0].n,1);
await db.exec(`update bookings set amount_paid_cents=1500,amount_due_cents=3500,payment_status='deposit_paid';update balance_checkout_attempts set state='expired';`);
const old=await claim();await db.query(`update balance_checkout_attempts set created_at=now()-interval '24 hours' where id=$1`,[old.id]);
let calls=0;await rejects(openBalanceCheckout(business,booking,{...deps,stripeFetch:async()=>{calls++;throw Error('must not call');}}),/support review/);same(calls,0);same((await claim()).state,'review');
await rejects(openBalanceCheckout(business,booking,deps),/support review/);
await db.exec(`delete from bookings`);same((await db.query('select count(*)::int as n from balance_checkout_attempts')).rows[0].n,0);
// Competing application requests share the SQL attempt and Stripe key. This
// simulates provider idempotency; it is not a multi-connection load test.
await db.exec(`insert into bookings(id,business_id,price_cents,amount_paid_cents,amount_due_cents,customer_email) values('${booking}','${business}',6000,2000,4000,'new@example.invalid')`);
const competing=await claim();let providerObjects=0;const keys=new Map();
const concurrentProvider=async(url,options)=>{
 if(options.method==='POST'){
  const key=options.headers['Idempotency-Key'],body=options.body.toString();
  if(keys.has(key)) assert.equal(keys.get(key),body);else {keys.set(key,body);providerObjects++;}
 }
 return Response.json(makeSession(competing,{id:'cs_competing'}));
};
const results=await Promise.all([openBalanceCheckout(business,booking,{...deps,stripeFetch:concurrentProvider}),openBalanceCheckout(business,booking,{...deps,stripeFetch:concurrentProvider})]);
same(providerObjects,1);same(results[0],results[1]);same((await db.query(`select count(*)::int as n from balance_checkout_attempts where state='active'`)).rows[0].n,1);
await rejects(db.query(`select fulfill_balance_checkout('${competing.id}','cs_competing','pi_wrong_currency',4000,'usd')`),/mismatch/);
await db.close();console.log(`${checks} balance checkout, payment identity, recovery and access assertions passed (fictional provider; no charges).`);
