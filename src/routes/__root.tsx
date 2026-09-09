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
    <>
      <title>Page not found — Bookzenvo</title>
      <meta name="robots" content="noindex, follow" />
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Error 404</p>
          <h1 className="mt-3 font-display text-4xl text-foreground">Page not found</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            This page doesn&apos;t exist or may have moved. Head back to Bookzenvo or visit the Help Centre.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Go home
            </Link>
            <Link
              to="/help"
              className="inline-flex items-center justify-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary"
            >
              Visit Help Centre
            </Link>
          </div>
        </div>
      </div>
    </>
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
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Bookzenvo — Bookings made beautiful" },
      {
        name: "twitter:description",
        content:
          "A multi-tenant booking platform for modern studios, salons and service businesses.",
      },
      { property: "og:image", content: "https://bookzenvo.com/bookzenvo-social-share.png" },
      { property: "og:image:width", content: "1730" },
      { property: "og:image:height", content: "909" },
      { property: "og:image:alt", content: "Bookzenvo — Bookings made beautiful" },
      { name: "twitter:image", content: "https://bookzenvo.com/bookzenvo-social-share.png" },
      { name: "twitter:image:alt", content: "Bookzenvo — Bookings made beautiful" },
    ],
    links: [
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <a
          href="#main-content"
          className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background shadow-lg transition-transform focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          Skip to main content
        </a>
        <script
          dangerouslySetInnerHTML={{
            // Supabase recovery links use a URL hash. If a project-level redirect
            // sends one to the site root, preserve that hash and send the visitor
            // straight to the password form before the app boots.
            __html: `if (window.location.pathname === '/' && /(?:^|&)type=recovery(?:&|$)/.test(window.location.hash.slice(1))) { window.location.replace('/auth?mode=update' + window.location.hash); }`,
          }}
        />
        <div id="main-content" tabIndex={-1} className="outline-none">
          {children}
        </div>
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
      reportClientError(reason?.message ?? String(reason ?? "Unhandled rejection"), reason?.stack);
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
