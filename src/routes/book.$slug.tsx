import { createFileRoute, notFound } from "@tanstack/react-router";
import { useMemo } from "react";
import { SearchX } from "lucide-react";
import { Wordmark } from "@/components/wordmark";
import "../marketing.css";
import { supabase } from "@/integrations/supabase/client";
import { googleFontsHref, parseTheme } from "@/lib/theme";
import { PublicBookingPage } from "@/components/public-booking-page";
import {
  CookieConsentBanner,
  CookieConsentProvider,
  CookieSettingsFooterLink,
} from "@/components/cookie-consent";
import { sanitizePageBlocks } from "@/lib/page-block-security";

export const Route = createFileRoute("/book/$slug")({
  loader: async ({ params, location }) => {
    const { data, error } = await (supabase as any)
      .from("public_businesses")
      .select(
        "id, name, slug, description, page_theme, address, phone, website, email, timezone, instagram, facebook, twitter, currency, payment_mode, deposit_percent, cancellation_window_hours, cancellation_policy, reminder_hours_before",
      )
      .eq("slug", params.slug)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound();

    // A preview request (used by the page builder's AI before/after and
    // screenshot capture) supplies its own candidate blocks via query params
    // instead of reading the saved layout — nothing is persisted by visiting
    // this URL.
    const search = location.search as {
      preview?: unknown;
      previewBlocks?: unknown;
    };
    if (search?.preview && search?.previewBlocks) {
      try {
        const raw = search.previewBlocks;
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed) && JSON.stringify(parsed).length <= 180_000) {
          return { ...data, pageBlocks: sanitizePageBlocks(parsed, data.id) };
        }
      } catch {
        // fall through to the saved layout below
      }
    }

    // Custom page layout is optional — if the owner never used the page
    // builder (or the row can't be read for any reason), fall back to the
    // page exactly as it's always looked.
    let { data: layout, error: layoutError } = await supabase
      .from("page_layouts")
      .select("blocks, storefront_settings")
      .eq("business_id", data.id)
      .maybeSingle();
    // Keep the public page usable while the new storefront migration is
    // rolling out across environments. Once present, the richer select is
    // used automatically; older databases fall back to their saved blocks.
    if (layoutError) {
      const fallback = await supabase
        .from("page_layouts")
        .select("blocks")
        .eq("business_id", data.id)
        .maybeSingle();
      layout = fallback.data
        ? { ...fallback.data, storefront_settings: null }
        : null;
      layoutError = fallback.error;
    }
    if (layoutError) throw layoutError;
    const pageBlocks = sanitizePageBlocks(layout?.blocks, data.id);

    return {
      ...data,
      pageBlocks,
      storefrontSettings: layout?.storefront_settings ?? null,
    };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `Book with ${loaderData.name}` : "Book" },
      {
        name: "description",
        content:
          loaderData?.description ??
          `Book online with ${loaderData?.name ?? ""}.`,
      },
      {
        property: "og:title",
        content: loaderData ? `Book with ${loaderData.name}` : "Book",
      },
      { property: "og:description", content: loaderData?.description ?? "" },
    ],
    links: loaderData
      ? [
          {
            rel: "canonical",
            href: `https://bookzenvo.com/book/${loaderData.slug}`,
          },
          {
            rel: "stylesheet",
            href: googleFontsHref(parseTheme(loaderData.page_theme)),
          },
        ]
      : [],
  }),
  errorComponent: () => (
    <div className="mkt-page min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <h1 className="text-[1.6rem]">This page isn&apos;t loading.</h1>
      <p className="text-muted-foreground mt-2 max-w-[42ch]">
        Something went wrong at our end. Please try again in a moment.
      </p>
      <a
        href="/"
        className="mt-8 inline-flex items-center rounded-[6px] border border-border px-5 py-2.5 text-[.9rem] font-semibold hover:bg-foreground hover:text-background transition-colors"
      >
        Try again
      </a>
    </div>
  ),
  notFoundComponent: () => (
    <div className="mkt-page min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <SearchX
        className="h-7 w-7 text-muted-foreground mb-5"
        strokeWidth={1.5}
        aria-hidden
      />
      <h1 className="text-[1.6rem]">We couldn&apos;t find that page.</h1>
      <p className="text-muted-foreground mt-2 max-w-[42ch]">
        The link may be wrong, or the salon may have moved. Check the link with
        the salon directly.
      </p>
      <a
        href="https://bookzenvo.com/"
        className="mt-10 text-[.85rem] text-muted-foreground hover:text-foreground transition-colors"
      >
        Booking powered by <Wordmark className="text-[.95rem]" />
      </a>
    </div>
  ),
  component: PublicBooking,
});

function PublicBooking() {
  const biz = Route.useLoaderData();
  const theme = useMemo(() => parseTheme(biz.page_theme), [biz.page_theme]);
  // AI before/after previews and the screenshot capture used by the page
  // builder load this same route with ?preview=1 against a throwaway,
  // consent-less browser context — skip the consent UI there so it never
  // shows up baked into a generated screenshot. Real visitors never carry
  // this param.
  const search = Route.useSearch() as { preview?: unknown };
  const isScreenshotPreview = !!search?.preview;

  const page = (
    <PublicBookingPage
      business={biz}
      theme={theme}
      pageBlocks={biz.pageBlocks ?? []}
      storefrontSettings={biz.storefrontSettings}
      footerExtra={
        isScreenshotPreview ? undefined : <CookieSettingsFooterLink />
      }
    />
  );

  if (isScreenshotPreview) return page;

  return (
    <CookieConsentProvider>
      {page}
      <CookieConsentBanner />
    </CookieConsentProvider>
  );
}
