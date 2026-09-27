// Turns a normalized, canonical-keyed row (produced by mapping.ts's
// applyMapping, from whatever CSV columns the owner's booking system export
// used) into the shape each entity needs. Free of any particular source
// system's column names — Fresha is simply the system whose exports we
// recognise out of the box (see schema.ts's aliases).
import type { BookingStatus } from "@/lib/format";
import {
  cleanPhoneDisplay,
  cleanText,
  parseDuration,
  parseGenericDateTime,
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

// Some booking systems export a literal placeholder string instead of
// leaving the name blank when the owner never got around to naming a
// walk-in/guest client (Fresha does this with "Change client name"). If we
// import that verbatim it shows up as if it were a real customer's name.
const PLACEHOLDER_NAME_RE =
  /^(change (client|customer) name|unnamed (client|customer))$/i;

function fullNameOf(r: Record<string, string>): string {
  const raw = r.fullName || `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim();
  return PLACEHOLDER_NAME_RE.test(raw.trim()) ? "Unnamed client" : raw;
}

export type ParsedStaffRow = {
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  sourceStatus: string | null;
};

export function mapStaffRow(r: Record<string, string>): ParsedStaffRow | null {
  const name = fullNameOf(r);
  if (!name) return null;
  return {
    name,
    email: cleanText(r.email),
    phone: cleanPhoneDisplay(r.phone),
    role: cleanText(r.role),
    sourceStatus: cleanText(r.status),
  };
}

export type ParsedCustomerRow = {
  externalId: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

export function mapCustomerRow(
  r: Record<string, string>,
): ParsedCustomerRow | null {
  const name = fullNameOf(r);
  if (!name) return null;
  const phone = cleanPhoneDisplay(r.phone);
  const referral = cleanText(r.referralSource);
  const note = cleanText(r.notes);
  const notes =
    [note, referral ? `Referral source: ${referral}` : null]
      .filter(Boolean)
      .join("\n") || null;
  // Not every system exports a client ID. Dedup keys off external_id further
  // down the pipeline, so a missing one is synthesized per-row rather than
  // left blank — otherwise every no-ID row would collide as "duplicates" of
  // each other and only the first would import.
  const externalId = cleanText(r.externalId) ?? `row:${crypto.randomUUID()}`;
  return { externalId, name, email: cleanText(r.email), phone, notes };
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

export function mapServiceRow(
  r: Record<string, string>,
): ParsedServiceRow | null {
  const name = cleanText(r.name);
  if (!name) return null;
  const dur = parseDuration(r.duration);
  const price = parsePrice(r.price);
  return {
    externalId: cleanText(r.externalId),
    name,
    durationMinutes: dur.minutes,
    durationGuessed: !dur.ok,
    priceCents: price.cents,
    category: cleanText(r.category),
    description: cleanText(r.description),
  };
}

// Bookzenvo uses four appointment states. Unknown values still map to
// confirmed for compatibility, but the import UI must warn before saving.
const STATUS_MAP: Record<string, BookingStatus> = {
  completed: "completed",
  complete: "completed",
  finished: "completed",
  cancelled: "cancelled",
  canceled: "cancelled",
  "no show": "no_show",
  "no showed": "no_show",
  confirmed: "confirmed",
  booked: "confirmed",
  scheduled: "confirmed",
  new: "confirmed",
};

function statusKey(raw: string | null): string {
  return (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function isRecognizedApptStatus(raw: string | null): boolean {
  return Object.hasOwn(STATUS_MAP, statusKey(raw));
}

export function mapApptStatus(raw: string | null): BookingStatus {
  return STATUS_MAP[statusKey(raw)] ?? "confirmed";
}

export type ParsedApptRow = {
  externalId: string;
  clientName: string;
  staffName: string;
  status: BookingStatus;
  sourceStatus: string | null;
  statusRecognized: boolean;
  serviceName: string;
  startsAt: Date | null;
  endsAt: Date | null;
  priceCents: number;
  createdAt: Date | null;
};

export function mapApptRow(
  r: Record<string, string>,
  rowIndex = 0,
  fileHash: string | null = null,
): ParsedApptRow | null {
  const clientName = r.clientName ?? "";
  const staffName = r.staffName ?? "";
  const serviceName = r.serviceName ?? "";
  if (!clientName || !staffName || !serviceName) return null;

  const scheduled = parseGenericDateTime(r.scheduledDate);
  const slot = parseSlotTimes(r.apptSlot);
  const explicitEnd = parseGenericDateTime(r.endDateTime);
  const dur = parseDuration(r.duration);
  const times = resolveApptTimes(scheduled, slot, explicitEnd, dur.minutes);
  const price = parsePrice(r.price);
  // Keep no-ID bookings distinct within a file and stable across re-uploads,
  // so the owner can verify the same export later without a false "missing".
  const externalId =
    cleanText(r.externalId) ??
    (fileHash ? `file:${fileHash}:${rowIndex}` : `row:${crypto.randomUUID()}`);

  return {
    externalId,
    clientName,
    staffName,
    status: mapApptStatus(r.status),
    sourceStatus: cleanText(r.status),
    statusRecognized: isRecognizedApptStatus(r.status),
    serviceName,
    startsAt: times?.startsAt ?? null,
    endsAt: times?.endsAt ?? null,
    priceCents: price.cents,
    createdAt: parseGenericDateTime(r.createdDate),
  };
}
