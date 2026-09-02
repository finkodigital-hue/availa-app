import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();

async function read(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

async function walk(directory) {
  const entries = await readdir(path.join(projectRoot, directory), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(relativePath)));
    else files.push(relativePath);
  }
  return files;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const runtimeEnv = await read("src/lib/public-runtime-env.ts");
const gateway = await read("src/routes/api/supabase/$.ts");
const browserClient = await read("src/integrations/supabase/client.ts");
const securityMigration = await read(
  "supabase/migrations/20260902120000_server_api_security_boundary.sql",
);

assert(
  runtimeEnv.includes("${window.location.origin}/api/supabase"),
  "The browser Supabase client must use Bookzenvo's same-origin gateway.",
);
assert(
  runtimeEnv.includes("sb_publishable_browser_proxy"),
  "The browser must use the non-secret gateway marker instead of a real Supabase key.",
);
assert(
  gateway.includes('headers.set("apikey", publishableKey)'),
  "The server gateway must replace the browser marker with the server-side key.",
);
assert(
  gateway.includes("PROTECTED_REST_FIELDS") &&
    gateway.includes('resource === "payments"') &&
    gateway.includes('resource === "businesses" && request.method === "DELETE"'),
  "The server gateway must reject direct sensitive writes before they reach Supabase.",
);
assert(
  /storageKey:\s*["']bookzenvo-auth["']/.test(browserClient),
  "The browser auth session must use the stable Bookzenvo storage key.",
);
assert(
  securityMigration.includes("protect_business_system_fields"),
  "The protected business-field trigger is missing.",
);
assert(
  securityMigration.includes("protect_booking_payment_provider_fields") &&
    securityMigration.includes("protect_customer_payment_provider_fields"),
  "Booking/customer payment-provider fields must be protected from browser writes.",
);
assert(
  securityMigration.includes(
    "REVOKE ALL PRIVILEGES ON TABLE public.payments FROM anon, authenticated",
  ),
  "Browser roles must not be able to alter the verified payment ledger directly.",
);

const sourceFiles = (await walk("src")).filter((file) => /\.(?:ts|tsx|js|jsx)$/.test(file));
for (const file of sourceFiles) {
  const contents = await read(file);
  if (file !== path.join("src", "lib", "public-runtime-env.ts")) {
    assert(
      !contents.includes("VITE_SUPABASE_URL") &&
        !contents.includes("VITE_SUPABASE_PUBLISHABLE_KEY"),
      `${file} reads a public Supabase environment variable outside the server-aware runtime boundary.`,
    );
  }
}

const migrationFiles = (await walk("supabase/migrations")).filter((file) => file.endsWith(".sql"));
const migrations = (await Promise.all(migrationFiles.map(read))).join("\n");
const createdPublicTables = new Set(
  [
    ...migrations.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)/gi,
    ),
  ].map((match) => match[1].toLowerCase()),
);
const rlsTables = new Set(
  [
    ...migrations.matchAll(
      /alter\s+table\s+(?:if\s+exists\s+)?public\.([a-z_][a-z0-9_]*)\s+enable\s+row\s+level\s+security/gi,
    ),
  ].map((match) => match[1].toLowerCase()),
);
const missingRls = [...createdPublicTables].filter((table) => !rlsTables.has(table));
assert(
  missingRls.length === 0,
  `Public tables missing Row Level Security: ${missingRls.join(", ")}`,
);

// When a production build exists, verify that the actual project identifier
// was not compiled into any browser asset. Generic supabase-js library strings
// (such as *.supabase.co validation) are harmless; the project ref is not.
try {
  const config = await read("supabase/config.toml");
  const projectRef = config.match(/^project_id\s*=\s*["']([^"']+)["']/m)?.[1];
  if (projectRef) {
    const publicBuildFiles = await walk(".output/public");
    for (const file of publicBuildFiles.filter((file) => /\.(?:js|html|json)$/.test(file))) {
      assert(
        !(await read(file)).includes(projectRef),
        `${file} exposes the real Supabase project identifier in a browser asset.`,
      );
    }
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

console.log(
  `Security boundary verified: same-origin gateway, protected billing/payment fields, and RLS on ${createdPublicTables.size} public tables.`,
);
