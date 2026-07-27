import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

const securityHeadersMiddleware = createMiddleware().server(async ({ next }) => {
  // `next()` resolves to the middleware context ({ request, pathname,
  // context, response, ... }), not the Response itself. The actual Response
  // lives at `.response` — mutate its headers in place rather than
  // constructing a new Response around it. Streaming SSR responses are
  // tracked by object identity downstream (see executeMiddleware's
  // getFinalResponse in @tanstack/start-server-core); replacing the Response
  // object breaks that identity check, causing the framework to dispose the
  // in-flight stream and fall back to an empty body on every request.
  const ctx = await next();
  const response = ctx.response;

  response.headers.set("Content-Security-Policy", "base-uri 'self'; frame-ancestors 'none'; object-src 'none'");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
  response.headers.set("Strict-Transport-Security", "max-age=31536000");

  return ctx;
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [securityHeadersMiddleware, errorMiddleware],
}));
