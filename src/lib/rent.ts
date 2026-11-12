import { fmtMoney } from "./format.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function rentId(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value))
    throw new Error("Invalid rent record.");
  return value;
}
export function rentDate(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  ) {
    throw new Error("Enter a valid calendar date.");
  }
  return value;
}
export function rentToday(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function rentDateLabel(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "UTC",
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(new Date(`${rentDate(value)}T00:00:00Z`))
    : "—";
}
export function rentStatus(
  row: { status: string; due_date: string | null },
  today: string,
) {
  return row.status === "due" && row.due_date && row.due_date < today
    ? "overdue"
    : row.status;
}
export function rentOutstanding(
  rows: { status: string; amount_cents: number }[],
) {
  return rows
    .filter((r) => r.status === "due" || r.status === "overdue")
    .reduce((sum, r) => sum + r.amount_cents, 0);
}
export function rentSummary(
  l: {
    rent_mode: string;
    rent_amount_cents: number | null;
    commission_percent: number | null;
  },
  currency = "GBP",
) {
  const amount =
    l.rent_amount_cents == null ? "—" : fmtMoney(l.rent_amount_cents, currency);
  switch (l.rent_mode) {
    case "weekly":
      return `${amount} / week`;
    case "monthly":
      return `${amount} / month`;
    case "percentage":
      return `${l.commission_percent ?? 0}% commission (recorded manually)`;
    case "fixed_commission":
      return `${amount} per booking (recorded manually)`;
    default:
      return "No rent agreement";
  }
}
export function validateRentPayment(data: {
  linkId: string;
  requestId: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amountCents: number;
  alreadyPaid: boolean;
}) {
  const linkId = rentId(data?.linkId),
    requestId = rentId(data?.requestId);
  const periodStart = rentDate(data.periodStart),
    periodEnd = rentDate(data.periodEnd),
    dueDate = rentDate(data.dueDate);
  if (periodEnd <= periodStart)
    throw new Error(
      "Period end must be after its start (the end date is not included).",
    );
  if (
    typeof data.amountCents !== "number" ||
    !Number.isSafeInteger(data.amountCents) ||
    data.amountCents <= 0 ||
    data.amountCents > 2147483647
  )
    throw new Error("Enter a positive amount with at most two decimal places.");
  if (typeof data.alreadyPaid !== "boolean")
    throw new Error("Choose whether the rent was already paid.");
  return {
    linkId,
    requestId,
    periodStart,
    periodEnd,
    dueDate,
    amountCents: data.amountCents,
    alreadyPaid: data.alreadyPaid,
  };
}
