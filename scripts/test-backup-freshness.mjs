import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { verifyLatestBackup, reportBackup } from "./report-backup-freshness.mjs";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "bookzenvo-backup-reporter-test-"));
const backupRoot = path.join(root, "backups");
await fs.mkdir(backupRoot);
const generation = "2026-11-12T231745Z";
const directory = path.join(backupRoot, generation);
await fs.mkdir(directory);
const completedAt = "2026-11-12T23:18:43.1604734Z";
const now = Date.parse("2026-11-13T00:00:00Z");
const token = "synthetic-test-token-never-used-on-network-12345";
const metadataPath = path.join(directory, "backup-metadata.json");
const db = Buffer.from("inert synthetic encrypted database fixture");
const storage = Buffer.from("inert synthetic encrypted storage fixture");
const archive = (name, bytes) => ({ encryptedFile: name, encryptedBytes: bytes.length, encryptedSha256: createHash("sha256").update(bytes).digest("hex") });
const base = { projectRef: "repamfxdbsbotkonhxmj", completedAt, database: archive("database.dump.bzenc", db), storage: { ...archive("storage.zip.bzenc", storage), buckets: ["business-assets", "business-public-assets"] } };
await fs.writeFile(path.join(directory, "database.dump.bzenc"), db);
await fs.writeFile(path.join(directory, "storage.zip.bzenc"), storage);
const save = (value = base) => fs.writeFile(metadataPath, JSON.stringify(value));
await save();
let count = 0;
let calls = 0;
const response = (value = { status: "recorded", duplicate: false }, options = {}) => new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" }, ...options });
const fakeFetch = async (url, options) => {
  calls++;
  assert.equal(url, "https://bookzenvo-monitor.finkodigital.workers.dev/backup");
  assert.equal(options.redirect, "error");
  assert.equal(options.method, "POST");
  assert.equal(options.headers.Authorization, `Bearer ${token}`);
  assert.ok(options.signal instanceof AbortSignal);
  assert.deepEqual(JSON.parse(options.body), { completedAt, generation });
  return response();
};
try {
  assert.deepEqual(await verifyLatestBackup(backupRoot, now), { completedAt, generation }); count++;
  assert.deepEqual(await reportBackup({ backupRoot, token, now, fetchImpl: fakeFetch }), { completedAt, generation, duplicate: false }); count++;
  assert.equal((await reportBackup({ backupRoot, token, now: now + 72 * 60 * 60_000, fetchImpl: fakeFetch })).completedAt, completedAt); count++;
  assert.equal((await reportBackup({ backupRoot, token, now, fetchImpl: async () => response({ status: "recorded", duplicate: true }) })).duplicate, true); count++;
  await fs.mkdir(path.join(backupRoot, "2026-11-13T000000Z"));
  assert.deepEqual(await verifyLatestBackup(backupRoot, now), { completedAt, generation }); count++;
  await fs.writeFile(path.join(backupRoot, "2026-11-13T000000Z", "backup-metadata.json"), "{");
  await assert.rejects(verifyLatestBackup(backupRoot, now), /invalid_backup_metadata/); count++;
  await fs.rm(path.join(backupRoot, "2026-11-13T000000Z"), { recursive: true });

  const mutations = [
    value => { value.completedAt = "2026-11-13T00:00:01Z"; },
    value => { value.completedAt = "2026-11-12T23:00:00Z"; },
    value => { value.completedAt = "2026-11-13T06:00:00Z"; },
    value => { value.completedAt = "2026-02-30T23:18:43Z"; },
    value => { value.completedAt = "not a date"; },
    value => { value.completedAt = null; },
    value => { value.completedAt = "2026-11-12T23:18:43+00:00"; },
    value => { value.projectRef = "wrong-project"; },
    value => { value.database.encryptedFile = "../other-file"; },
    value => { value.storage.encryptedFile = "database.dump.bzenc"; },
    value => { value.database.encryptedBytes = -1; },
    value => { value.storage.encryptedBytes += 1; },
    value => { value.database.encryptedSha256 = "0".repeat(64); },
    value => { value.storage.encryptedSha256 = "0".repeat(64); },
    value => { value.storage.encryptedSha256 = "bad"; },
    value => { value.database = null; },
    value => { value.storage.buckets = ["business-assets"]; },
    value => { value.storage.buckets = ["business-assets", "business-assets"]; },
  ];
  for (const mutate of mutations) {
    const value = structuredClone(base); mutate(value); await save(value);
    const priorCalls = calls;
    await assert.rejects(reportBackup({ backupRoot, token, now, fetchImpl: fakeFetch }));
    assert.equal(calls, priorCalls, "Invalid archive evidence must not send any heartbeat"); count++;
  }
  await save();
  await fs.rename(path.join(directory, "storage.zip.bzenc"), path.join(directory, "saved.fixture"));
  await assert.rejects(reportBackup({ backupRoot, token, now, fetchImpl: fakeFetch })); count++;
  await fs.rename(path.join(directory, "saved.fixture"), path.join(directory, "storage.zip.bzenc"));
  for (const badToken of ["", "short", "x".repeat(4097), `${token}\nother`]) {
    await assert.rejects(reportBackup({ backupRoot, token: badToken, now, fetchImpl: fakeFetch }), /invalid_monitor_credential/); count++;
  }
  for (const returned of [
    () => response({}, { status: 401 }),
    () => response({}, { status: 409 }),
    () => response({}, { status: 503 }),
    () => response({ status: "recorded" }),
    () => response({ status: "ok", duplicate: false }),
    () => response({ status: "recorded", duplicate: "true" }),
    () => new Response("{bad", { headers: { "content-type": "application/json" } }),
    () => new Response("x".repeat(2049), { headers: { "content-type": "application/json" } }),
    () => response({}, { headers: { "content-type": "text/html" } }),
  ]) {
    await assert.rejects(reportBackup({ backupRoot, token, now, fetchImpl: async () => returned() })); count++;
  }
  await assert.rejects(reportBackup({ backupRoot, token, now, fetchImpl: async () => { throw new Error("offline"); } }), /offline/); count++;
  await assert.rejects(reportBackup({ backupRoot, token, now, fetchImpl: async () => { const reply = response(); Object.defineProperty(reply, "url", { value: "https://unexpected.invalid/" }); return reply; } }), /backup_report_rejected/); count++;
  await fs.writeFile(metadataPath, " ".repeat(65537));
  await assert.rejects(verifyLatestBackup(backupRoot, now), /invalid_backup_file/); count++;
  await save();
  const helper = fileURLToPath(new URL("./report-backup-freshness.mjs", import.meta.url));
  const malformed = spawnSync(process.execPath, [helper, "--report", backupRoot], { input: `bad-${token}\nsecret`, encoding: "utf8" });
  assert.equal(malformed.status, 1); assert.ok(!`${malformed.stdout}${malformed.stderr}`.includes(token)); count++;
  if (process.platform === "win32") {
    const wrapper = fileURLToPath(new URL("./report-local-backup-freshness.ps1", import.meta.url));
    const good = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", wrapper, "-PrivateRoot", root, "-VerifyOnly"], { encoding: "utf8" });
    assert.equal(good.status, 0, good.stderr); assert.match(good.stdout, /No report sent/); count++;
    const bad = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", wrapper, "-PrivateRoot", root, "-SecretPath", path.join(root, "missing.dpapi")], { encoding: "utf8" });
    assert.equal(bad.status, 1); assert.ok(!bad.stdout.includes("missing.dpapi")); count++;
  }
  console.log(`Backup freshness reporter: ${count} checks passed; synthetic files only, no network requests.`);
} finally {
  // Delete only this process's newly-created, resolved system-temporary fixture.
  const resolved = path.resolve(root);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("bookzenvo-backup-reporter-test-")) throw new Error("Unsafe test cleanup path");
  await fs.rm(resolved, { recursive: true, force: true });
}
