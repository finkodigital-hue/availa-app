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
export const BOOKING_STATUSES = [
  { id: "pending", label: "Pending", color: "#94A3B8", tint: "rgba(148,163,184,0.15)" },
  { id: "confirmed", label: "Confirmed", color: "#3B82F6", tint: "rgba(59,130,246,0.14)" },
  { id: "checked_in", label: "Checked in", color: "#8B5CF6", tint: "rgba(139,92,246,0.14)" },
  { id: "in_progress", label: "In progress", color: "#F59E0B", tint: "rgba(245,158,11,0.14)" },
  { id: "completed", label: "Completed", color: "#10B981", tint: "rgba(16,185,129,0.14)" },
  { id: "cancelled", label: "Cancelled", color: "#EF4444", tint: "rgba(239,68,68,0.12)" },
  { id: "no_show", label: "No-show", color: "#64748B", tint: "rgba(100,116,139,0.14)" },
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number]["id"];

export const statusMeta = (id: string | null | undefined) =>
  BOOKING_STATUSES.find((s) => s.id === id) ?? BOOKING_STATUSES[1];
