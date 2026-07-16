import { createFileRoute, notFound } from "@tanstack/react-router";
import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { type PageBlock } from "@/components/page-blocks";
import { googleFontsHref, parseTheme } from "@/lib/theme";
import { PublicBookingPage } from "@/components/public-booking-page";
import { CookieConsentBanner, CookieConsentProvider, CookieSettingsFooterLink } from "@/components/cookie-consent";

export const Route = createFileRoute("/book/$slug")({
  loader: async ({ params, location }) => {
    const { data, error } = await (supabase as any)
      .from("public_businesses")
      .select("id, name, slug, description, page_theme, address, phone, website, email, timezone, instagram, facebook, twitter")
      .eq("slug", params.slug)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound();

    // A preview request (used by the page builder's AI before/after and
    // screenshot capture) supplies its own candidate blocks via query params
    // instead of reading the saved layout — nothing is persisted by visiting
    // this URL.
    const search = location.search as { preview?: unknown; previewBlocks?: unknown };
    if (search?.preview && search?.previewBlocks) {
      try {
        const raw = search.previewBlocks;
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) {
          return { ...data, pageBlocks: parsed.filter((b) => b && b.type) as PageBlock[] };
        }
      } catch {
        // fall through to the saved layout below
      }
    }

    // Custom page layout is optional — if the owner never used the page
    // builder (or the row can't be read for any reason), fall back to the
    // page exactly as it's always looked.
    const { data: layout } = await supabase
      .from("page_layouts")
      .select("blocks")
      .eq("business_id", data.id)
      .maybeSingle();
    const pageBlocks = ((layout?.blocks as unknown as PageBlock[]) ?? []).filter((b) => b && b.type);

    return { ...data, pageBlocks };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `Book with ${loaderData.name}` : "Book" },
      { name: "description", content: loaderData?.description ?? `Book online with ${loaderData?.name ?? ""}.` },
      { property: "og:title", content: loaderData ? `Book with ${loaderData.name}` : "Book" },
      { property: "og:description", content: loaderData?.description ?? "" },
    ],
    links: loaderData
      ? [{ rel: "stylesheet", href: googleFontsHref(parseTheme(loaderData.page_theme)) }]
      : [],
  }),
  errorComponent: ({ error }) => (
    <div className="min-h-screen flex items-center justify-center p-6 text-center text-muted-foreground">{error.message}</div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center p-6 text-center">
      <div>
        <Sparkles className="h-8 w-8 text-muted-foreground mx-auto" />
        <h1 className="font-display text-3xl mt-4">We couldn't find that page.</h1>
        <p className="text-muted-foreground mt-2">The link may be wrong, or the business has moved.</p>
      </div>
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
      footerExtra={isScreenshotPreview ? undefined : <CookieSettingsFooterLink />}
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
