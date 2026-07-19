// Turns a CSV file's actual column headers into our canonical field keys,
// either automatically (matched against schema.ts's alias lists) or via a
// manual override the owner sets in the column-mapping UI. Every entity
// mapper in fresha.ts consumes an already-remapped row keyed by these
// canonical names, so it stays free of any particular source system's
// column-naming quirks.
import { ENTITY_FIELDS, normalizeHeaderKey } from "./schema";
import type { ImportEntity } from "./fresha";

export type FieldMapping = Record<string, string | null>;

export function autoMapHeaders(headers: string[], entity: ImportEntity): FieldMapping {
  const available = headers.map((h) => ({ raw: h, norm: normalizeHeaderKey(h) }));
  const mapping: FieldMapping = {};
  for (const field of ENTITY_FIELDS[entity]) {
    const hit = available.find((h) => field.aliases.includes(h.norm));
    mapping[field.key] = hit ? hit.raw : null;
  }
  return mapping;
}

export function applyMapping(raw: Record<string, string>, mapping: FieldMapping): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, header] of Object.entries(mapping)) {
    out[key] = header ? (raw[header] ?? "").toString().trim() : "";
  }
  return out;
}

export function missingRequiredFields(entity: ImportEntity, mapping: FieldMapping): string[] {
  return ENTITY_FIELDS[entity].filter((f) => f.required && !mapping[f.key]).map((f) => f.label);
}

// Staff and customer rows have no single required "name" field — either a
// full-name column or a first-name column must be mapped for a row to have
// a derivable name at all (mapStaffRow/mapCustomerRow fall back from one to
// the other). Checked separately from missingRequiredFields since it's an
// either/or requirement, not a straight required field.
export function hasUsableNameMapping(mapping: FieldMapping): boolean {
  return !!mapping.fullName || !!mapping.firstName;
}
