import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const backup = args.find((arg) => !arg.startsWith("--"));
const execute = args.includes("--execute");
const confirmation = args
  .find((arg) => arg.startsWith("--confirm="))
  ?.slice(10);
const rawUrl = process.env.RESTORE_DATABASE_URL;

if (!backup) {
  console.error(
    "Usage: npm run recovery:restore-local -- <backup.dump> [--execute --confirm=<database>]",
  );
  process.exit(2);
}
if (!existsSync(backup)) {
  console.error(`Backup not found: ${backup}`);
  process.exit(2);
}
if (!rawUrl) {
  console.error(
    "Set RESTORE_DATABASE_URL to a local disposable Postgres database.",
  );
  process.exit(2);
}

let target;
try {
  target = new URL(rawUrl);
} catch {
  console.error("RESTORE_DATABASE_URL is not a valid URL.");
  process.exit(2);
}
const localHosts = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "host.docker.internal",
]);
if (!localHosts.has(target.hostname)) {
  console.error(
    `REFUSED: restore host ${target.hostname} is not local. This tool cannot target production or remote databases.`,
  );
  process.exit(3);
}
const database = decodeURIComponent(target.pathname.replace(/^\//, ""));
if (!database || ["postgres", "template0", "template1"].includes(database)) {
  console.error(
    "REFUSED: choose a named disposable database, not a system database.",
  );
  process.exit(3);
}

console.log(
  `Restore plan: ${backup} -> local database ${database} on ${target.hostname}`,
);
if (!execute) {
  console.log(
    "Dry run only. Re-run with --execute and --confirm=<database> after reviewing the target.",
  );
  process.exit(0);
}
if (confirmation !== database) {
  console.error(`REFUSED: --confirm must exactly equal ${database}.`);
  process.exit(3);
}

const result = spawnSync(
  "pg_restore",
  [
    "--exit-on-error",
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
    "--dbname",
    database,
    backup,
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      PGHOST: target.hostname,
      PGPORT: target.port || "5432",
      PGDATABASE: database,
      PGUSER: decodeURIComponent(target.username),
      PGPASSWORD: decodeURIComponent(target.password),
    },
  },
);
if (result.error) {
  console.error(`Could not start pg_restore: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
