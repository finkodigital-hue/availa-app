// Apply the real upgrade to a populated local queue. No hosted data or providers.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
let checks = 0;
const same = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const ok = (value, message) => { assert.ok(value, message); checks++; };
const rejects = async (query, pattern) => { await assert.rejects(query, pattern); checks++; };
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const id = n => `63000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const migration = name => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const rows = async () => (await q('select to_jsonb(r) as row from public.account_deletion_requests r order by id')).map(r => r.row);
const keys = async () => await q('select * from public.account_deletion_request_keys order by user_id,request_key');
const functions = async () => await q(`select p.proname, p.proacl::text as acl,
  pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname like '%account_deletion%' order by p.proname`);
const access = async () => await q(`select c.relname,c.relacl::text as acl,c.relrowsecurity,
  (select jsonb_agg(to_jsonb(p) order by p.polname) from pg_policy p where p.polrelid=c.oid) as policies
  from pg_class c where c.oid in ('public.account_deletion_requests'::regclass,
    'public.account_deletion_request_keys'::regclass) order by c.relname`);
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.role() returns text language sql stable as
      $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'$$;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz);
    grant usage on schema public,auth to anon,authenticated,service_role;`);
  await db.exec(migration('20261125020000_add_account_deletion_requests.sql'));
  for (let n = 1; n <= 4; n++) {
    await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [id(n), `target-${n}@example.invalid`]);
    await q(`insert into public.account_deletion_requests(id,user_id,contact_email,requested_at,review_due_at,completion_target_at)
      values($1,$2,$3,'2026-01-31 12:00+00','2026-02-01 12:00+00','2026-03-02 12:00+00')`, [id(n + 10), id(n), `target-${n}@example.invalid`]);
    await q('insert into public.account_deletion_request_keys(user_id,request_key,request_id) values($1,$2,$3)', [id(n), id(n + 20), id(n + 10)]);
  }
  await q(`update public.account_deletion_requests set status='in_review',review_started_at='2026-02-01 10:00+00',
    status_message='Review in progress.',operator_reference='private-fixture' where id=$1`, [id(12)]);
  await q(`update public.account_deletion_requests set status='cancelled',cancelled_at='2026-02-01 10:00+00' where id=$1`, [id(13)]);
  await q(`update public.account_deletion_requests set status='completed',review_started_at='2026-02-01 10:00+00',
    completed_at='2026-02-02 10:00+00',confirmation_sent_at='2026-02-02 11:00+00',
    operator_reference='private-fixture',retained_data_summary='Fixture retention evidence.' where id=$1`, [id(14)]);
  const before = await rows(), beforeKeys = await keys(), beforeFunctions = await functions(), beforeAccess = await access();
  // The deploy runner owns this transaction, including its migration receipt.
  await db.exec('begin');
  await db.exec(migration('20261125030000_shorten_account_deletion_target.sql'));
  await db.exec('commit');
  const after = await rows();
  same(after.length, before.length, 'Upgrade never deletes queue rows');
  for (let n = 0; n < after.length; n++) {
    if (['requested', 'in_review'].includes(before[n].status)) {
      const { completion_target_at: oldTarget, ...oldRecord } = before[n];
      const { completion_target_at: newTarget, ...newRecord } = after[n];
      same(newRecord, oldRecord, 'Open request identity, review date and evidence are unchanged');
      same(Date.parse(newTarget) - Date.parse(newRecord.requested_at), 648 * 3600_000);
      same(Date.parse(oldTarget) - Date.parse(newTarget), 72 * 3600_000);
    } else same(after[n], before[n], 'Closed historical receipt is byte-for-byte unchanged');
  }
  same(await keys(), beforeKeys, 'All durable request-key aliases survive');
  same(await access(), beforeAccess, 'Table grants, RLS and deny policies are unchanged');
  const afterFunctions = await functions();
  same(afterFunctions, beforeFunctions.map(f => ({ ...f,
    definition: f.proname === 'request_account_deletion_server'
      ? f.definition.replace("interval '720 hours'", "interval '648 hours'") : f.definition,
  })), 'Actual pg_get_functiondef and ACLs change only the request target literal');

  // Defaults, enforcement and service RPC all agree on 648 elapsed hours.
  const [defaultRow] = await q(`insert into public.account_deletion_requests(user_id,contact_email)
    values($1,'default@example.invalid') returning requested_at,review_due_at,completion_target_at`, [id(5)]);
  same(defaultRow.completion_target_at - defaultRow.requested_at, 648 * 3600_000);
  same(defaultRow.review_due_at - defaultRow.requested_at, 24 * 3600_000);
  await rejects(q("update public.account_deletion_requests set completion_target_at=requested_at+interval '720 hours' where id=$1", [id(11)]), /account_deletion_due_times/);
  await rejects(q("update public.account_deletion_requests set review_due_at=requested_at+interval '23 hours' where id=$1", [id(11)]), /account_deletion_due_times/);
  await q("insert into auth.users(id,email,email_confirmed_at) values($1,'new@example.invalid',now())", [id(6)]);
  await db.exec("set role service_role; select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)");
  const request = async (user, email, key) => (await q('select public.request_account_deletion_server($1,$2,$3) as row', [user, email, key]))[0].row;
  const created = await request(id(6), 'new@example.invalid', id(26));
  same(Date.parse(created.completion_target_at) - Date.parse(created.requested_at), 648 * 3600_000);
  same(Date.parse(created.review_due_at) - Date.parse(created.requested_at), 24 * 3600_000);
  same(await request(id(6), 'new@example.invalid', id(26)), created, 'Same-key RPC retry stays idempotent');
  same(await request(id(6), 'new@example.invalid', id(27)), created, 'Active request alias stays idempotent');
  same((await request(id(1), 'target-1@example.invalid', id(21))).completion_target_at,
    after[0].completion_target_at, 'Old active receipt returns its earlier target');
  same((await request(id(3), 'target-3@example.invalid', id(23))).completion_target_at,
    before[2].completion_target_at, 'Old cancelled key returns its unchanged historical target');
  await db.exec('reset role');
  for (const denied of ['anon', 'authenticated']) {
    await db.exec(`set role ${denied}`);
    await rejects(request(id(6), 'new@example.invalid', id(28)), /permission denied/);
    await db.exec('reset role');
  }

  // PostgreSQL calendar arithmetic includes leap years, month ends and UK DST.
  // This only checks an operational margin; it does not calculate legal deadlines.
  await db.exec("set timezone='Europe/London'");
  const [calendar] = await q(`with samples as (
    select d from generate_series('2026-01-01 12:00 Europe/London'::timestamptz,
      '2035-12-31 12:00 Europe/London'::timestamptz,interval '1 day') as d
  ) select count(*)::int as samples,
    bool_and(d+interval '648 hours' < d+interval '1 month') as always_earlier,
    min(extract(epoch from ((d+interval '1 month')-(d+interval '648 hours'))))::int as minimum_buffer_seconds
    from samples`);
  same(calendar.samples, 3652);
  same(calendar.always_earlier, true);
  same(calendar.minimum_buffer_seconds, 23 * 3600, 'Shortest UK calendar-month buffer includes spring-forward');
  for (const date of ['2027-02-28 12:00 Europe/London', '2028-02-29 12:00 Europe/London', '2027-01-31 12:00 Europe/London']) {
    const [sample] = await q(`select extract(epoch from (($1::timestamptz+interval '648 hours')-$1::timestamptz))::int as elapsed,
      $1::timestamptz+interval '648 hours' < $1::timestamptz+interval '1 month' as earlier`, [date]);
    same(sample, { elapsed: 648 * 3600, earlier: true });
  }
  const [overdue] = await q(`select completion_target_at < requested_at+interval '672 hours' as completion_overdue,
    requested_at+interval '720 hours' > requested_at+interval '672 hours' as old_target_not_overdue,
    review_due_at=requested_at+interval '24 hours' as review_preserved
    from public.account_deletion_requests where id=$1 and status in ('requested','in_review')`, [id(11)]);
  same(overdue, { completion_overdue: true, old_target_not_overdue: true, review_preserved: true });
  ok(!/^(?:begin|commit);/mi.test(migration('20261125030000_shorten_account_deletion_target.sql')),
    'Migration leaves transaction control with the deployment runner');
  console.log(`Account deletion target: ${checks} assertions passed; populated upgrade, unchanged closed receipts/grants/functions/keys, 24h review, 648h default/RPC, idempotency, earlier escalation and 3,652 UK calendar dates. Local fixtures only.`);
} finally {
  await db.close();
}
