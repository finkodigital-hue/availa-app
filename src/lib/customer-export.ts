type ExportPage<T> = { data: T[] | null; error: unknown };
type ExportQuery<T> = PromiseLike<ExportPage<T>> & {
  order(column: string, options: { ascending: boolean }): ExportQuery<T>;
  limit(count: number): ExportQuery<T>;
  gt(column: string, value: string): ExportQuery<T>;
};

/** Keyset pagination avoids PostgREST's default row cap and large offsets.
 * Keep tenant/customer predicates inside makeQuery so every page is scoped.
 * An empty page, not a short one, establishes completion if the provider has
 * configured a lower cap. Fail closed if a gateway repeats/ignores the cursor.
 */
export async function fetchCustomerExportRows<T extends { id: string }>(
  makeQuery: () => ExportQuery<T>,
): Promise<T[]> {
  const rows: T[] = [];
  let after: string | null = null;
  for (;;) {
    let query = makeQuery().order("id", { ascending: true }).limit(200);
    if (after) query = query.gt("id", after);
    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) return rows;
    for (const row of data) {
      if (!row.id || (after && row.id <= after)) {
        throw new Error(
          "The customer export could not read a complete page. Please retry.",
        );
      }
      after = row.id;
      rows.push(row);
    }
    // Do not silently claim success for an export too large for this synchronous
    // endpoint. The request remains pending for a separately arranged export.
    if (rows.length > 100_000) {
      throw new Error(
        "This customer export is too large to download here. Contact support; the request remains pending.",
      );
    }
  }
}
