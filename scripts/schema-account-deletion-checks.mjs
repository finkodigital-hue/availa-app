import assert from 'node:assert/strict';

export async function checkAccountDeletionRequests(db) {
  const id = n => `62000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  let checks = 0;
  const same = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
  const ok = value => { assert.ok(value); checks++; };
  const reject = async (promise, pattern) => { await assert.rejects(promise, pattern); checks++; };
  const q = async (sql, args = []) => (await db.query(sql, args)).rows;
  const role = async (name, claim = name) => {
    assert.ok(['service_role', 'authenticated', 'anon'].includes(name));
    await db.exec(`reset role; set role ${name}`);
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: claim, sub: id(1) })]);
  };
  const request = async (user = id(1), email = 'delete-one@example.invalid', key = id(11)) =>
    (await q('select public.request_account_deletion_server($1,$2,$3) as r', [user, email, key]))[0].r;
  const cancel = async (user, requestId) =>
    (await q('select public.cancel_account_deletion_request_server($1,$2) as r', [user, requestId]))[0].r;
  const status = async user => (await q('select public.get_account_deletion_status_server($1) as r', [user]))[0].r;
  const safeKeys = ['id', 'status', 'requested_at', 'review_due_at', 'completion_target_at',
    'review_started_at', 'cancelled_at', 'completed_at', 'confirmation_sent_at', 'status_message', 'retained_data_summary'].sort();
  const safe = row => same(Object.keys(row).sort(), safeKeys);

  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims','{}',false)");
  await db.query(`insert into auth.users(id,email,email_confirmed_at) values
    ($1,'delete-one@example.invalid',now()),($2,'delete-two@example.invalid',now()),
    ($3,'delete-empty@example.invalid',now()),($4,'delete-unconfirmed@example.invalid',null)`, [id(1), id(2), id(3), id(4)]);

  const tables = ['account_deletion_requests', 'account_deletion_request_keys'];
  for (const table of tables) {
    const [state] = await q(`select c.relrowsecurity as rls, (select count(*)::int from pg_policy p where p.polrelid=c.oid) as policies
      from pg_class c where c.oid=$1::regclass`, [`public.${table}`]);
    same(state, { rls: true, policies: 1 });
    for (const denied of ['anon', 'authenticated']) {
      same((await q("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as allowed", [denied, `public.${table}`]))[0].allowed, false);
    }
    same((await q("select count(*)::int as n from information_schema.table_privileges where table_schema='public' and table_name=$1 and grantee='PUBLIC'", [table]))[0].n, 0);
  }
  same((await q(`select count(*)::int as n from pg_constraint where conrelid = 'public.account_deletion_requests'::regclass
    and contype='f' and confrelid='auth.users'::regclass`))[0].n, 0);
  const signatures = ['request_account_deletion_server(uuid,text,uuid)', 'cancel_account_deletion_request_server(uuid,uuid)', 'get_account_deletion_status_server(uuid)'];
  for (const signature of signatures) {
    same((await q(`select has_function_privilege('anon',$1,'execute') as anon,
      has_function_privilege('authenticated',$1,'execute') as member,
      has_function_privilege('service_role',$1,'execute') as server`, [`public.${signature}`]))[0], { anon: false, member: false, server: true });
  }
  same((await q("select has_function_privilege('service_role','public._account_deletion_request_status(public.account_deletion_requests)','execute') as allowed"))[0].allowed, false);

  for (const denied of ['anon', 'authenticated']) {
    await role(denied, 'service_role'); // Forged claims cannot bypass actual role grants.
    await reject(request(), /permission denied/);
    await reject(status(id(1)), /permission denied/);
    await reject(cancel(id(1), id(21)), /permission denied/);
    for (const table of tables) {
      await reject(q(`select * from public.${table}`), /permission denied/);
      await reject(q(`delete from public.${table}`), /permission denied/);
    }
  }
  await role('service_role', 'authenticated');
  await reject(request(), /Server access required/);
  await reject(status(id(1)), /Server access required/);
  await reject(cancel(id(1), id(21)), /Server access required/);
  await role('service_role');
  same(await status(id(1)), null);
  const first = await request();
  safe(first);
  same(first.status, 'requested');
  same(Date.parse(first.review_due_at) - Date.parse(first.requested_at), 24 * 3600_000);
  same(Date.parse(first.completion_target_at) - Date.parse(first.requested_at), 30 * 24 * 3600_000);
  same(await request(), first);
  same(await request(id(1), ' DELETE-ONE@example.invalid ', id(12)), first);
  same(await status(id(2)), null);
  await reject(cancel(id(2), first.id), /no longer available/);
  await reject(request(id(1), 'delete-two@example.invalid', id(13)), /could not be verified/);
  await reject(request(id(1), null, id(13)), /Invalid account/);
  await reject(request(id(1), 'delete-one@example.invalid\n', id(13)), /Invalid account/);
  await reject(request(id(1), 'delete-one@example.invalid', null), /Invalid account/);
  await reject(request(id(99), 'missing@example.invalid', id(13)), /could not be verified/);
  await reject(request(id(4), 'delete-unconfirmed@example.invalid', id(13)), /could not be verified/);
  await reject(cancel(id(99), first.id), /could not be verified/);
  await reject(status(id(99)), /could not be verified/);
  await reject(status(id(4)), /could not be verified/);
  await reject(q('insert into account_deletion_requests(user_id,contact_email) values($1,$2)', [id(1), 'delete-one@example.invalid']), /permission denied/);
  await reject(q('select * from account_deletion_request_keys'), /permission denied/);
  const secondUser = await request(id(2), 'delete-two@example.invalid', id(11));
  ok(secondUser.id !== first.id);
  same(await status(id(2)), secondUser);

  const cancelled = await cancel(id(1), first.id);
  safe(cancelled);
  same(cancelled.status, 'cancelled');
  ok(cancelled.cancelled_at);
  same(await cancel(id(1), first.id), cancelled);
  same(await request(), cancelled);
  same(await request(id(1), 'delete-one@example.invalid', id(12)), cancelled);
  const newer = await request(id(1), 'delete-one@example.invalid', id(13));
  ok(newer.id !== first.id);
  same(newer.status, 'requested');
  same(await cancel(id(1), first.id), cancelled); // Delayed old cancellation does not touch the new request.
  same(await request(id(1), 'delete-one@example.invalid', id(12)), cancelled);
  same(await status(id(1)), newer);

  await db.exec('reset role');
  same((await q('select count(*)::int as n from account_deletion_request_keys where user_id=$1', [id(1)]))[0].n, 3);
  same((await q("select count(*)::int as n from account_deletion_requests where user_id=$1 and status in ('requested','in_review')", [id(1)]))[0].n, 1);
  await reject(q('insert into account_deletion_requests(user_id,contact_email) values($1,$2)', [id(1), 'delete-one@example.invalid']), /duplicate key/);
  await reject(q('insert into account_deletion_request_keys(user_id,request_key,request_id) values($1,$2,$3)', [id(2), id(99), newer.id]), /foreign key/);
  await reject(q("update account_deletion_requests set status='in_review' where id=$1", [newer.id]), /account_deletion_state_times/);
  await reject(q("update account_deletion_requests set status='completed',completed_at=clock_timestamp() where id=$1", [newer.id]), /account_deletion_(?:state_times|completion_evidence)/);
  await reject(q("update account_deletion_requests set confirmation_sent_at=clock_timestamp() where id=$1", [newer.id]), /account_deletion_completion_evidence/);
  await reject(q("update account_deletion_requests set review_due_at=requested_at where id=$1", [newer.id]), /account_deletion_due_times/);
  await role('service_role');
  await q(`update account_deletion_requests set status='in_review',review_started_at=clock_timestamp(),
    status_message='Your request is being reviewed.',operator_reference='private-fixture-only' where id=$1`, [newer.id]);
  const reviewing = await status(id(1));
  safe(reviewing);
  same(reviewing.status, 'in_review');
  same(reviewing.status_message, 'Your request is being reviewed.');
  ok(reviewing.review_started_at);
  same(reviewing.confirmation_sent_at, null);
  await reject(cancel(id(1), newer.id), /processing has started/);
  same((await request(id(1), 'delete-one@example.invalid', id(14))).id, newer.id);
  await reject(q("update account_deletion_requests set status='completed' where id=$1", [newer.id]), /account_deletion_(?:state_times|completion_evidence)/);
  await reject(q("update account_deletion_requests set status='completed',completed_at=clock_timestamp() where id=$1", [newer.id]), /account_deletion_completion_evidence/);
  await reject(q("update account_deletion_requests set status='completed',completed_at=clock_timestamp(),confirmation_sent_at=clock_timestamp(),operator_reference=' ' where id=$1", [newer.id]), /account_deletion_completion_evidence/);
  await reject(q("update account_deletion_requests set status='completed',completed_at=clock_timestamp(),confirmation_sent_at=review_started_at-interval '1 second' where id=$1", [newer.id]), /account_deletion_(?:completion_evidence|time_order)/);
  await q("update account_deletion_requests set status='completed',completed_at=clock_timestamp(),confirmation_sent_at=clock_timestamp(),retained_data_summary='Required audit records retained.' where id=$1", [newer.id]);
  const completed = await status(id(1));
  safe(completed);
  same(completed.status, 'completed');
  ok(Date.parse(completed.confirmation_sent_at) >= Date.parse(completed.completed_at));
  same(completed.retained_data_summary, 'Required audit records retained.');
  await reject(cancel(id(1), newer.id), /processing has started/);
  same(await request(id(1), 'delete-one@example.invalid', id(14)), completed);
  await reject(q("update account_deletion_requests set cancelled_at=clock_timestamp() where id=$1", [newer.id]), /account_deletion_state_times/);

  for (const unavailable of ['banned_until', 'deleted_at']) {
    await db.exec('reset role');
    await q(`update auth.users set ${unavailable}=clock_timestamp()+interval '1 hour' where id=$1`, [id(2)]);
    await role('service_role');
    await reject(request(id(2), 'delete-two@example.invalid', id(11)), /could not be verified/);
    await reject(cancel(id(2), secondUser.id), /could not be verified/);
    await reject(status(id(2)), /could not be verified/);
    await db.exec('reset role');
    await q(`update auth.users set ${unavailable}=null where id=$1`, [id(2)]);
  }
  await q("update auth.users set email='changed@example.invalid' where id=$1", [id(2)]);
  await role('service_role');
  await reject(request(id(2), 'delete-two@example.invalid', id(11)), /could not be verified/);
  same(await request(id(2), 'changed@example.invalid', id(11)), secondUser);
  same(await status(id(3)), null);
  await db.exec('reset role');
  await q('delete from auth.users where id=$1', [id(2)]);
  same((await q('select count(*)::int as n from account_deletion_requests where id=$1', [secondUser.id]))[0].n, 1);
  same((await q('select count(*)::int as n from account_deletion_request_keys where user_id=$1', [id(2)]))[0].n, 1);
  await role('service_role');
  await reject(status(id(2)), /could not be verified/);
  await db.exec('reset role');
  await q('delete from account_deletion_request_keys where user_id=any($1::uuid[])', [[id(1), id(2)]]);
  await q('delete from account_deletion_requests where user_id=any($1::uuid[])', [[id(1), id(2)]]);
  await q('delete from auth.users where id=any($1::uuid[])', [[id(1), id(3), id(4)]]);
  await db.query("select set_config('request.jwt.claims','{}',false)");
  console.log(`Account deletion queue: ${checks} full-schema privacy, role, identity, idempotency and lifecycle assertions passed.`);
}
