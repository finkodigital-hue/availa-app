import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  sanitizeClientErrorText,
  sanitizeReportedUrl,
} from "../src/lib/client-error-sanitizer.ts";

assert.equal(
  sanitizeReportedUrl(
    "https://bookzenvo.com/booking-action/confirm/secret?token=private#part",
  ),
  "https://bookzenvo.com/booking-action/[action]/[token removed]",
);
assert.equal(
  sanitizeReportedUrl("/review/private-token"),
  "/review/[token removed]",
);
assert.equal(sanitizeReportedUrl("/portal?access_token=secret"), "/portal");
assert.equal(sanitizeReportedUrl("javascript:alert(1)"), null);
const sanitized = sanitizeClientErrorText(
  "Failed for person@example.com at https://bookzenvo.com/auth?code=private token=abc eyJaaa.bbb.ccc",
  500,
);
assert.equal(sanitized?.includes("person@example.com"), false);
assert.equal(sanitized?.includes("?code="), false);
assert.equal(sanitized?.includes("token=abc"), false);
assert.equal(sanitized?.includes("eyJaaa.bbb.ccc"), false);

const db = new PGlite();
const migration = fs.readFileSync(
  new URL(
    "../supabase/migrations/20260927233000_client_error_privacy.sql",
    import.meta.url,
  ),
  "utf8",
);
await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role;
  create schema cron;
  create table cron.job(jobid bigint, jobname text);
  create function cron.unschedule(bigint) returns boolean language sql as $$select true$$;
  create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
  create table client_errors(id bigint generated always as identity primary key, created_at timestamptz not null default now());
`);
await db.exec(migration);
await db.exec(`
  insert into client_errors(created_at) values
    (now() - interval '31 days'),
    (now() - interval '29 days');
`);
const result = await db.query("select prune_client_errors() as deleted");
assert.equal(result.rows[0].deleted, 1);
assert.equal((await db.query("select count(*)::integer as count from client_errors")).rows[0].count, 1);
await db.close();

console.log("Client error privacy checks passed: secrets are scrubbed and reports expire after 30 days.");
