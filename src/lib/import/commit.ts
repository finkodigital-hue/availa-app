// Writes parsed Fresha rows to the database: creates an import_batches
// record, inserts in chunks, tags every row with import_batch_id, and
// de-duplicates against both the rest of the file and what's already in the
// business. Kept free of React — the wizard route calls these directly.
import { supabase } from "@/integrations/supabase/client";
import { normalizeName, phoneDigits } from "./parse";
import { NameIndex } from "./matching";
import type { ParsedApptRow, ParsedCustomerRow, ParsedServiceRow, ParsedStaffRow } from "./fresha";
import type { ImportEntity } from "./fresha";

const CHUNK_SIZE = 500;
const PAGE_SIZE = 1000;

// PostgREST caps an unbounded `.select()` at 1000 rows by default — a
// business with more than 1000 customers (very much the normal case after a
// real import) would silently lose the rest to duplicate-detection and
// name-matching. Page through everything instead.
export async function fetchAllRows<T>(
  table: "staff" | "customers" | "services" | "bookings",
  columns: string,
  businessId: string,
  extra?: (q: any) => any, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let q = supabase.from(table).select(columns).eq("business_id", businessId);
    if (extra) q = extra(q);
    const { data, error } = await q.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return out;
}

async function insertChunked<T extends Record<string, unknown>>(
  table: "staff" | "customers" | "services" | "bookings",
  rows: T[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    // `table` is a union of table names with different Insert shapes, which
    // Supabase's generated types can't resolve generically.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from(table).insert(chunk as any);
    if (error) throw error;
    onProgress?.(Math.min(i + CHUNK_SIZE, rows.length), rows.length);
  }
}

export type ExistingBatch = {
  id: string;
  source_filename: string;
  created_at: string;
  row_count: number;
  status: string;
};

export async function findExistingBatchByHash(
  businessId: string,
  fileHash: string,
): Promise<ExistingBatch | null> {
  const { data, error } = await supabase
    .from("import_batches")
    .select("id, source_filename, created_at, row_count, status")
    .eq("business_id", businessId)
    .eq("file_hash", fileHash)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function createBatch(params: {
  businessId: string;
  sessionId: string;
  entityType: ImportEntity;
  filename: string;
  fileHash: string;
  rowCount: number;
  createdBy: string | null;
}) {
  const { data, error } = await supabase
    .from("import_batches")
    .insert({
      business_id: params.businessId,
      session_id: params.sessionId,
      entity_type: params.entityType,
      source_filename: params.filename,
      file_hash: params.fileHash,
      row_count: params.rowCount,
      created_by: params.createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function finishBatch(
  batchId: string,
  counts: { imported: number; skipped: number; duplicate: number },
) {
  const { error } = await supabase
    .from("import_batches")
    .update({
      imported_count: counts.imported,
      skipped_count: counts.skipped,
      duplicate_count: counts.duplicate,
    })
    .eq("id", batchId);
  if (error) throw error;
}

export type CommitResult = {
  batchId: string;
  imported: number;
  duplicate: number;
  skipped: number;
};

export async function commitStaff(params: {
  businessId: string;
  sessionId: string;
  filename: string;
  fileHash: string;
  totalRows: number;
  skippedNoName: number;
  rows: (ParsedStaffRow & { active: boolean })[];
  createdBy: string | null;
}): Promise<CommitResult> {
  const batch = await createBatch({
    businessId: params.businessId,
    sessionId: params.sessionId,
    entityType: "staff",
    filename: params.filename,
    fileHash: params.fileHash,
    rowCount: params.totalRows,
    createdBy: params.createdBy,
  });

  const existing = await fetchAllRows<{ name: string }>("staff", "name", params.businessId);
  const existingNames = new Set(existing.map((s) => normalizeName(s.name)));

  const seen = new Set<string>();
  let duplicate = 0;
  const toInsert: Record<string, unknown>[] = [];
  for (const r of params.rows) {
    const key = normalizeName(r.name);
    if (existingNames.has(key) || seen.has(key)) {
      duplicate++;
      continue;
    }
    seen.add(key);
    toInsert.push({
      business_id: params.businessId,
      name: r.name,
      email: r.email,
      phone: r.phone,
      role: r.role,
      active: r.active,
      bookable: r.active,
      import_batch_id: batch.id,
    });
  }

  await insertChunked("staff", toInsert);
  const result = { imported: toInsert.length, skipped: params.skippedNoName, duplicate };
  await finishBatch(batch.id, result);
  return { batchId: batch.id, ...result };
}

export async function commitCustomers(params: {
  businessId: string;
  sessionId: string;
  filename: string;
  fileHash: string;
  totalRows: number;
  skippedNoName: number;
  mergedWithinFile: number;
  rows: ParsedCustomerRow[];
  createdBy: string | null;
  onProgress?: (done: number, total: number) => void;
}): Promise<CommitResult> {
  const batch = await createBatch({
    businessId: params.businessId,
    sessionId: params.sessionId,
    entityType: "customers",
    filename: params.filename,
    fileHash: params.fileHash,
    rowCount: params.totalRows,
    createdBy: params.createdBy,
  });

  const existing = await fetchAllRows<{ email: string | null; phone_normalized: string | null; external_id: string | null }>(
    "customers",
    "email, phone_normalized, external_id",
    params.businessId,
  );
  const existingEmails = new Set(existing.map((c) => (c.email ?? "").trim().toLowerCase()).filter(Boolean));
  const existingPhones = new Set(existing.map((c) => c.phone_normalized).filter(Boolean));
  const existingExternalIds = new Set(existing.map((c) => c.external_id).filter(Boolean));

  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();
  const seenExternalIds = new Set<string>();
  let duplicate = params.mergedWithinFile;
  const toInsert: Record<string, unknown>[] = [];
  for (const r of params.rows) {
    if (existingExternalIds.has(r.externalId) || seenExternalIds.has(r.externalId)) {
      duplicate++;
      continue;
    }
    seenExternalIds.add(r.externalId);
    const emailLower = r.email ? r.email.toLowerCase() : "";
    const phoneNorm = phoneDigits(r.phone) ?? "";
    const isDupe =
      (emailLower && (existingEmails.has(emailLower) || seenEmails.has(emailLower))) ||
      (phoneNorm && (existingPhones.has(phoneNorm) || seenPhones.has(phoneNorm)));
    if (isDupe) {
      duplicate++;
      continue;
    }
    if (emailLower) seenEmails.add(emailLower);
    if (phoneNorm) seenPhones.add(phoneNorm);
    toInsert.push({
      business_id: params.businessId,
      external_id: r.externalId,
      name: r.name,
      email: r.email,
      phone: r.phone,
      notes: r.notes,
      import_batch_id: batch.id,
    });
  }

  await insertChunked("customers", toInsert, params.onProgress);
  const result = { imported: toInsert.length, skipped: params.skippedNoName, duplicate };
  await finishBatch(batch.id, result);
  return { batchId: batch.id, ...result };
}

export async function commitServices(params: {
  businessId: string;
  sessionId: string;
  filename: string;
  fileHash: string;
  totalRows: number;
  skippedNoName: number;
  rows: ParsedServiceRow[];
  createdBy: string | null;
}): Promise<CommitResult> {
  const batch = await createBatch({
    businessId: params.businessId,
    sessionId: params.sessionId,
    entityType: "services",
    filename: params.filename,
    fileHash: params.fileHash,
    rowCount: params.totalRows,
    createdBy: params.createdBy,
  });

  const existing = await fetchAllRows<{ name: string; external_id: string | null }>(
    "services",
    "name, external_id",
    params.businessId,
  );
  const existingNames = new Set(existing.map((s) => normalizeName(s.name)));
  const existingExternalIds = new Set(existing.map((s) => s.external_id).filter(Boolean));

  const seen = new Set<string>();
  const seenExternalIds = new Set<string>();
  let duplicate = 0;
  const toInsert: Record<string, unknown>[] = [];
  for (const r of params.rows) {
    if (r.externalId && existingExternalIds.has(r.externalId)) {
      duplicate++;
      continue;
    }
    const key = normalizeName(r.name);
    if (existingNames.has(key) || seen.has(key)) {
      duplicate++;
      continue;
    }
    seen.add(key);
    // Fresha reuses one Service ID across size/pack variants of a service
    // (e.g. "Hair extensions - 1 pack" / "- 2 packs" / ...) — these are
    // genuinely distinct services with different names, so keep the row but
    // only credit the ID to whichever one we saw first, since it can't
    // uniquely identify either after that.
    const externalId = r.externalId && !seenExternalIds.has(r.externalId) ? r.externalId : null;
    if (r.externalId) seenExternalIds.add(r.externalId);
    toInsert.push({
      business_id: params.businessId,
      external_id: externalId,
      name: r.name,
      duration_minutes: r.durationMinutes,
      price_cents: r.priceCents,
      category: r.category,
      description: r.description,
      active: true,
      import_batch_id: batch.id,
    });
  }

  await insertChunked("services", toInsert);
  const result = { imported: toInsert.length, skipped: params.skippedNoName, duplicate };
  await finishBatch(batch.id, result);
  return { batchId: batch.id, ...result };
}

export type ApptCommitResult = CommitResult & {
  placeholderStaffCreated: number;
  placeholderServicesCreated: number;
  linkedToCustomer: number;
  linkedToService: number;
};

export async function commitAppointments(params: {
  businessId: string;
  sessionId: string;
  filename: string;
  fileHash: string;
  totalRows: number;
  skippedInvalid: number;
  rows: ParsedApptRow[];
  createdBy: string | null;
  onProgress?: (done: number, total: number) => void;
}): Promise<ApptCommitResult> {
  const batch = await createBatch({
    businessId: params.businessId,
    sessionId: params.sessionId,
    entityType: "bookings",
    filename: params.filename,
    fileHash: params.fileHash,
    rowCount: params.totalRows,
    createdBy: params.createdBy,
  });

  const [staffRows, custRows, svcRows, bookingRows] = await Promise.all([
    fetchAllRows<{ id: string; name: string }>("staff", "id, name", params.businessId),
    fetchAllRows<{ id: string; name: string }>("customers", "id, name", params.businessId),
    fetchAllRows<{ id: string; name: string }>("services", "id, name", params.businessId),
    fetchAllRows<{ external_id: string | null }>("bookings", "external_id", params.businessId, (q) =>
      q.not("external_id", "is", null),
    ),
  ]);

  const staffIndex = new NameIndex(staffRows);
  const custIndex = new NameIndex(custRows);
  const serviceByName = new Map<string, { id: string; name: string }>();
  for (const s of svcRows) {
    const key = normalizeName(s.name);
    if (!serviceByName.has(key)) serviceByName.set(key, s);
  }
  const existingExternalIds = new Set(bookingRows.map((b) => b.external_id).filter(Boolean));

  // Placeholder staff for team members mentioned in appointment history but
  // absent from the staff file — inactive by default so they never appear as
  // bookable for new appointments; the owner can review/rename them later.
  const newPlaceholderStaff: {
    name: string;
    import_batch_id: string;
    business_id: string;
    active: boolean;
    bookable: boolean;
    role: string;
  }[] = [];
  const placeholderNamesSeen = new Set<string>();
  for (const r of params.rows) {
    const key = normalizeName(r.staffName);
    if (staffIndex.lookupFirst(r.staffName)) continue;
    if (placeholderNamesSeen.has(key)) continue;
    placeholderNamesSeen.add(key);
    newPlaceholderStaff.push({
      business_id: params.businessId,
      name: r.staffName,
      role: "Imported from Fresha",
      active: false,
      bookable: false,
      import_batch_id: batch.id,
    });
  }
  if (newPlaceholderStaff.length > 0) {
    const { data: created, error: createErr } = await supabase
      .from("staff")
      .insert(newPlaceholderStaff)
      .select("id, name");
    if (createErr) throw createErr;
    for (const s of created ?? []) staffIndex.add(s);
  }

  // Every non-custom booking requires a service_id (DB constraint) — a
  // service name that's since been renamed or retired in Fresha still needs
  // a real row to point to. Auto-create one (inactive, so it never appears
  // as choosable for new bookings) the first time each such name is seen,
  // using that occurrence's price and duration as a best guess.
  const newPlaceholderServices: {
    business_id: string;
    name: string;
    duration_minutes: number;
    price_cents: number;
    active: boolean;
    import_batch_id: string;
  }[] = [];
  const placeholderServiceNamesSeen = new Set<string>();
  for (const r of params.rows) {
    const key = normalizeName(r.serviceName);
    if (serviceByName.has(key) || placeholderServiceNamesSeen.has(key)) continue;
    placeholderServiceNamesSeen.add(key);
    const durationMinutes =
      r.startsAt && r.endsAt ? Math.max(5, Math.round((r.endsAt.getTime() - r.startsAt.getTime()) / 60000)) : 60;
    newPlaceholderServices.push({
      business_id: params.businessId,
      name: r.serviceName,
      duration_minutes: durationMinutes,
      price_cents: r.priceCents,
      active: false,
      import_batch_id: batch.id,
    });
  }
  if (newPlaceholderServices.length > 0) {
    const { data: created, error: createErr } = await supabase
      .from("services")
      .insert(newPlaceholderServices)
      .select("id, name");
    if (createErr) throw createErr;
    for (const s of created ?? []) serviceByName.set(normalizeName(s.name), s);
  }

  let duplicate = 0;
  let unparsedDates = 0;
  let linkedToCustomer = 0;
  let linkedToService = 0;
  const seenExternalIds = new Set<string>();
  const toInsert: Record<string, unknown>[] = [];
  for (const r of params.rows) {
    if (existingExternalIds.has(r.externalId) || seenExternalIds.has(r.externalId)) {
      duplicate++;
      continue;
    }
    seenExternalIds.add(r.externalId);
    if (!r.startsAt || !r.endsAt) {
      unparsedDates++;
      continue;
    }
    const staff = staffIndex.lookupFirst(r.staffName);
    if (!staff) {
      unparsedDates++;
      continue; // should be unreachable — placeholders cover every name
    }
    const service = serviceByName.get(normalizeName(r.serviceName));
    if (!service) {
      unparsedDates++;
      continue; // should be unreachable — placeholders cover every name
    }
    const customer = custIndex.lookupUnique(r.clientName);
    if (customer) linkedToCustomer++;
    linkedToService++;

    const isPaid = r.status === "completed";
    toInsert.push({
      business_id: params.businessId,
      external_id: r.externalId,
      staff_id: staff.id,
      service_id: service.id,
      customer_id: customer?.id ?? null,
      customer_name: r.clientName,
      starts_at: r.startsAt.toISOString(),
      ends_at: r.endsAt.toISOString(),
      status: r.status,
      price_cents: r.priceCents,
      amount_due_cents: r.priceCents,
      amount_paid_cents: isPaid ? r.priceCents : 0,
      payment_status: isPaid ? "paid" : "unpaid",
      source: "manual",
      notify_customer: false,
      // Pre-claimed so the confirmation-email sweep backstop can never pick
      // these up — created_at isn't a reliable guard here (it reflects
      // import time, not the historical appointment date), so we suppress
      // the confirmation outright rather than relying on a time window.
      confirmation_sent_at: new Date().toISOString(),
      created_at: r.createdAt ? r.createdAt.toISOString() : undefined,
      import_batch_id: batch.id,
    });
  }

  await insertChunked("bookings", toInsert, params.onProgress);
  const result = {
    imported: toInsert.length,
    skipped: params.skippedInvalid + unparsedDates,
    duplicate,
  };
  await finishBatch(batch.id, result);
  return {
    batchId: batch.id,
    ...result,
    placeholderStaffCreated: newPlaceholderStaff.length,
    placeholderServicesCreated: newPlaceholderServices.length,
    linkedToCustomer,
    linkedToService,
  };
}

export async function listImportBatches(businessId: string) {
  const { data, error } = await supabase
    .from("import_batches")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// Deletes everything tagged with this batch (bookings before staff/customers/
// services, to respect FK ordering) and marks the batch rolled back. If other
// data still references a row from this batch (e.g. a manually-created
// booking against an imported customer), the delete is blocked by the
// database — surfaced as a friendly error rather than a raw Postgres one.
export async function rollbackBatch(batchId: string, businessId: string): Promise<void> {
  const { error: bookingsErr } = await supabase
    .from("bookings")
    .delete()
    .eq("import_batch_id", batchId)
    .eq("business_id", businessId);
  if (bookingsErr) throw friendlyRollbackError(bookingsErr);

  for (const table of ["customers", "services", "staff"] as const) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq("import_batch_id", batchId)
      .eq("business_id", businessId);
    if (error) throw friendlyRollbackError(error);
  }

  const { error } = await supabase
    .from("import_batches")
    .update({ status: "rolled_back", rolled_back_at: new Date().toISOString() })
    .eq("id", batchId);
  if (error) throw error;
}

function friendlyRollbackError(error: { code?: string; message: string }): Error {
  if (error.code === "23503") {
    return new Error(
      "Can't undo this import yet — some of this data still has other things linked to it (for example, a booking created after the import). Undo any later imports first.",
    );
  }
  return new Error(error.message);
}
