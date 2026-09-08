const productionUrl =
  process.env.BOOKZENVO_PRODUCTION_URL || "https://bookzenvo.com";
const REQUEST_TIMEOUT_MS = 10_000;

async function checkedFetch(url) {
  return fetch(url, {
    redirect: "follow",
    headers: { "user-agent": "Bookzenvo-production-check" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

const response = await checkedFetch(productionUrl);
const body = await response.text();

// TanStack Start streams its app directly into <body>, so the app does not
// necessarily use a traditional #root element. Require the HTML shell plus a
// fingerprinted client bundle instead.
const entryMatch = body.match(/src="(\/assets\/index-[^"]+\.js)"/);

if (!response.ok || !body.includes("<body") || !entryMatch) {
  console.error(
    `Production check failed for ${response.url} (HTTP ${response.status}).`,
  );
  process.exit(1);
}

const entryResponse = await checkedFetch(new URL(entryMatch[1], response.url));
if (
  !entryResponse.ok ||
  !entryResponse.headers.get("content-type")?.includes("javascript")
) {
  console.error(
    `Production client bundle failed for ${entryResponse.url} (HTTP ${entryResponse.status}).`,
  );
  process.exit(1);
}

const healthResponse = await checkedFetch(new URL("/api/health", response.url));
const health = await healthResponse.json().catch(() => null);
if (!healthResponse.ok || health?.status !== "ok") {
  console.error(
    `Production health check failed for ${healthResponse.url} (HTTP ${healthResponse.status}).`,
  );
  process.exit(1);
}

console.log(
  `Production check passed: ${response.url} (HTTP ${response.status}).`,
);
