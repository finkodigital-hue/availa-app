// Name-based matching (customers/staff have no shared key across Fresha's
// separate exports — only the appointment file's plain-text name column) and
// within-file duplicate-client merging.
import { normalizeName, phoneDigits } from "./parse";
import type { ParsedCustomerRow } from "./fresha";

export function dedupeCustomerRows(rows: ParsedCustomerRow[]): {
  rows: ParsedCustomerRow[];
  mergedCount: number;
} {
  const byKey = new Map<string, ParsedCustomerRow>();
  const out: ParsedCustomerRow[] = [];
  let mergedCount = 0;
  for (const row of rows) {
    const digits = phoneDigits(row.phone);
    const key = digits ? `${normalizeName(row.name)}|${digits}` : null;
    const existing = key ? byKey.get(key) : undefined;
    if (existing) {
      mergedCount++;
      existing.email = existing.email ?? row.email;
      existing.notes = [existing.notes, row.notes].filter(Boolean).join("\n") || null;
      continue;
    }
    out.push(row);
    if (key) byKey.set(key, row);
  }
  return { rows: out, mergedCount };
}

// A one-to-many name index — ambiguous when a normalized name maps to more
// than one id, in which case callers should not guess.
export class NameIndex<T extends { id: string; name: string }> {
  private byName = new Map<string, T[]>();

  constructor(items: T[]) {
    for (const item of items) {
      const key = normalizeName(item.name);
      if (!key) continue;
      const arr = this.byName.get(key);
      if (arr) arr.push(item);
      else this.byName.set(key, [item]);
    }
  }

  add(item: T) {
    const key = normalizeName(item.name);
    if (!key) return;
    const arr = this.byName.get(key);
    if (arr) arr.push(item);
    else this.byName.set(key, [item]);
  }

  // Returns the single match, or null if there's no match or more than one.
  lookupUnique(name: string): T | null {
    const arr = this.byName.get(normalizeName(name));
    if (!arr || arr.length !== 1) return null;
    return arr[0];
  }

  // Returns the first match regardless of ambiguity — used only where a
  // non-null result is mandatory (e.g. bookings.staff_id).
  lookupFirst(name: string): T | null {
    const arr = this.byName.get(normalizeName(name));
    return arr?.[0] ?? null;
  }

  isAmbiguous(name: string): boolean {
    const arr = this.byName.get(normalizeName(name));
    return !!arr && arr.length > 1;
  }
}
