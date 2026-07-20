import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Nitro generates this file during every production build. Cloudflare's Git
// deploy command then uses it directly, so keep the Worker identity stable and
// preserve dashboard-managed runtime variables (Supabase URL/anon key).
const configUrl = new URL("../.output/server/wrangler.json", import.meta.url);
const configPath = fileURLToPath(configUrl);
const config = JSON.parse(await readFile(configPath, "utf8"));

config.name = "availa-app";
config.keep_vars = true;

await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
