export type BookingChannel = "google" | "instagram";

const CHANNEL_CAMPAIGNS: Record<BookingChannel, string> = {
  google: "google_business_profile",
  instagram: "instagram_profile",
};

export function bookingPageUrl(origin: string, slug: string) {
  const cleanOrigin = origin.replace(/\/+$/, "");
  return `${cleanOrigin}/book/${encodeURIComponent(slug)}`;
}

export function channelBookingUrl(
  origin: string,
  slug: string,
  channel: BookingChannel,
) {
  const url = new URL(bookingPageUrl(origin, slug));
  url.searchParams.set(
    "utm_source",
    channel === "google" ? "google" : "instagram",
  );
  url.searchParams.set("utm_medium", "profile");
  url.searchParams.set("utm_campaign", CHANNEL_CAMPAIGNS[channel]);
  return url.toString();
}

export function bookingButtonHtml(url: string, businessName: string) {
  const safeName = businessName
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return `<a href="${url}" target="_blank" rel="noopener noreferrer" aria-label="Book an appointment with ${safeName}">Book now</a>`;
}
