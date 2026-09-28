import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const workspace = mkdtempSync(join(tmpdir(), "bookzenvo-backup-test-"));
const input = join(workspace, "input.dump");
const encrypted = join(workspace, "input.dump.bzenc");
const decrypted = join(workspace, "decrypted.dump");
const tampered = join(workspace, "tampered.bzenc");
const headerTampered = join(workspace, "header-tampered.bzenc");
const key = randomBytes(32).toString("base64");
const fixture = randomBytes(256 * 1024 + 17);
writeFileSync(input, fixture);

function crypto(command, source, destination) {
  const args = ["scripts/backup-crypto.mjs", command, source];
  if (destination) args.push(destination);
  return spawnSync(process.execPath, args, {
    cwd: new URL("..", import.meta.url),
    input: `${key}\n`,
    encoding: "utf8",
  });
}

function expectSuccess(name, result) {
  if (result.status !== 0) {
    throw new Error(`${name} failed.\n${result.stdout}${result.stderr}`);
  }
}

try {
  const firstDerivation = spawnSync(
    process.execPath,
    ["scripts/backup-key.mjs"],
    {
      cwd: new URL("..", import.meta.url),
      input: "correct horse battery staple\n",
      encoding: "utf8",
    },
  );
  expectSuccess("key derivation", firstDerivation);
  const firstKey = JSON.parse(firstDerivation.stdout);
  const repeatedDerivation = spawnSync(
    process.execPath,
    ["scripts/backup-key.mjs", firstKey.salt],
    {
      cwd: new URL("..", import.meta.url),
      input: "correct horse battery staple\n",
      encoding: "utf8",
    },
  );
  expectSuccess("repeated key derivation", repeatedDerivation);
  if (JSON.parse(repeatedDerivation.stdout).key !== firstKey.key) {
    throw new Error(
      "Recovery passphrase did not reproduce the encryption key.",
    );
  }

  expectSuccess("encryption", crypto("encrypt", input, encrypted));
  expectSuccess("integrity verification", crypto("verify", encrypted));
  expectSuccess("decryption", crypto("decrypt", encrypted, decrypted));
  if (!readFileSync(decrypted).equals(fixture)) {
    throw new Error("Decrypted backup did not match its source.");
  }

  const damaged = readFileSync(encrypted);
  damaged[Math.floor(damaged.length / 2)] ^= 0xff;
  writeFileSync(tampered, damaged);
  const tamperCheck = crypto("verify", tampered);
  if (tamperCheck.status === 0) {
    throw new Error("Tampered backup passed integrity verification.");
  }
  const headerDamage = readFileSync(encrypted);
  const shaMarker = headerDamage.indexOf(Buffer.from('"sha256":"')) + 10;
  headerDamage[shaMarker] = headerDamage[shaMarker] === 0x61 ? 0x62 : 0x61;
  writeFileSync(headerTampered, headerDamage);
  if (crypto("verify", headerTampered).status === 0) {
    throw new Error("Tampered backup header passed integrity verification.");
  }

  const setup = readFileSync(
    new URL("./setup-local-production-backup.ps1", import.meta.url),
    "utf8",
  );
  const runner = readFileSync(
    new URL("./run-local-production-backup.ps1", import.meta.url),
    "utf8",
  );
  const required = [
    [
      setup,
      "Read-Host 'Production Supabase database password' -AsSecureString",
    ],
    [setup, "aws-0-eu-west-1.pooler.supabase.com:5432/postgres"],
    [setup, "ConvertFrom-SecureString"],
    [setup, "backup-key.mjs"],
    [runner, "--format=custom"],
    [runner, "--no-owner"],
    [runner, "--no-privileges"],
    [runner, "backup-storage.mjs"],
    [runner, "backup-crypto.mjs') verify"],
    [runner, "Remove-PrivatePath $Staging $Generation"],
    [runner, "key-recovery.json"],
  ];
  for (const [contents, guard] of required) {
    if (!contents.includes(guard))
      throw new Error(`Missing backup safeguard: ${guard}`);
  }
} finally {
  rmSync(workspace, { recursive: true, force: true });
}

console.log(
  "Backup encryption, tamper detection and script safeguards passed.",
);
