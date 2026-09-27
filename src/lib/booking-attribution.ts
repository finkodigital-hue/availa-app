export type BookingSource = "google" | "instagram";

/** Only recognise our two link labels. Never persist full URLs or query strings. */
export function normalizeBookingSource(value: unknown): BookingSource | null {
  return value === "google" || value === "instagram" ? value : null;
}

export function bookingSourceFromSearch(search: string): BookingSource | null {
  return normalizeBookingSource(new URLSearchParams(search).get("utm_source"));
}
