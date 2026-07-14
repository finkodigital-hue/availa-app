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
// Colors drawn from the Bookzenvo editorial palette (sage/amber/gold/charcoal)
// so status accents read as considered rather than off-the-shelf.
export const BOOKING_STATUSES = [
  { id: "pending", label: "Pending", color: "#A8813E", tint: "#F5E9D2" },
  { id: "confirmed", label: "Confirmed", color: "#748563", tint: "#EAEDE5" },
  { id: "checked_in", label: "Checked in", color: "#A98B5F", tint: "#F4EDE1" },
  { id: "in_progress", label: "In progress", color: "#B26A45", tint: "#F3E2D8" },
  { id: "completed", label: "Completed", color: "#5C7A6E", tint: "#E4EBE7" },
  { id: "cancelled", label: "Cancelled", color: "#A8503E", tint: "#F5E5E1" },
  { id: "no_show", label: "No-show", color: "#8B857B", tint: "#F3F1EB" },
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number]["id"];

export const statusMeta = (id: string | null | undefined) =>
  BOOKING_STATUSES.find((s) => s.id === id) ?? BOOKING_STATUSES[1];
