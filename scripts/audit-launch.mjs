const origin = new URL(
  process.argv[2] || process.env.BOOKZENVO_AUDIT_URL || "https://bookzenvo.com",
);
const requiredPages = [
  "/",
  "/faq",
  "/help",
  "/privacy",
  "/terms",
  "/cookie-policy",
  "/refund-policy",
  "/review-policy",
  "/status",
  "/auth",
];
const canonicalPages = new Set(
  requiredPages.filter((path) => path !== "/auth"),
);
const queue = requiredPages.map((path) => new URL(path, origin).href);
const queued = new Set(queue);
const checked = new Map();
const failures = [];
const warnings = [];
const REQUEST_TIMEOUT_MS = 10_000;

const skipPath = (pathname) =>
  ["/api/", "/portal", "/booking-action/", "/invite/", "/review/"].some(
    (prefix) => pathname.startsWith(prefix),
  );

function pageAttributes(html, attribute) {
  const values = [];
  const pattern = new RegExp(`(?:href|src)=["']([^"']+)["']`, "gi");
  let match;
  while ((match = pattern.exec(html))) values.push(match[1]);
  return values;
}

function enqueue(reference, from) {
  if (
    !reference ||
    reference.startsWith("#") ||
    /^(?:mailto|tel|javascript|data):/i.test(reference)
  )
    return;
  let url;
  try {
    url = new URL(reference, from);
  } catch {
    warnings.push(`Invalid URL on ${from}: ${reference}`);
    return;
  }
  if (url.origin !== origin.origin || skipPath(url.pathname)) return;
  url.hash = "";
  const href = url.href;
  if (!queued.has(href) && queued.size < 150) {
    queued.add(href);
    queue.push(href);
  }
}

while (queue.length) {
  const url = queue.shift();
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": "Bookzenvo-launch-audit" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const contentType = response.headers.get("content-type") || "";
    checked.set(url, response.status);
    if (!response.ok) {
      failures.push(`${response.status} ${url}`);
      continue;
    }
    if (!contentType.includes("text/html")) continue;

    const html = await response.text();
    for (const reference of pageAttributes(html)) enqueue(reference, url);

    const path = new URL(url).pathname.replace(/\/$/, "") || "/";
    if (
      canonicalPages.has(path) &&
      !/<link[^>]+rel=["']canonical["']/i.test(html)
    ) {
      failures.push(`Missing canonical URL: ${url}`);
    }
    if (
      path === "/auth" &&
      !/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html)
    ) {
      failures.push(`Sign-in page is missing noindex: ${url}`);
    }
    for (const tag of html.match(/<img\b[^>]*>/gi) || []) {
      if (!/\balt=["'][^"']*["']/i.test(tag))
        warnings.push(`Image without alt attribute: ${url}`);
    }
  } catch (error) {
    failures.push(
      `Request failed ${url}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

console.log(
  `Checked ${checked.size} public pages and assets at ${origin.origin}.`,
);
for (const warning of [...new Set(warnings)]) console.warn(`WARN ${warning}`);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}
console.log("Launch link and metadata audit passed.");
