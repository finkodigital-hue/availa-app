// Turns a CSV file's actual column headers into our canonical field keys,
// either automatically (matched against schema.ts's alias lists) or via a
// manual override the owner sets in the column-mapping UI. Every entity
// mapper in fresha.ts consumes an already-remapped row keyed by these
// canonical names, so it stays free of any particular source system's
// column-naming quirks.
import { ENTITY_FIELDS, normalizeHeaderKey } from "./schema";
import type { ImportEntity } from "./fresha";

export type FieldMapping = Record<string, string | null>;

export type ImportSource = {
  id: string;
  name: string;
  detectedBy: "filename" | "columns";
};

const IMPORT_SOURCES = [
  {
    id: "fresha",
    name: "Fresha",
    filenames: ["fresha"],
    signals: [
      "appt ref",
      "scheduled date",
      "appt slot",
      "net sales",
      "team member",
    ],
  },
  {
    id: "booksy",
    name: "Booksy",
    filenames: ["booksy"],
    signals: [
      "booking number",
      "appointment date",
      "customer",
      "worker",
      "service",
    ],
  },
  {
    id: "vagaro",
    name: "Vagaro",
    filenames: ["vagaro"],
    signals: [
      "appointment id",
      "appointment status",
      "service provider",
      "customer name",
      "service",
    ],
  },
  {
    id: "square",
    name: "Square",
    filenames: ["square"],
    signals: [
      "appointment id",
      "customer id",
      "service variation",
      "team member",
      "start date",
    ],
  },
  {
    id: "timely",
    name: "Timely",
    filenames: ["timely"],
    signals: ["booking id", "client", "staff", "service", "start time"],
  },
  {
    id: "acuity",
    name: "Acuity / Squarespace",
    filenames: ["acuity", "squarespace"],
    signals: [
      "appointment type",
      "calendar",
      "datetime",
      "first name",
      "last name",
    ],
  },
  {
    id: "glossgenius",
    name: "GlossGenius",
    filenames: ["glossgenius", "gloss genius"],
    signals: [
      "appointment id",
      "client name",
      "staff name",
      "service name",
      "start time",
    ],
  },
  {
    id: "mindbody",
    name: "Mindbody",
    filenames: ["mindbody", "mind body"],
    signals: [
      "client id",
      "appointment id",
      "staff name",
      "service name",
      "start date",
    ],
  },
  {
    id: "simplybook",
    name: "SimplyBook.me",
    filenames: ["simplybook", "simply book"],
    signals: ["booking code", "client", "provider", "service", "start date"],
  },
  {
    id: "setmore",
    name: "Setmore",
    filenames: ["setmore"],
    signals: ["appointment id", "customer", "staff", "service", "start time"],
  },
] as const;

export function detectImportSource(
  fileName: string | null,
  headers: string[],
): ImportSource | null {
  const normalizedFileName = normalizeHeaderKey(fileName ?? "");
  const filenameMatch = IMPORT_SOURCES.find((source) =>
    source.filenames.some((part) => normalizedFileName.includes(part)),
  );
  if (filenameMatch) {
    return {
      id: filenameMatch.id,
      name: filenameMatch.name,
      detectedBy: "filename",
    };
  }

  const normalizedHeaders = new Set(headers.map(normalizeHeaderKey));
  const ranked = IMPORT_SOURCES.map((source) => ({
    source,
    score: source.signals.filter((signal) =>
      normalizedHeaders.has(normalizeHeaderKey(signal)),
    ).length,
  })).sort((a, b) => b.score - a.score);

  // Three exact source-specific column signals is deliberately conservative:
  // a generic CSV with columns such as Name and Email should not be branded as
  // an export from a particular competitor.
  if (!ranked[0] || ranked[0].score < 3 || ranked[0].score === ranked[1]?.score)
    return null;
  return {
    id: ranked[0].source.id,
    name: ranked[0].source.name,
    detectedBy: "columns",
  };
}

export function autoMapHeaders(
  headers: string[],
  entity: ImportEntity,
): FieldMapping {
  const available = headers.map((h) => ({
    raw: h,
    norm: normalizeHeaderKey(h),
  }));
  const mapping: FieldMapping = {};
  for (const field of ENTITY_FIELDS[entity]) {
    const aliases = field.aliases.map(normalizeHeaderKey);
    const hit = available.find((h) => aliases.includes(h.norm));
    mapping[field.key] = hit ? hit.raw : null;
  }
  return mapping;
}

export function applyMapping(
  raw: Record<string, string>,
  mapping: FieldMapping,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, header] of Object.entries(mapping)) {
    out[key] = header ? (raw[header] ?? "").toString().trim() : "";
  }
  return out;
}

export function missingRequiredFields(
  entity: ImportEntity,
  mapping: FieldMapping,
): string[] {
  return ENTITY_FIELDS[entity]
    .filter((f) => f.required && !mapping[f.key])
    .map((f) => f.label);
}

// Staff and customer rows have no single required "name" field — either a
// full-name column or a first-name column must be mapped for a row to have
// a derivable name at all (mapStaffRow/mapCustomerRow fall back from one to
// the other). Checked separately from missingRequiredFields since it's an
// either/or requirement, not a straight required field.
export function hasUsableNameMapping(mapping: FieldMapping): boolean {
  return !!mapping.fullName || !!mapping.firstName;
}
