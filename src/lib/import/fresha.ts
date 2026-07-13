// Fresha-specific CSV shapes: which columns each export has, how to detect
// which file is which, and how to turn a raw row into a normalized record.
import type { BookingStatus } from "@/lib/format";
import {
  cleanPhoneDisplay,
  cleanText,
  parseDuration,
  parseFreshaDateTime,
  parsePrice,
  parseSlotTimes,
  resolveApptTimes,
} from "./parse";

export type ImportEntity = "staff" | "customers" | "services" | "bookings";

export const ENTITY_LABELS: Record<ImportEntity, string> = {
  staff: "Team",
  customers: "Clients",
  services: "Services",
  bookings: "Appointments",
};

// Columns we key off for each file. Used only to warn "this doesn't look
// like a Fresha X export" — not a strict schema requirement, since Fresha
// adds/removes columns between export versions.
const ENTITY_SIGNATURES: Record<ImportEntity, string[]> = {
  staff: ["First Name", "Job Title", "Status"],
  customers: ["Client ID", "Full Name", "Mobile Number"],
  services: ["Service Name", "Retail Price", "Duration"],
  bookings: ["Appt. ref.", "Client", "Team member", "Scheduled date"],
};

export function detectEntityMismatch(entity: ImportEntity, headers: string[]): boolean {
  const required = ENTITY_SIGNATURES[entity];
  const have = new Set(headers.map((h) => h.trim()));
  const missing = required.filter((h) => !have.has(h));
  return missing.length > required.length / 2;
}

function normalizeRow(row: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) out[k.trim()] = (v ?? "").trim();
  return out;
}

export type ParsedStaffRow = {
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  sourceStatus: string | null;
};

export function mapStaffRow(raw: Record<string, string>): ParsedStaffRow | null {
  const r = normalizeRow(raw);
  const first = r["First Name"] ?? "";
  const last = r["Last Name"] ?? "";
  const name = `${first} ${last}`.trim();
  if (!name) return null;
  return {
    name,
    email: cleanText(r["Email"]),
    phone: cleanPhoneDisplay(r["Phone Number"]),
    role: cleanText(r["Job Title"]),
    sourceStatus: cleanText(r["Status"]),
  };
}

export type ParsedCustomerRow = {
  externalId: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

export function mapCustomerRow(raw: Record<string, string>): ParsedCustomerRow | null {
  const r = normalizeRow(raw);
  const externalId = r["Client ID"] ?? "";
  const name = r["Full Name"] || `${r["First Name"] ?? ""} ${r["Last Name"] ?? ""}`.trim();
  if (!name || !externalId) return null;
  const phone = cleanPhoneDisplay(r["Mobile Number"]) ?? cleanPhoneDisplay(r["Telephone"]);
  const referral = cleanText(r["Referral Source"]);
  const note = cleanText(r["Note"]);
  const notes =
    [note, referral ? `Referral source: ${referral}` : null].filter(Boolean).join("\n") || null;
  return {
    externalId,
    name,
    email: cleanText(r["Email"]),
    phone,
    notes,
  };
}

export type ParsedServiceRow = {
  externalId: string | null;
  name: string;
  durationMinutes: number;
  durationGuessed: boolean;
  priceCents: number;
  category: string | null;
  description: string | null;
};

export function mapServiceRow(raw: Record<string, string>): ParsedServiceRow | null {
  const r = normalizeRow(raw);
  const name = cleanText(r["Service Name"]);
  if (!name) return null;
  const dur = parseDuration(r["Duration"]);
  const price = parsePrice(r["Retail Price"]);
  return {
    externalId: cleanText(r["Service ID"]),
    name,
    durationMinutes: dur.minutes,
    durationGuessed: !dur.ok,
    priceCents: price.cents,
    category: cleanText(r["Category Name"]),
    description: cleanText(r["Description"]),
  };
}

const STATUS_MAP: Record<string, BookingStatus> = {
  completed: "completed",
  cancelled: "cancelled",
  "no show": "no_show",
  confirmed: "confirmed",
  new: "pending",
};

export function mapApptStatus(raw: string | null): BookingStatus {
  const key = (raw ?? "").trim().toLowerCase();
  return STATUS_MAP[key] ?? "pending";
}

export type ParsedApptRow = {
  externalId: string;
  clientName: string;
  staffName: string;
  status: BookingStatus;
  serviceName: string;
  startsAt: Date | null;
  endsAt: Date | null;
  priceCents: number;
  createdAt: Date | null;
};

export function mapApptRow(raw: Record<string, string>): ParsedApptRow | null {
  const r = normalizeRow(raw);
  const externalId = r["Appt. ref."] ?? "";
  const clientName = r["Client"] ?? "";
  const staffName = r["Team member"] ?? "";
  const serviceName = r["Service"] ?? "";
  if (!externalId || !clientName || !staffName || !serviceName) return null;

  const scheduled = parseFreshaDateTime(r["Scheduled date"]);
  const slot = parseSlotTimes(r["Appt. slot"]);
  const dur = parseDuration(r["Duration (mins)"]);
  const times = resolveApptTimes(scheduled, slot, dur.minutes);
  const price = parsePrice(r["Net sales"]);

  return {
    externalId,
    clientName,
    staffName,
    status: mapApptStatus(r["Status"]),
    serviceName,
    startsAt: times?.startsAt ?? null,
    endsAt: times?.endsAt ?? null,
    priceCents: price.cents,
    createdAt: parseFreshaDateTime(r["Created date"]),
  };
}
