// Starts its own loopback-only PostgreSQL with fictional records. Never accepts
// a database URL, and leaves the stopped test cluster/logs for inspection.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
const bin = process.env.PG_TEST_BIN;
if (!bin)
  throw new Error("Set PG_TEST_BIN to a local PostgreSQL bin directory.");
const ext = process.platform === "win32" ? ".exe" : "";
const exe = (name) => path.join(bin, name + ext);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bookzenvo-rent-test-"));
const data = path.join(dir, "database");
const port = await new Promise((resolve) => {
  const server = net.createServer();
  server.listen(0, "127.0.0.1", () => {
    const p = server.address().port;
    server.close(() => resolve(p));
  });
});
const args = [
  "-X",
  "-qAt",
  "-v",
  "ON_ERROR_STOP=1",
  "-h",
  "127.0.0.1",
  "-p",
  String(port),
  "-U",
  "postgres",
  "-d",
  "postgres",
];
const run = (sql, onOutput) =>
  new Promise((resolve, reject) => {
    const child = spawn(exe("psql"), args, { windowsHide: true });
    let out = "",
      err = "";
    child.stdout.on("data", (b) => {
      out += b;
      onOutput?.(out);
    });
    child.stderr.on("data", (b) => (err += b));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(out.trim()) : reject(new Error(err)),
    );
    child.stdin.end(sql);
  });
let started = false;
try {
  execFileSync(
    exe("initdb"),
    ["-D", data, "-U", "postgres", "-A", "trust", "--no-locale", "-E", "UTF8"],
    { windowsHide: true, stdio: "ignore" },
  );
  execFileSync(
    exe("pg_ctl"),
    [
      "-D",
      data,
      "-l",
      path.join(dir, "postgres.log"),
      "-o",
      `-p ${port} -h 127.0.0.1`,
      "-w",
      "start",
    ],
    { windowsHide: true, stdio: "ignore" },
  );
  started = true;
  const replay = fs.readFileSync(
    new URL("./test-schema-replay.mjs", import.meta.url),
    "utf8",
  );
  const fixture = replay.match(/await db\.exec\(`([\s\S]*?)`\);/)[1];
  await run(fixture);
  const migrations = new URL("../supabase/migrations/", import.meta.url);
  for (const name of fs
    .readdirSync(migrations)
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    const sql = fs
      .readFileSync(new URL(name, migrations), "utf8")
      .replace(
        /^create extension if not exists (pg_cron|pg_net) with schema extensions;\s*$/gim,
        "-- inert external service fixture",
      );
    try {
      await run(sql);
    } catch (error) {
      throw new Error(`${name}: ${error.message}`);
    }
  }
  const id = (n) => `73000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  await run(`insert into auth.users(id,email,email_confirmed_at) values('${id(1)}','rent-concurrent-owner@example.invalid',now()),('${id(2)}','rent-concurrent-pro@example.invalid',now());
 insert into businesses(id,owner_id,name,slug,plan,timezone,email_suppressed,sms_suppressed) values('${id(101)}','${id(1)}','Fictional salon','rent-concurrent-salon','studio','Europe/London',true,true),('${id(102)}','${id(2)}','Fictional professional','rent-concurrent-pro','studio','Europe/London',true,true);
 insert into salon_professionals(id,salon_business_id,pro_business_id,rent_mode,rent_amount_cents,agreement_start) values('${id(201)}','${id(101)}','${id(102)}','weekly',10001,current_date-60);`);
  const auth = `set request.jwt.claims='${JSON.stringify({ sub: id(1), role: "authenticated", aal: "aal1" })}';set role authenticated;`;
  const generate = (n) =>
    `select generate_rent_payment('${id(201)}','${id(n)}');`;
  const same = await Promise.all([
    run(`begin;${auth}${generate(301)}select pg_sleep(0.5);commit;`),
    run(`${auth}${generate(301)}`),
  ]);
  assert.equal(
    same[0].trim(),
    same[1].trim(),
    "Concurrent retries must return one payment ID",
  );
  assert.equal(await run("select count(*) from rent_payments"), "1");
  const different = await Promise.all([
    run(`begin;${auth}${generate(302)}select pg_sleep(0.5);commit;`),
    run(`${auth}${generate(303)}`),
  ]);
  assert.notEqual(different[0].trim(), different[1].trim());
  assert.equal(await run("select count(*) from rent_payments"), "3");
  assert.equal(
    await run(
      "select bool_and(period_end=next_start) from (select period_end,lead(period_start) over(order by period_start) next_start from rent_payments) x where next_start is not null",
    ),
    "t",
    "Concurrent different requests must produce consecutive, non-overlapping periods",
  );
  let signal;
  const locked = new Promise((resolve) => (signal = resolve));
  const ending = run(
    `begin;${auth}update salon_professionals set status='ended' where id='${id(201)}';select 'locked';select pg_sleep(0.5);commit;`,
    (out) => {
      if (out.includes("locked")) signal();
    },
  );
  await Promise.race([
    locked,
    ending.then(() => {
      throw new Error("Missing lock signal");
    }),
  ]);
  await assert.rejects(run(`${auth}${generate(304)}`), /not active/);
  await ending;
  assert.equal(
    await run("select count(*) from rent_payments"),
    "3",
    "Ending a relationship wins before a waiting generation can write",
  );
  const result = {
    passed: true,
    checks: 7,
    scope:
      "Real PostgreSQL concurrent transactions; fictional full-schema database; no provider calls",
    directory: dir,
  };
  fs.writeFileSync(
    path.join(dir, "RESULT.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  if (started)
    execFileSync(exe("pg_ctl"), ["-D", data, "-w", "-m", "fast", "stop"], {
      windowsHide: true,
      stdio: "ignore",
    });
}
