import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { type ReactNode, useEffect } from "react";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";

// Fire-and-forget crash reporting to /api/client-errors (see that route for
// the server-side limits). Session-deduped and capped so a render loop can't
// flood the endpoint from one tab.
const reportedMessages = new Set<string>();
function reportClientError(message: string, stack?: string) {
  try {
    if (typeof window === "undefined") return;
    if (reportedMessages.size >= 10 || reportedMessages.has(message)) return;
    reportedMessages.add(message);
    fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, stack, url: window.location.href }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Reporting must never throw.
  }
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl">404</h1>
        <h2 className="mt-4 text-xl text-foreground">Not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">This page doesn't exist or has moved.</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  reportClientError(error.message, error.stack);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-2xl">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Try again
          </button>
          <a href="/" className="rounded-xl border px-4 py-2 text-sm">
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Bookzenvo — Bookings made beautiful" },
      {
        name: "description",
        content:
          "A multi-tenant booking platform for modern studios, salons and service businesses.",
      },
      { property: "og:title", content: "Bookzenvo — Bookings made beautiful" },
      {
        property: "og:description",
        content:
          "A multi-tenant booking platform for modern studios, salons and service businesses.",
      },
      { property: "og:site_name", content: "Bookzenvo" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Bookzenvo — Bookings made beautiful" },
      {
        name: "twitter:description",
        content:
          "A multi-tenant booking platform for modern studios, salons and service businesses.",
      },
      { property: "og:image", content: "https://bookzenvo.com/favicon.png" },
      { name: "twitter:image", content: "https://bookzenvo.com/favicon.png" },
    ],
    links: [
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap",
      },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const publicEnvironment =
    typeof window === "undefined"
      ? JSON.stringify({
          supabaseUrl: process.env.SUPABASE_URL,
          supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
        }).replace(/</g, "\\u003c")
      : null;

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {publicEnvironment && (
          <script
            dangerouslySetInnerHTML={{ __html: `window.__BOOKZENVO_ENV__=${publicEnvironment};` }}
          />
        )}
        <script
          dangerouslySetInnerHTML={{
            // Supabase recovery links use a URL hash. If a project-level redirect
            // sends one to the site root, preserve that hash and send the visitor
            // straight to the password form before the app boots.
            __html: `if (window.location.pathname === '/' && /(?:^|&)type=recovery(?:&|$)/.test(window.location.hash.slice(1))) { window.location.replace('/auth?mode=update' + window.location.hash); }`,
          }}
        />
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      reportClientError(e.message ?? "Unknown error", e.error?.stack);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      reportClientError(
        reason?.message ?? String(reason ?? "Unhandled rejection"),
        reason?.stack,
      );
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
