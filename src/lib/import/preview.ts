import { NameIndex } from "./matching";
import { normalizeName } from "./parse";
import type { ParsedApptRow } from "./fresha";
import type { BookingStatus } from "@/lib/format";

export type ApptPreviewStats = {
  statusCounts: Partial<Record<BookingStatus, number>>;
  linkedToCustomer: number;
  ambiguousCustomer: number;
  unmatchedCustomer: number;
  linkedToService: number;
  newPlaceholderServiceNames: string[];
  newPlaceholderStaffNames: string[];
};

export function computeApptPreview(
  rows: ParsedApptRow[],
  staff: { id: string; name: string }[],
  customers: { id: string; name: string }[],
  services: { id: string; name: string }[],
): ApptPreviewStats {
  const staffIndex = new NameIndex(staff);
  const custIndex = new NameIndex(customers);
  const svcNames = new Set(services.map((s) => normalizeName(s.name)));

  const statusCounts: Partial<Record<BookingStatus, number>> = {};
  let linkedToCustomer = 0;
  let ambiguousCustomer = 0;
  let unmatchedCustomer = 0;
  let linkedToService = 0;
  const placeholderStaffNames = new Set<string>();
  const placeholderServiceNames = new Set<string>();

  for (const r of rows) {
    statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
    if (!staffIndex.lookupFirst(r.staffName)) placeholderStaffNames.add(r.staffName);
    if (custIndex.lookupUnique(r.clientName)) linkedToCustomer++;
    else if (custIndex.isAmbiguous(r.clientName)) ambiguousCustomer++;
    else unmatchedCustomer++;
    if (svcNames.has(normalizeName(r.serviceName))) linkedToService++;
    else placeholderServiceNames.add(r.serviceName);
  }

  return {
    statusCounts,
    linkedToCustomer,
    ambiguousCustomer,
    unmatchedCustomer,
    linkedToService,
    newPlaceholderServiceNames: [...placeholderServiceNames],
    newPlaceholderStaffNames: [...placeholderStaffNames],
  };
}
