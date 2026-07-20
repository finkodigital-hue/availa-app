export const DEFAULT_CURRENCY = "GBP";

export const fmtMoney = (cents: number, currency = DEFAULT_CURRENCY) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: currency || DEFAULT_CURRENCY }).format((cents || 0) / 100);

export const fmtTime = (d: Date | string) =>
  new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

export const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Booking lifecycle. Stored as `bookings.status` (text). Order = workflow order.
// Colors are the single source of status meaning across the app — the
// Calendar's booking blocks, the Bookings list, Customers page, and the
// import wizard all read status from this palette. Each hue is deliberately
// distinct (spaced around the wheel, skipping the sickly yellow/lime band)
// and vivid enough to read at a glance, while "completed" is intentionally
// desaturated so finished bookings recede rather than compete for attention.
export const BOOKING_STATUSES = [
  { id: "pending", label: "Pending", color: "oklch(0.58 0.15 58)", tint: "oklch(0.94 0.045 58)" },
  { id: "confirmed", label: "Confirmed", color: "oklch(0.52 0.14 150)", tint: "oklch(0.93 0.045 150)" },
  { id: "checked_in", label: "Checked in", color: "oklch(0.52 0.15 235)", tint: "oklch(0.93 0.04 235)" },
  { id: "in_progress", label: "In progress", color: "oklch(0.50 0.17 300)", tint: "oklch(0.93 0.045 300)" },
  { id: "completed", label: "Completed", color: "oklch(0.45 0.035 150)", tint: "oklch(0.94 0.012 150)" },
  { id: "cancelled", label: "Cancelled", color: "oklch(0.55 0.18 25)", tint: "oklch(0.94 0.045 25)" },
  { id: "no_show", label: "No-show", color: "oklch(0.48 0.13 40)", tint: "oklch(0.93 0.04 40)" },
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number]["id"];

export const statusMeta = (id: string | null | undefined) =>
  BOOKING_STATUSES.find((s) => s.id === id) ?? BOOKING_STATUSES[1];
