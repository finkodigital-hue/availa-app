import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { checkSchemaRoles } from './schema-role-checks.mjs';
import { checkSchemaPaymentLedger } from './schema-payment-ledger-checks.mjs';
import { checkGiftRefunds } from './schema-gift-refund-checks.mjs';
import { checkRefundReviews } from './schema-refund-review-checks.mjs';

// Replay ALL application migrations. Supabase-owned Auth/Storage objects and
// external cron/HTTP/Vault services are local fixtures, not a full Supabase stack.
const db = new PGlite({extensions:{pgcrypto}});
await db.exec(`
create extension pgcrypto;
create role anon;create role authenticated;create role service_role bypassrls;create role authenticator;
create schema auth;create schema storage;create schema extensions;create schema cron;create schema net;create schema vault;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
create function auth.role() returns text language sql stable as $$select auth.jwt()->>'role'$$;
create function auth.email() returns text language sql stable as $$select auth.jwt()->>'email'$$;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
create table auth.mfa_factors(id uuid primary key,user_id uuid references auth.users(id),status text);
create table storage.buckets(id text primary key,name text,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,owner uuid,owner_id text,metadata jsonb);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;
create table vault.secrets(id uuid primary key default gen_random_uuid(),name text,secret text);
create view vault.decrypted_secrets as select id,name,secret as decrypted_secret from vault.secrets;
create function vault.create_secret(text,text) returns uuid language sql as $$insert into vault.secrets(secret,name) values($1,$2) returning id$$;
create function vault.update_secret(uuid,text) returns void language sql as $$update vault.secrets set secret=$2 where id=$1$$;
create function vault.delete_secret(uuid) returns void language sql as $$delete from vault.secrets where id=$1$$;
create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
create table cron.job(jobid bigint,jobname text,schedule text,command text,active boolean);
create function cron.unschedule(bigint) returns boolean language sql as $$select true$$;
create function net.http_post(url text,body jsonb default '{}',params jsonb default '{}',headers jsonb default '{}',timeout_milliseconds integer default 1000) returns bigint language sql as $$select 1::bigint$$;
grant usage on schema public,auth,storage to anon,authenticated,service_role;
grant all on all tables in schema storage to anon,authenticated,service_role;
alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;
`);
const dir=new URL('../supabase/migrations/',import.meta.url);
const migrations=fs.readdirSync(dir).filter(n=>n.endsWith('.sql')).sort();
let replayed=0,fixtures=0;
try {
 for(const name of migrations){
  if(name==='20260923005000_preserve_booking_buffers.sql') {
   // An existing near-term appointment must not make metadata backfill hit
   // the older customer cancellation trigger. No trigger is disabled.
   await db.exec(`insert into auth.users(id,email,email_confirmed_at) values('20000000-0000-4000-8000-000000000001','backfill@example.invalid',now());
    insert into businesses(id,owner_id,name,slug) values('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','Backfill fixture','backfill-fixture');
    insert into services(id,business_id,name,buffer_after_min) values('20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','Fixture',15);
    insert into staff(id,business_id,name) values('20000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000002','Fixture');
    insert into bookings(business_id,service_id,staff_id,customer_name,starts_at,ends_at) values('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000004','Fixture',now()+interval '1 hour',now()+interval '2 hours');`);
  }
  let sql=fs.readFileSync(new URL(name,dir),'utf8');
  sql=sql.replace(/^create extension if not exists (pg_cron|pg_net) with schema extensions;\s*$/gim,()=>{fixtures++;return '-- external extension replaced by inert local fixture';});
  try { await db.exec(sql);replayed++;
   if(name==='20260923005000_preserve_booking_buffers.sql') {
    assert.equal((await db.query("select buffer_after_min from bookings where customer_name='Fixture'")).rows[0].buffer_after_min,15);
    assert.equal((await db.query("select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}') as claims")).rows[0].claims,'{}');
    await db.exec("delete from businesses where slug='backfill-fixture';delete from auth.users where email='backfill@example.invalid'");
   }
  }
  catch(error){throw new Error(`Migration ${name}: ${error.message}`);}
 }
 const tables=(await db.query(`select count(*)::int as n from pg_tables where schemaname='public'`)).rows[0].n;
 assert.ok(tables>=59);
 await db.exec(`create temp table reminder_reset_fixture (
  starts_at timestamptz, reminder_sent_at timestamptz,
  sms_reminder_sent_at timestamptz, client_confirmed_at timestamptz
 );
 create trigger reset_fixture before update on reminder_reset_fixture
 for each row execute function public.reset_reminder_state_on_reschedule();
 insert into reminder_reset_fixture values (
  now()+interval '7 days',now(),now(),now()
 );`);
 await db.exec(`update reminder_reset_fixture set client_confirmed_at=client_confirmed_at`);
 let reminderState=(await db.query(`select reminder_sent_at,sms_reminder_sent_at,client_confirmed_at from reminder_reset_fixture`)).rows[0];
 assert.ok(reminderState.reminder_sent_at && reminderState.sms_reminder_sent_at && reminderState.client_confirmed_at);
 await db.exec(`update reminder_reset_fixture set starts_at=starts_at+interval '1 day'`);
 reminderState=(await db.query(`select reminder_sent_at,sms_reminder_sent_at,client_confirmed_at from reminder_reset_fixture`)).rows[0];
 assert.deepEqual(reminderState,{reminder_sent_at:null,sms_reminder_sent_at:null,client_confirmed_at:null});
 await db.exec(`select set_config('request.jwt.claims','{}',false);
  insert into auth.users(id,email,email_confirmed_at) values('30000000-0000-4000-8000-000000000001','change-fixture@example.invalid',now());
  insert into businesses(id,owner_id,name,slug,timezone) values('30000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','Change fixture','change-fixture','UTC');
  insert into services(id,business_id,name) values('30000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000002','Fixture');
  insert into staff(id,business_id,name) values('30000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000002','Fixture');
  insert into bookings(id,business_id,service_id,staff_id,customer_name,starts_at,ends_at)
  values('30000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000004','Fixture','2030-01-07 10:00+00','2030-01-07 11:00+00');
  update bookings set customer_name='Still fixture' where id='30000000-0000-4000-8000-000000000005';`);
 assert.equal((await db.query("select count(*)::int as n from booking_change_email_outbox")).rows[0].n,0);
 assert.equal((await db.query("select sms_reminder_notice_at from bookings where id='30000000-0000-4000-8000-000000000005'")).rows[0].sms_reminder_notice_at,null);
 await db.exec("update bookings set sms_reminder_notice_at=now(),sms_reminder_notice_version='appointment-service-sms-v1' where id='30000000-0000-4000-8000-000000000005'");
 assert.equal((await db.query("select sms_reminder_notice_version from bookings where id='30000000-0000-4000-8000-000000000005'")).rows[0].sms_reminder_notice_version,'appointment-service-sms-v1');
 await db.exec(`update bookings set starts_at=starts_at+interval '1 day',ends_at=ends_at+interval '1 day' where id='30000000-0000-4000-8000-000000000005'`);
 assert.deepEqual((await db.query("select change_type from booking_change_email_outbox order by created_at,id")).rows.map(row=>row.change_type),['rescheduled']);
 await db.exec(`update bookings set status='cancelled' where id='30000000-0000-4000-8000-000000000005'`);
 assert.deepEqual((await db.query("select change_type from booking_change_email_outbox order by created_at,id")).rows.map(row=>row.change_type).sort(),['cancelled','rescheduled']);
 await db.exec("delete from businesses where slug='change-fixture';delete from auth.users where email='change-fixture@example.invalid'");
 console.log(`Replayed ${replayed} application migrations; ${tables} public tables; metadata, reminder-reset and booking-change assertions passed. ${fixtures} external extension declarations use inert local fixtures.`);
 await checkSchemaRoles(db);
 await checkSchemaPaymentLedger(db);
 await checkGiftRefunds(db);
 await checkRefundReviews(db);
} catch(error) {console.error(error);process.exitCode=1;}
finally {await db.close();}
