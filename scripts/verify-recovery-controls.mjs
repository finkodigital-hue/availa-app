import { readFileSync } from "node:fs";

const restore = readFileSync(
  new URL("./restore-local.mjs", import.meta.url),
  "utf8",
);
const requiredGuards = [
  'const execute = args.includes("--execute")',
  "if (!localHosts.has(target.hostname))",
  '["postgres", "template0", "template1"].includes(database)',
  "if (confirmation !== database)",
  '"--no-owner"',
  '"--no-privileges"',
];

const missing = requiredGuards.filter((guard) => !restore.includes(guard));
if (missing.length) {
  console.error(
    `Restore safety controls are missing:\n- ${missing.join("\n- ")}`,
  );
  process.exit(1);
}

console.log(
  "Recovery control check passed: local-only target and explicit confirmation remain enforced.",
);
