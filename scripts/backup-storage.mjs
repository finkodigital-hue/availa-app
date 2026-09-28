import { createHash } from "node:crypto";
import { createWriteStream, promises as fs } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const buckets = ["business-assets", "business-public-assets"];
const [projectUrl, outputRoot] = process.argv.slice(2);
if (!projectUrl || !outputRoot) {
  console.error(
    "Usage: node backup-storage.mjs <project-url> <output-directory>",
  );
  process.exit(2);
}
const url = new URL(projectUrl);
if (
  url.protocol !== "https:" ||
  url.hostname !== "repamfxdbsbotkonhxmj.supabase.co"
) {
  console.error("Refusing to back up an unexpected Supabase project.");
  process.exit(3);
}

let keyText = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) keyText += chunk;
const serviceKey = keyText.trim();
if (!serviceKey) {
  console.error("A service-role key is required on stdin.");
  process.exit(2);
}

const root = resolve(outputRoot);
await fs.mkdir(root, { recursive: true });
const headers = serviceKey.startsWith("sb_secret_")
  ? { apikey: serviceKey, "user-agent": "bookzenvo-backup/1.0" }
  : {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "user-agent": "bookzenvo-backup/1.0",
    };
const manifest = { createdAt: new Date().toISOString(), buckets: {} };

function storagePath(prefix, name) {
  const path = prefix ? `${prefix}/${name}` : name;
  const parts = path.split("/").filter(Boolean);
  if (!parts.length || parts.some((part) => part === "." || part === "..")) {
    throw new Error("Storage returned an unsafe object path.");
  }
  return parts.join("/");
}

function localPath(bucket, objectPath) {
  const path = resolve(root, bucket, ...objectPath.split("/"));
  const boundary = `${resolve(root)}${sep}`;
  if (!path.startsWith(boundary))
    throw new Error("Object path escaped backup root.");
  return path;
}

async function list(bucket, prefix, offset = 0) {
  const endpoint = `${url.origin}/storage/v1/object/list/${encodeURIComponent(bucket)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      prefix,
      limit: 100,
      offset,
      sortBy: { column: "name", order: "asc" },
    }),
  });
  if (!response.ok)
    throw new Error(`Storage list failed (${response.status}).`);
  return response.json();
}

async function download(bucket, objectPath) {
  const encoded = objectPath.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(
    `${url.origin}/storage/v1/object/${encodeURIComponent(bucket)}/${encoded}`,
    { headers },
  );
  if (!response.ok || !response.body) {
    throw new Error(
      `Storage download failed for ${bucket} (${response.status}).`,
    );
  }
  const destination = localPath(bucket, objectPath);
  await fs.mkdir(dirname(destination), { recursive: true });
  const hash = createHash("sha256");
  const stream = Readable.fromWeb(response.body);
  stream.on("data", (chunk) => hash.update(chunk));
  await pipeline(
    stream,
    createWriteStream(destination, { flags: "wx", mode: 0o600 }),
  );
  const stat = await fs.stat(destination);
  return { path: objectPath, bytes: stat.size, sha256: hash.digest("hex") };
}

async function walk(bucket, prefix = "") {
  const files = [];
  for (let offset = 0; ; offset += 100) {
    const entries = await list(bucket, prefix, offset);
    for (const entry of entries) {
      if (!entry?.name || entry.name === ".emptyFolderPlaceholder") continue;
      const path = storagePath(prefix, entry.name);
      if (entry.id) files.push(await download(bucket, path));
      else files.push(...(await walk(bucket, path)));
    }
    if (entries.length < 100) break;
  }
  return files;
}

for (const bucket of buckets) manifest.buckets[bucket] = await walk(bucket);
await fs.writeFile(
  resolve(root, "storage-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  { flag: "wx", mode: 0o600 },
);
const objectCount = Object.values(manifest.buckets).reduce(
  (total, entries) => total + entries.length,
  0,
);
console.log(JSON.stringify({ bucketCount: buckets.length, objectCount }));
