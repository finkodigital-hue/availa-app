import { readFile, readdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ts = createRequire(import.meta.url)("typescript");

// Nitro generates this file during every production build. Cloudflare's Git
// deploy command then uses it directly, so keep the Worker identity stable and
// preserve dashboard-managed runtime variables (Supabase URL/anon key).
const configUrl = new URL("../.output/server/wrangler.json", import.meta.url);
const configPath = fileURLToPath(configUrl);
const config = JSON.parse(await readFile(configPath, "utf8"));
const wrapperName = "bookzenvo-cache-entry.mjs";
if (config.main && !["index.mjs", "./index.mjs", wrapperName].includes(config.main)) {
  throw new Error("Unexpected Nitro entry path; review the outer cache wrapper before deploying.");
}
// Never patch Nitro's generated source. Its manifest fast path bypasses
// src/server.ts, so wrap the actual default entry and preserve named exports
// and all non-fetch handlers. Re-running preparation cannot wrap itself.
const cachePolicy = ts.transpileModule(
  await readFile(new URL("../src/lib/response-cache.server.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;
await writeFile(new URL("../.output/server/_bookzenvo-response-cache.mjs", import.meta.url), cachePolicy);
await writeFile(new URL(`../.output/server/${wrapperName}`, import.meta.url), `import nitroEntry from "./index.mjs";
import { applyResponseCachePolicy } from "./_bookzenvo-response-cache.mjs";
export * from "./index.mjs";
export default {
  ...nitroEntry,
  async fetch(request, env, context) {
    try {
      return applyResponseCachePolicy(request, await nitroEntry.fetch.call(nitroEntry, request, env, context));
    } catch {
      console.error("Bookzenvo outer Worker request failed");
      return new Response(request.method === "HEAD" ? null : "Service unavailable", { status: 500, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
    }
  },
};
`);
config.main = wrapperName;

function parseDotEnv(source) {
  return Object.fromEntries(
    source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

const localEnv = parseDotEnv(
  await readFile(new URL("../.env", import.meta.url), "utf8").catch(() => ""),
);
const requiredPublicVariables = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"];
const publicVariables = Object.fromEntries(
  requiredPublicVariables.flatMap((name) => {
    const value = process.env[name] || localEnv[name];
    return value ? [[name, value]] : [];
  }),
);

config.name = "availa-app";
// Cloudflare rejects dates newer than the current platform date. Nitro may
// generate tomorrow's date around UTC midnight, so pin to today's supported
// compatibility date for reliable manual and Git deployments.
config.compatibility_date = "2026-07-23";
config.keep_vars = true;
// Status-aware caching needs the Worker to see these responses. A broad
// immutable _headers rule also caches missing assets; static assets otherwise
// bypass our ASSETS response guard. Preserve any existing routing choices.
const existingWorkerFirst = config.assets?.run_worker_first;
config.assets = {
  ...(config.assets ?? {}),
  run_worker_first: existingWorkerFirst === true
    ? true
    : [...new Set([
      ...(Array.isArray(existingWorkerFirst) ? existingWorkerFirst : []),
      "/assets/*", "/client-entry.js",
    ])],
};
// A Git build does not have the local .env file. When values are available,
// include them for a local/manual deployment; when they are not, keep_vars
// preserves the production bindings managed in the Cloudflare dashboard.
if (Object.keys(publicVariables).length > 0) {
  config.vars = { ...(config.vars ?? {}), ...publicVariables };
}

await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

// The emergency client shell in src/server.ts must use a stable URL. Vite
// fingerprints its entry bundle on every build, so create a tiny stable module
// that imports the current fingerprinted bundle from the deployed assets.
const assetDirectoryUrl = new URL("../.output/public/assets/", import.meta.url);
const assetNames = await readdir(fileURLToPath(assetDirectoryUrl));
const clientBundle = assetNames.find((name) =>
  /^index-[A-Za-z0-9_-]+\.js$/.test(name),
);

if (!clientBundle) {
  throw new Error("Cloudflare build is missing the Vite client entry bundle.");
}

await writeFile(
  fileURLToPath(new URL("../.output/public/client-entry.js", import.meta.url)),
  `import "/assets/${clientBundle}";\n`,
);

// Publish a non-secret revision marker so the post-push check can distinguish
// the new deployment from a healthy older one. Prefer CI-provided revisions,
// then fall back to the checked-out commit for manual releases.
let revision =
  process.env.GITHUB_SHA ||
  process.env.CF_PAGES_COMMIT_SHA ||
  process.env.CLOUDFLARE_COMMIT_SHA;
if (!revision) {
  try {
    revision = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    revision = "unknown";
  }
}

await writeFile(
  fileURLToPath(new URL("../.output/public/deployment.json", import.meta.url)),
  `${JSON.stringify({ revision })}\n`,
);

// Cloudflare serves files such as robots.txt, sitemap.xml and deployment.json
// directly from its static-asset binding, so they do not pass through the
// TanStack middleware in src/start.ts. Give those responses the same browser
// security baseline as dynamic routes. _headers cannot distinguish successful
// files from missing/error responses, so its safe default is no-store. The
// Worker grants immutable caching only to successful fingerprinted assets.
await writeFile(
  fileURLToPath(new URL("../.output/public/_headers", import.meta.url)),
  `/*
  Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' https: data: blob:; connect-src 'self'; frame-src 'self'; worker-src 'self' blob:; manifest-src 'self'
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), geolocation=(), microphone=()
  Strict-Transport-Security: max-age=31536000
  Cache-Control: no-store

/deployment.json
  ! Cache-Control
  Cache-Control: no-store

/client-entry.js
  ! Cache-Control
  Cache-Control: no-store
`,
);
