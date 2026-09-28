import { randomBytes, scryptSync } from "node:crypto";

const suppliedSalt = process.argv[2];
let passphrase = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) passphrase += chunk;
passphrase = passphrase.replace(/[\r\n]+$/, "");
if (passphrase.length < 16) {
  console.error(
    "Backup recovery passphrase must contain at least 16 characters.",
  );
  process.exit(2);
}
const salt = suppliedSalt
  ? Buffer.from(suppliedSalt, "base64")
  : randomBytes(32);
if (salt.length !== 32) {
  console.error("Backup key salt is invalid.");
  process.exit(2);
}
const key = scryptSync(passphrase, salt, 32, {
  N: 32768,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
});
console.log(
  JSON.stringify({
    algorithm: "scrypt",
    salt: salt.toString("base64"),
    N: 32768,
    r: 8,
    p: 1,
    key: key.toString("base64"),
  }),
);
