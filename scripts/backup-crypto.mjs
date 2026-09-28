import {
  createReadStream,
  createWriteStream,
  existsSync,
  promises as fs,
} from "node:fs";
import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";

const MAGIC = "BOOKZENVO-BACKUP-1\n";
const TAG_BYTES = 16;

function fail(message) {
  console.error(message);
  process.exit(2);
}

async function readKey() {
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) input += chunk;
  const encoded = input.trim();
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) {
    fail("Encryption key must be exactly 32 bytes encoded as base64 on stdin.");
  }
  return key;
}

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function readEnvelope(path) {
  const handle = await fs.open(path, "r");
  try {
    const buffer = Buffer.alloc(8192);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const head = buffer.subarray(0, bytesRead).toString("utf8");
    if (!head.startsWith(MAGIC))
      fail("Backup has an unknown encryption format.");
    const newline = head.indexOf("\n", MAGIC.length);
    if (newline === -1) fail("Backup encryption header is incomplete.");
    const header = JSON.parse(head.slice(MAGIC.length, newline));
    if (header.algorithm !== "aes-256-gcm" || !header.iv || !header.sha256) {
      fail("Backup encryption header is invalid.");
    }
    const stat = await handle.stat();
    const headerBytes = Buffer.byteLength(head.slice(0, newline + 1));
    if (stat.size <= headerBytes + TAG_BYTES)
      fail("Encrypted backup is empty.");
    const tag = Buffer.alloc(TAG_BYTES);
    await handle.read(tag, 0, TAG_BYTES, stat.size - TAG_BYTES);
    const aad = Buffer.from(head.slice(0, newline + 1), "utf8");
    return { header, headerBytes, size: stat.size, tag, aad };
  } finally {
    await handle.close();
  }
}

async function encrypt(input, output, key) {
  if (!existsSync(input)) fail(`Input file does not exist: ${input}`);
  if (existsSync(output)) fail(`Refusing to overwrite: ${output}`);
  const plaintextHash = await sha256File(input);
  const iv = randomBytes(12);
  const header = {
    algorithm: "aes-256-gcm",
    iv: Buffer.from(iv).toString("base64"),
    sha256: plaintextHash,
  };
  const envelopeHeader = `${MAGIC}${JSON.stringify(header)}\n`;
  await fs.writeFile(output, envelopeHeader, {
    flag: "wx",
    mode: 0o600,
  });
  try {
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(envelopeHeader, "utf8"));
    await pipeline(
      createReadStream(input),
      cipher,
      createWriteStream(output, { flags: "a", mode: 0o600 }),
    );
    await fs.appendFile(output, cipher.getAuthTag());
    return {
      plaintextSha256: plaintextHash,
      encryptedSha256: await sha256File(output),
    };
  } catch (error) {
    await fs.rm(output, { force: true });
    throw error;
  }
}

async function decryptOrVerify(input, output, key) {
  if (!existsSync(input)) fail(`Encrypted backup does not exist: ${input}`);
  if (output && existsSync(output)) fail(`Refusing to overwrite: ${output}`);
  const { header, headerBytes, size, tag, aad } = await readEnvelope(input);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(header.iv, "base64"),
  );
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  const hash = createHash("sha256");
  const sink = output
    ? createWriteStream(output, { flags: "wx", mode: 0o600 })
    : new Writable({
        write(_chunk, _encoding, callback) {
          callback();
        },
      });
  decipher.on("data", (chunk) => hash.update(chunk));
  try {
    await pipeline(
      createReadStream(input, {
        start: headerBytes,
        end: size - TAG_BYTES - 1,
      }),
      decipher,
      sink,
    );
    const actual = hash.digest("hex");
    if (actual !== header.sha256)
      throw new Error("Plaintext checksum mismatch.");
    return {
      plaintextSha256: actual,
      encryptedSha256: await sha256File(input),
    };
  } catch (error) {
    if (output) await fs.rm(output, { force: true });
    throw error;
  }
}

const [command, input, output] = process.argv.slice(2);
if (!command || !input || (command !== "verify" && !output)) {
  fail(
    "Usage: node backup-crypto.mjs <encrypt|decrypt|verify> <input> [output]",
  );
}
const key = await readKey();
let result;
if (command === "encrypt") result = await encrypt(input, output, key);
else if (command === "decrypt")
  result = await decryptOrVerify(input, output, key);
else if (command === "verify") result = await decryptOrVerify(input, null, key);
else fail(`Unknown command: ${command}`);
console.log(JSON.stringify(result));
