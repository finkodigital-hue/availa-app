function withCacheControl(response: Response, value: string): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", value);
  headers.delete("CDN-Cache-Control");
  headers.delete("Cloudflare-CDN-Cache-Control");
  headers.delete("Expires");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function isFingerprintedAsset(pathname: string, response: Response): boolean {
  const extension = /^\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(js|mjs|css|woff2?|png|jpe?g|gif|svg|webp|avif|ico)$/.exec(pathname)?.[1];
  const type = (response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
  if (extension === "js" || extension === "mjs") return /^(?:text|application)\/javascript$/.test(type);
  if (extension === "css") return type === "text/css";
  if (extension === "woff") return type === "font/woff" || type === "application/font-woff";
  if (extension === "woff2") return type === "font/woff2";
  if (extension === "svg") return type === "image/svg+xml";
  if (extension === "jpg" || extension === "jpeg") return type === "image/jpeg";
  if (extension === "ico") return type === "image/x-icon" || type === "image/vnd.microsoft.icon";
  return Boolean(extension && type === `image/${extension}`);
}

// Used by both the TanStack entry and the generated outer Cloudflare entry.
// Nitro can return manifest assets before TanStack is invoked.
export function applyResponseCachePolicy(request: Request, response: Response): Response {
  const path = new URL(request.url).pathname;
  if (path.startsWith("/assets/") || path === "/client-entry.js") {
    const immutable = (request.method === "GET" || request.method === "HEAD") &&
      (response.status === 200 || response.status === 206) && isFingerprintedAsset(path, response);
    return withCacheControl(response, immutable ? "public, max-age=31536000, immutable" : "no-store");
  }
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const isDocumentRequest = !path.startsWith("/api/") &&
    (request.headers.get("accept") ?? "").includes("text/html");
  if (response.status >= 400 || contentType.includes("text/html") ||
      contentType.includes("application/xhtml+xml") || isDocumentRequest || path === "/deployment.json") {
    return withCacheControl(response, "no-store");
  }
  return response;
}
