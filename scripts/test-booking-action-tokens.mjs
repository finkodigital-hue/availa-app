import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { readJsonWithLimit } from '../src/lib/request-limits.ts';

// Isolated PostgreSQL-compatible fixtures. No provider calls, real bookings,
// emails or live credentials are used by this regression suite.
const db = new PGlite();
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const hash = 'a'.repeat(64);
let checks = 0;
const equal = (a, b) => { assert.deepEqual(a, b); checks++; };
await db.exec(`
create role anon; create role authenticated; create role service_role;
create table businesses(id uuid primary key,name text,page_theme jsonb,timezone text,currency text,address text,phone text,email text,cancellation_window_hours integer);
create table services(id uuid primary key,name text);
create table staff(id uuid primary key,name text);
create table bookings(id uuid primary key,business_id uuid,service_id uuid,staff_id uuid,status text,starts_at timestamptz,price_cents integer,client_confirmed_at timestamptz,customer_email text);
create table booking_action_tokens(id uuid primary key,booking_id uuid,action text,token_hash text unique,expires_at timestamptz,used_at timestamptz);
insert into businesses values('${id(1)}','Fictional salon','{}','Europe/London','GBP','Fictional location',null,'salon@example.invalid',24);
insert into services values('${id(2)}','Test haircut');
insert into staff values('${id(3)}','Test staff');
insert into bookings values('${id(4)}','${id(1)}','${id(2)}','${id(3)}','confirmed',now()+interval '3 days',6500,null,'customer@example.invalid');
insert into booking_action_tokens values('${id(5)}','${id(4)}','cancel','${hash}',now()+interval '4 days',null);
`);
await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261112233000_atomic_booking_confirm_cancel.sql', import.meta.url), 'utf8'));
const action = async (act = 'cancel', tokenHash = hash) => (await db.query('select apply_booking_action_token($1,$2) as result', [tokenHash, act])).rows[0].result;
const state = async () => (await db.query('select status,client_confirmed_at,used_at from bookings cross join booking_action_tokens')).rows[0];
const reset = async (act = 'cancel') => db.exec(`update bookings set status='confirmed',starts_at=now()+interval '3 days',client_confirmed_at=null; update booking_action_tokens set action='${act}',expires_at=now()+interval '4 days',used_at=null;`);
for (const [act, tokenHash] of [['review', hash], ['reschedule', hash], [null, hash], ['cancel', null], ['cancel', 'short'], ['cancel', 'b'.repeat(64)], ['confirm', hash]]) {
  equal(await action(act, tokenHash), { ok: false, reason: 'invalid' });
}
await db.exec(`update booking_action_tokens set expires_at=now()-interval '1 second'`);
equal(await action(), { ok: false, reason: 'expired' });
equal((await state()).used_at, null);
await reset();
await db.exec('update booking_action_tokens set used_at=now()');
equal(await action(), { ok: false, reason: 'used' });
await reset();
const cancelled = await action();
equal(cancelled.ok, true);
equal(cancelled.action, 'cancel');
equal(cancelled.priceCents, 6500);
equal(cancelled.customer_email, undefined);
equal(cancelled.customerEmail, undefined);
equal((await state()).status, 'cancelled');
assert.ok((await state()).used_at); checks++;
equal((await action()).reason, 'used');

for (const initialStatus of ['pending', 'confirmed']) {
  await reset('confirm');
  await db.query('update bookings set status=$1', [initialStatus]);
  equal((await action('confirm')).ok, true);
  equal((await state()).status, initialStatus);
  assert.ok((await state()).client_confirmed_at); checks++;
}
// A newly issued reminder confirmation must not overwrite the original time.
await db.exec("update booking_action_tokens set used_at=null");
const previousConfirmation = (await state()).client_confirmed_at;
equal((await action('confirm')).ok, true);
equal((await state()).client_confirmed_at, previousConfirmation);

for (const status of ['checked_in', 'in_progress', 'completed', 'no_show']) {
  for (const act of ['confirm', 'cancel']) {
    await reset(act);
    await db.query('update bookings set status=$1', [status]);
    equal((await action(act)).reason, 'invalid');
    equal((await state()).used_at, null);
    equal((await state()).status, status);
  }
}
await reset();
await db.exec("update bookings set status='cancelled'");
equal((await action()).reason, 'already_cancelled');
equal((await state()).used_at, null);
await reset();
// Represents a salon move made since a link/booking preview was read.
await db.exec("update bookings set starts_at=now()+interval '1 hour'");
equal((await action()).reason, 'window_passed');
equal((await state()).used_at, null);
equal((await state()).status, 'confirmed');
await db.exec("update bookings set starts_at=now()-interval '1 hour'");
equal((await action()).reason, 'invalid');
equal((await state()).used_at, null);

// Failure before either booking mutation must leave the link retriable.
await db.exec(`create function reject_fixture_write() returns trigger language plpgsql as $$begin raise exception 'fixture write failure'; end$$;
create trigger fixture_fail before update on bookings for each row execute function reject_fixture_write();`);
for (const act of ['confirm', 'cancel']) {
  await db.exec('alter table bookings disable trigger fixture_fail');
  await reset(act);
  await db.exec('alter table bookings enable trigger fixture_fail');
  await assert.rejects(action(act), /fixture write failure/); checks++;
  equal(await state(), { status: 'confirmed', client_confirmed_at: null, used_at: null });
}
await db.exec('drop trigger fixture_fail on bookings');
equal((await action('cancel')).ok, true);
// Failure on token consumption rolls back the already-executed booking write.
await reset();
await db.exec('create trigger fixture_fail before update on booking_action_tokens for each row execute function reject_fixture_write()');
await assert.rejects(action(), /fixture write failure/); checks++;
equal(await state(), { status: 'confirmed', client_confirmed_at: null, used_at: null });
await db.exec('drop trigger fixture_fail on booking_action_tokens');
equal((await action()).ok, true);
for (const role of ['anon', 'authenticated']) {
  await db.exec(`set role ${role}`);
  await assert.rejects(action(), /permission denied/); checks++;
  await db.exec('reset role');
}
await reset();
await db.exec('set role service_role');
equal((await action()).ok, true);
await db.exec('reset role');
await db.close();

// Run the actual API handler with its database/messaging boundaries replaced.
// These prove the HTTP failure is truthful and no email runs on a failed RPC.
let apiState;
const raw = 'c'.repeat(64);
let source = fs.readFileSync(new URL('../src/routes/api/booking-actions/act.ts', import.meta.url), 'utf8');
source = source.replace(/^import[\s\S]*?from\s+"[^"]+";\s*/gm, '').replace('export const Route', 'const Route');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const handler = new Function('createFileRoute', 'supabaseAdmin', 'sha256Hex', 'readJsonWithLimit', 'processBookingChangeEmails', 'consumePublicRequest', 'publicRequestLimitResponse', js + ';return Route.server.handlers.POST;')(
  () => value => value,
  { async rpc(name, args) { apiState.calls.push({ name, args }); return { data: apiState.result, error: apiState.error }; } },
  async value => createHash('sha256').update(value).digest('hex'),
  readJsonWithLimit,
  async bookingId => { apiState.emailIds.push(bookingId); },
  async () => { if (apiState.limited) throw new Error('limited'); },
  () => new Response(null, { status: 429 }),
);
async function call(body, options = {}) {
  apiState = { calls: [], emailIds: [], result: { ok: true, action: 'cancel', bookingId: id(4) }, ...options };
  return handler({ request: new Request('https://example.invalid/api/booking-actions/act', { method: 'POST', body: JSON.stringify(body) }) });
}
for (const body of [null, [], { action: 'review', token: raw }, { action: 'cancel', token: 'bad' }]) {
  equal((await call(body)).status, 400);
  equal(apiState.calls.length, 0);
}
equal((await call({ action: 'cancel', token: raw }, { limited: true })).status, 429);
equal(apiState.calls.length, 0);
for (const actionName of ['confirm', 'cancel']) {
  const response = await call({ action: actionName, token: raw }, { error: { message: 'private database detail' }, result: null });
  equal(response.status, 503);
  equal(await response.json(), { error: 'Could not update the booking. Please retry.' });
  equal(apiState.emailIds.length, 0);
}
const success = await call({ action: 'cancel', token: raw, bookingId: id(999) });
equal(await success.json(), { ok: true, action: 'cancel' });
equal(apiState.calls, [{ name: 'apply_booking_action_token', args: { p_token_hash: createHash('sha256').update(raw).digest('hex'), p_action: 'cancel' } }]);
equal(apiState.emailIds, [id(4)]);
await call({ action: 'cancel', token: raw }, { result: { ok: false, reason: 'window_passed' } });
equal(apiState.emailIds.length, 0);
await call({ action: 'confirm', token: raw }, { result: { ok: true, action: 'confirm', bookingId: id(4) } });
equal(apiState.emailIds.length, 0);
for (const route of ['reschedule-peek', 'reschedule-commit']) {
  let source = fs.readFileSync(new URL(`../src/routes/api/booking-actions/${route}.ts`, import.meta.url), 'utf8');
  source = source.replace(/^import[\s\S]*?from\s+"[^"]+";\s*/gm, '').replace('export const Route', 'const Route');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const post = new Function('createFileRoute', 'consumePublicRequest', 'readJsonWithLimit', js + ';return Route.server.handlers.POST;')(() => value => value, async () => {}, readJsonWithLimit);
  for (const body of [null, [], true, 'unexpected']) {
    equal((await post({ request: new Request('https://example.invalid/test', { method: 'POST', body: JSON.stringify(body) }) })).status, 400);
  }
}
console.log(`Atomic booking action tokens: ${checks} assertions passed (isolated database and actual API handler fixtures).`);
