import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const TARGET = "https://bookzenvo-monitor.finkodigital.workers.dev/backup";
const PROJECT = "repamfxdbsbotkonhxmj";
const GENERATION = /^\d{4}-\d{2}-\d{2}T\d{6}Z$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?Z$/;
class ReportError extends Error {}
function fail(code) { throw new ReportError(code); }
function timestamp(value) {
  if (typeof value !== "string" || !ISO.test(value)) fail("invalid_backup_timestamp");
  const result = Date.parse(value);
  if (!Number.isFinite(result) || new Date(result).toISOString().slice(0, 19) !== value.slice(0, 19)) fail("invalid_backup_timestamp");
  return result;
}
function generationTime(value) {
  if (!GENERATION.test(value)) fail("invalid_generation");
  return timestamp(`${value.slice(0, 13)}:${value.slice(13, 15)}:${value.slice(15, 17)}Z`);
}
async function regularFile(file, maximum) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > maximum) fail("invalid_backup_file");
  return stat;
}
async function readMetadata(file) {
  await regularFile(file, 64 * 1024);
  return fs.readFile(file, "utf8");
}
async function verifyArchive(directory, entry, expectedName) {
  if (!entry || entry.encryptedFile !== expectedName || !/^[a-f0-9]{64}$/i.test(entry.encryptedSha256 ?? "") || !Number.isSafeInteger(entry.encryptedBytes) || entry.encryptedBytes <= 0) fail("invalid_archive_metadata");
  const filename = path.join(directory, expectedName);
  const before = await regularFile(filename, Number.MAX_SAFE_INTEGER);
  if (before.size !== entry.encryptedBytes) fail("archive_size_mismatch");
  const handle = await fs.open(filename, "r");
  try {
    const opened = await handle.stat();
    if (opened.ino !== before.ino || opened.size !== before.size || opened.mtimeMs !== before.mtimeMs) fail("archive_changed");
    const hash = createHash("sha256");
    for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk);
    const after = await handle.stat();
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || hash.digest("hex") !== entry.encryptedSha256.toLowerCase()) fail("archive_hash_mismatch");
  } finally { await handle.close(); }
}

export async function verifyLatestBackup(backupRoot, now = Date.now()) {
  const directories = (await fs.readdir(backupRoot, { withFileTypes: true })).filter((entry) => GENERATION.test(entry.name)).sort((a, b) => b.name.localeCompare(a.name));
  for (const directory of directories) {
    if (!directory.isDirectory() || directory.isSymbolicLink()) fail("invalid_generation_directory");
    const directoryPath = path.join(backupRoot, directory.name);
    const metadataPath = path.join(directoryPath, "backup-metadata.json");
    let original;
    try { original = await readMetadata(metadataPath); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    // Missing metadata can mean an in-progress generation. Once metadata exists,
    // any failed check is fatal; do not hide corruption by falling back to an older copy.
    let metadata;
    try { metadata = JSON.parse(original); } catch { fail("invalid_backup_metadata"); }
    if (!metadata || metadata.projectRef !== PROJECT) fail("wrong_backup_project");
    const completed = timestamp(metadata.completedAt);
    const started = generationTime(directory.name);
    if (completed > now || completed < started || completed - started > 6 * 60 * 60_000) fail("invalid_backup_time_range");
    if (!Array.isArray(metadata.storage?.buckets) || metadata.storage.buckets.length !== 2 || new Set(metadata.storage.buckets).size !== 2 || !metadata.storage.buckets.includes("business-assets") || !metadata.storage.buckets.includes("business-public-assets")) fail("incomplete_storage_backup");
    await verifyArchive(directoryPath, metadata.database, "database.dump.bzenc");
    await verifyArchive(directoryPath, metadata.storage, "storage.zip.bzenc");
    if (await readMetadata(metadataPath) !== original) fail("backup_metadata_changed");
    return { completedAt: metadata.completedAt, generation: directory.name };
  }
  fail("no_completed_backup");
}

export async function reportBackup({ backupRoot, token, fetchImpl = fetch, now = Date.now() }) {
  if (typeof token !== "string" || token.length < 32 || token.length > 4096 || /\s/.test(token)) fail("invalid_monitor_credential");
  const report = await verifyLatestBackup(backupRoot, now);
  const response = await fetchImpl(TARGET, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(report),
  });
  if (response.status !== 200 || response.redirected || (response.url && response.url !== TARGET)) { await response.body?.cancel(); fail("backup_report_rejected"); }
  if (!response.body || !response.headers.get("content-type")?.toLowerCase().startsWith("application/json")) { await response.body?.cancel(); fail("invalid_monitor_response"); }
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) { await reader.cancel(); fail("monitor_response_too_large"); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  let result;
  try { result = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { fail("invalid_monitor_response"); }
  if (result?.status !== "recorded" || typeof result.duplicate !== "boolean") fail("invalid_monitor_response");
  return { ...report, duplicate: result.duplicate };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [mode, backupRoot, extra] = process.argv.slice(2);
    if (!["--verify-only", "--report"].includes(mode) || !backupRoot || extra) fail("invalid_arguments");
    if (mode === "--verify-only") {
      const result = await verifyLatestBackup(backupRoot);
      console.log(`Backup archives verified: ${result.generation}; completed ${result.completedAt}. No report sent.`);
    } else {
      let input = "";
      for await (const chunk of process.stdin) { input += chunk; if (input.length > 4096) fail("invalid_monitor_credential"); }
      const result = await reportBackup({ backupRoot, token: input.trim() });
      input = "";
      console.log(`Backup freshness recorded: ${result.generation}; completed ${result.completedAt}; duplicate ${result.duplicate}.`);
    }
  } catch (error) {
    console.error(`Backup freshness report failed: ${error instanceof ReportError ? error.message : "verification_or_request_failed"}.`);
    process.exitCode = 1;
  }
}
