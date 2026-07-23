import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Nitro generates this file during every production build. Cloudflare's Git
// deploy command then uses it directly, so keep the Worker identity stable and
// preserve dashboard-managed runtime variables (Supabase URL/anon key).
const configUrl = new URL("../.output/server/wrangler.json", import.meta.url);
const configPath = fileURLToPath(configUrl);
const config = JSON.parse(await readFile(configPath, "utf8"));

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

const localEnv = parseDotEnv(await readFile(new URL("../.env", import.meta.url), "utf8").catch(() => ""));
const requiredPublicVariables = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"];
const publicVariables = Object.fromEntries(
  requiredPublicVariables.map((name) => [name, process.env[name] || localEnv[name]]),
);
const missing = requiredPublicVariables.filter((name) => !publicVariables[name]);

if (missing.length) {
  throw new Error(
    `Cloudflare build is missing ${missing.join(", ")}. Refusing to deploy a Worker that would take Bookzenvo offline.`,
  );
}

config.name = "availa-app";
// Cloudflare rejects dates newer than the current platform date. Nitro may
// generate tomorrow's date around UTC midnight, so pin to today's supported
// compatibility date for reliable manual and Git deployments.
config.compatibility_date = "2026-07-23";
config.keep_vars = true;
config.vars = { ...(config.vars ?? {}), ...publicVariables };

await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
