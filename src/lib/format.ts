export const fmtMoney = (cents: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format((cents || 0) / 100);

export const fmtTime = (d: Date | string) =>
  new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

export const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
