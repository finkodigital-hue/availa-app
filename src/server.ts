import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;
let cloudflareBindingsPromise: Promise<Record<string, unknown>> | undefined;

/**
 * "cloudflare:workers" is injected by the actual Cloudflare Workers runtime —
 * it doesn't exist under `vite dev` (plain Node.js), so it must stay a lazy
 * dynamic import here rather than a static one. A static import is resolved
 * eagerly by Vite's SSR module graph and crashes dev with "Cannot find
 * module" before a single request is handled; a dynamic import only runs
 * when actually called, and its rejection is catchable. In production this
 * still resolves normally — vite.config.ts marks the module `external` so
 * Cloudflare's own runtime supplies it.
 */
async function getCloudflareBindings(): Promise<Record<string, unknown>> {
  if (!cloudflareBindingsPromise) {
    cloudflareBindingsPromise = import("cloudflare:workers")
      .then((m) => (m as { env?: Record<string, unknown> }).env ?? {})
      .catch(() => ({}));
  }
  return cloudflareBindingsPromise;
}

/**
 * Cloudflare Workers passes bindings to the fetch handler rather than adding
 * them to `process.env`. The TanStack/Supabase code uses `process.env`, so
 * make string bindings available there before handling the first request.
 */
async function getRuntimeBindings(env: unknown): Promise<Record<string, unknown>> {
  const handlerBindings = env && typeof env === "object" ? env : {};
  // Nitro's Cloudflare adapter stores the request bindings here before it
  // invokes TanStack's SSR handler. The SSR handler itself only receives the
  // Request, so `env` above can be undefined in production.
  const nitroBindings =
    globalThis.__env__ && typeof globalThis.__env__ === "object" ? globalThis.__env__ : {};
  return {
    ...(await getCloudflareBindings()),
    ...(nitroBindings as Record<string, unknown>),
    ...(handlerBindings as Record<string, unknown>),
  };
}

async function installRuntimeEnvironment(env: unknown) {
  const bindings = await getRuntimeBindings(env);

  const runtimeEnv = process.env;
  for (const [name, value] of Object.entries(bindings)) {
    if (typeof value === "string" && !runtimeEnv[name]) {
      runtimeEnv[name] = value;
    }
  }
}

/**
 * Nitro's generated public-asset manifest only includes files copied from
 * `public/`; Vite's built `/assets/*` files are not included in that map.
 * Serve those through Cloudflare's ASSETS binding before React SSR runs.
 */
async function serveBuiltAsset(request: Request, env: unknown): Promise<Response | undefined> {
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith("/assets/") && pathname !== "/client-entry.js") return undefined;

  const bindings = await getRuntimeBindings(env);
  const assets = bindings.ASSETS as { fetch?: (request: Request) => Promise<Response> } | undefined;
  if (!assets?.fetch) return undefined;

  return assets.fetch(request);
}

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response, env: unknown): Promise<Response> {
  // Nitro can occasionally return a successful response with an empty stream
  // (notably after a Cloudflare build/runtime restart). Keep the application
  // usable by returning the normal client shell; the TanStack client router
  // then hydrates the requested route and renders the full page.
  if (response.status >= 200 && response.status < 300) {
    const body = await response.clone().text();
    if (!body.trim()) {
      // The browser client needs these public values before it can initialise
      // Supabase. The normal SSR document adds them in RootShell, but an empty
      // Nitro stream skips RootShell entirely. Without this script the fallback
      // looks successful in a browser, then immediately crashes into a blank
      // page while the client starts.
      const bindings = await getRuntimeBindings(env);
      const publicEnvironment = JSON.stringify({
        supabaseUrl: process.env.SUPABASE_URL ?? bindings.SUPABASE_URL,
        supabasePublishableKey:
          process.env.SUPABASE_PUBLISHABLE_KEY ?? bindings.SUPABASE_PUBLISHABLE_KEY,
      }).replace(/</g, "\\u003c");
      return new Response(
        `<!doctype html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Bookzenvo</title></head><body><script>window.__BOOKZENVO_ENV__=${publicEnvironment};</script><div id="root"></div><script type="module" src="/client-entry.js"></script></body></html>`,
        { status: response.status, headers: { "content-type": "text/html; charset=utf-8" } },
      );
    }
  }
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const assetResponse = await serveBuiltAsset(request, env);
      if (assetResponse) return assetResponse;

      await installRuntimeEnvironment(env);
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response, env);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
