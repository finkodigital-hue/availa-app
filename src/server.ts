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
async function installRuntimeEnvironment(env: unknown) {
  const handlerBindings = env && typeof env === "object" ? env : {};
  // Nitro's Cloudflare adapter stores the request bindings here before it
  // invokes TanStack's SSR handler. The SSR handler itself only receives the
  // Request, so `env` above can be undefined in production.
  const nitroBindings =
    globalThis.__env__ && typeof globalThis.__env__ === "object" ? globalThis.__env__ : {};
  const bindings = {
    ...(await getCloudflareBindings()),
    ...(nitroBindings as Record<string, unknown>),
    ...(handlerBindings as Record<string, unknown>),
  };

  const runtimeEnv = process.env;
  for (const [name, value] of Object.entries(bindings)) {
    if (typeof value === "string" && !runtimeEnv[name]) {
      runtimeEnv[name] = value;
    }
  }
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
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  // Nitro can occasionally return a successful response with an empty stream
  // (notably after a Cloudflare build/runtime restart). Keep the application
  // usable by returning the normal client shell; the TanStack client router
  // then hydrates the requested route and renders the full page.
  if (response.status >= 200 && response.status < 300) {
    const body = await response.clone().text();
    if (!body.trim()) {
      return new Response(
        `<!doctype html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><link rel="stylesheet" href="/assets/styles-C-6GbtVN.css"/><title>Bookzenvo</title></head><body><div id="root"></div><script type="module" src="/assets/index-CQ2nr3th.js"></script></body></html>`,
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
      await installRuntimeEnvironment(env);
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
