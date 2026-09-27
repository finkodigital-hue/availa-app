import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lockfilePath = join(projectRoot, "package-lock.json");
const outputPath = join(projectRoot, "public", "third-party-notices.txt");
const checkOnly = process.argv.includes("--check");

const lockfile = JSON.parse(readFileSync(lockfilePath, "utf8"));
const packages = new Map();

for (const [relativePath, lockedPackage] of Object.entries(
  lockfile.packages ?? {},
)) {
  if (
    !relativePath ||
    lockedPackage.dev === true ||
    lockedPackage.optional === true ||
    !lockedPackage.version ||
    !relativePath.includes("node_modules/")
  ) {
    continue;
  }

  const packagePath = join(projectRoot, ...relativePath.split("/"));
  const manifestPath = join(packagePath, "package.json");
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Install dependencies before generating notices: ${relativePath} is missing.`,
    );
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const key = `${manifest.name}@${manifest.version}`;
  if (packages.has(key)) continue;

  const licenceFile = readdirSync(packagePath).find((name) =>
    /^(licen[sc]e|copying|notice)(\..*)?$/i.test(name),
  );
  const licenceText = licenceFile
    ? readFileSync(join(packagePath, licenceFile), "utf8")
        .replaceAll("\r\n", "\n")
        .trim()
    : "";
  const repository =
    typeof manifest.repository === "string"
      ? manifest.repository
      : (manifest.repository?.url ??
        manifest.homepage ??
        "Not declared in package metadata");

  packages.set(key, {
    name: manifest.name,
    version: manifest.version,
    licence: manifest.license ?? lockedPackage.license ?? "Not declared",
    repository,
    licenceText,
  });
}

const sortedPackages = [...packages.values()].sort((a, b) =>
  `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`),
);
const lockfileHash = createHash("sha256")
  .update(readFileSync(lockfilePath))
  .digest("hex");
const divider = "=".repeat(80);
const output = [
  "BOOKZENVO THIRD-PARTY SOFTWARE NOTICES",
  "",
  "This file records licence information shipped with production dependencies.",
  "The original authors retain all rights granted or reserved by their licences.",
  `package-lock.json SHA-256: ${lockfileHash}`,
  `Package/version records: ${sortedPackages.length}`,
  "",
  ...sortedPackages.flatMap((item) => [
    divider,
    `${item.name} ${item.version}`,
    `Declared licence: ${item.licence}`,
    `Source: ${item.repository}`,
    "",
    item.licenceText ||
      "The installed package did not contain a licence-text file. Its package metadata licence label is recorded above; consult the linked source before redistribution.",
    "",
  ]),
].join("\n");

if (checkOnly) {
  if (!existsSync(outputPath) || readFileSync(outputPath, "utf8") !== output) {
    throw new Error(
      "Third-party notices are stale. Run `npm run notices:generate` and commit the result.",
    );
  }
  console.log(
    `Third-party notices match ${sortedPackages.length} production package/version records.`,
  );
} else {
  writeFileSync(outputPath, output, "utf8");
  console.log(
    `Wrote ${outputPath} with ${sortedPackages.length} production package/version records.`,
  );
}
