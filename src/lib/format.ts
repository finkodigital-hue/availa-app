export const fmtMoney = (cents: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format((cents || 0) / 100);

export const fmtTime = (d: Date | string) =>
  new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

export const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Booking lifecycle. Stored as `bookings.status` (text). Order = workflow order.
// Colors kept in oklch (same system as the rest of the app) at a calmer
// saturation than stock Tailwind swatches, so status accents read as
// considered rather than off-the-shelf.
export const BOOKING_STATUSES = [
  { id: "pending", label: "Pending", color: "oklch(0.6 0.02 260)", tint: "oklch(0.6 0.02 260 / 0.12)" },
  { id: "confirmed", label: "Confirmed", color: "oklch(0.56 0.13 254)", tint: "oklch(0.56 0.13 254 / 0.12)" },
  { id: "checked_in", label: "Checked in", color: "oklch(0.56 0.13 300)", tint: "oklch(0.56 0.13 300 / 0.12)" },
  { id: "in_progress", label: "In progress", color: "oklch(0.68 0.13 70)", tint: "oklch(0.68 0.13 70 / 0.14)" },
  { id: "completed", label: "Completed", color: "oklch(0.6 0.12 155)", tint: "oklch(0.6 0.12 155 / 0.12)" },
  { id: "cancelled", label: "Cancelled", color: "oklch(0.58 0.17 25)", tint: "oklch(0.58 0.17 25 / 0.1)" },
  { id: "no_show", label: "No-show", color: "oklch(0.52 0.015 260)", tint: "oklch(0.52 0.015 260 / 0.1)" },
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number]["id"];

export const statusMeta = (id: string | null | undefined) =>
  BOOKING_STATUSES.find((s) => s.id === id) ?? BOOKING_STATUSES[1];
