const productionUrl = process.env.BOOKZENVO_PRODUCTION_URL || "https://bookzenvo.com";

const response = await fetch(productionUrl, {
  redirect: "follow",
  headers: { "user-agent": "Bookzenvo-production-check" },
});
const body = await response.text();

// TanStack Start streams its app directly into <body>, so the app does not
// necessarily use a traditional #root element. Require the HTML shell plus a
// fingerprinted client bundle instead.
const entryMatch = body.match(/src="(\/assets\/index-[^"]+\.js)"/);

if (!response.ok || !body.includes("<body") || !entryMatch) {
  console.error(`Production check failed for ${response.url} (HTTP ${response.status}).`);
  process.exit(1);
}

const entryResponse = await fetch(new URL(entryMatch[1], response.url));
if (!entryResponse.ok || !entryResponse.headers.get("content-type")?.includes("javascript")) {
  console.error(`Production client bundle failed for ${entryResponse.url} (HTTP ${entryResponse.status}).`);
  process.exit(1);
}

console.log(`Production check passed: ${response.url} (HTTP ${response.status}).`);
