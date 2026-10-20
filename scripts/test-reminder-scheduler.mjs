import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import './test-reminder-suppression.mjs';

// Execute the actual migration and its stored command against inert services.
// Verify redeployment updates one job, does not send, and retains auth/cadence.
const db = new PGlite();
try {
  await db.exec(`
    create schema cron; create schema net; create schema vault;
    create table cron.job(jobname text primary key, schedule text, command text);
    create function cron.schedule(text,text,text) returns bigint language sql as $$
      insert into cron.job values ($1,$2,$3)
      on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command;
      select 1::bigint;
    $$;
    create table vault.decrypted_secrets(name text, decrypted_secret text);
    insert into vault.decrypted_secrets values ('cron_reminder_secret','fixture-only');
    create table net.requests(url text,headers jsonb,body jsonb,timeout integer);
    create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer default 5000)
    returns bigint language sql as $$
      insert into net.requests values ($1,$2,$3,$4); select 1::bigint;
    $$;
  `);
  const sql = await readFile(new URL('../supabase/migrations/20261020160000_extend_reminder_scheduler_timeout.sql', import.meta.url), 'utf8');
  await db.exec(sql);
  await db.exec(sql);
  assert.equal((await db.query('select * from net.requests')).rows.length, 0);
  const jobs = (await db.query('select * from cron.job')).rows;
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].jobname, 'send-booking-reminders');
  assert.equal(jobs[0].schedule, '*/15 * * * *');
  await db.exec(jobs[0].command);
  const request = (await db.query('select * from net.requests')).rows[0];
  assert.equal(request.url, 'https://bookzenvo.com/api/cron/send-reminders');
  assert.equal(request.headers.Authorization, 'Bearer fixture-only');
  assert.equal(request.headers['Content-Type'], 'application/json');
  assert.deepEqual(request.body, {});
  assert.equal(request.timeout, 120000);
  console.log('Reminder scheduler: repeat application, no immediate send, auth, cadence and timeout passed.');
} finally {
  await db.close();
}
