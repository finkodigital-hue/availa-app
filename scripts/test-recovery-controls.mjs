import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const workspace = mkdtempSync(join(tmpdir(), "bookzenvo-recovery-test-"));
const backup = join(workspace, "backup.dump");
writeFileSync(backup, "test fixture");

function run(databaseUrl, extraArgs = []) {
  return spawnSync(
    process.execPath,
    ["scripts/restore-local.mjs", backup, ...extraArgs],
    {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
      env: { ...process.env, RESTORE_DATABASE_URL: databaseUrl },
    },
  );
}

function expectRefusal(name, result, message) {
  if (
    result.status === 0 ||
    !`${result.stdout}${result.stderr}`.includes(message)
  ) {
    throw new Error(
      `${name} did not fail safely.\n${result.stdout}${result.stderr}`,
    );
  }
}

try {
  expectRefusal(
    "remote host",
    run(
      "postgresql://user:password@database.example.com/bookzenvo_restore_test",
    ),
    "is not local",
  );
  expectRefusal(
    "system database",
    run("postgresql://user:password@localhost/postgres"),
    "not a system database",
  );
  expectRefusal(
    "unmarked database",
    run("postgresql://user:password@localhost/bookzenvo"),
    'must start with "bookzenvo_restore_"',
  );
  const dryRun = run(
    "postgresql://user:password@localhost/bookzenvo_restore_test",
  );
  if (
    dryRun.status !== 0 ||
    !dryRun.stdout.includes("Dry run only") ||
    dryRun.stdout.includes("pg_restore")
  ) {
    throw new Error(`Dry run was not safe.\n${dryRun.stdout}${dryRun.stderr}`);
  }
  expectRefusal(
    "wrong confirmation",
    run("postgresql://user:password@localhost/bookzenvo_restore_test", [
      "--execute",
      "--confirm=wrong_database",
    ]),
    "--confirm must exactly equal bookzenvo_restore_test",
  );
} finally {
  rmSync(workspace, { recursive: true, force: true });
}

console.log("Recovery behaviour tests passed.");
