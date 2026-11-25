export type CustomerContact = {
  name: string;
  email: string | null;
  phone: string | null;
};

/** Search text is literal: punctuation and SQL wildcards are customer data. */
export function customerMatchesSearch(
  customer: CustomerContact,
  search: string,
) {
  const term = search.trim().toLocaleLowerCase("en-GB");
  return (
    !term ||
    [customer.name, customer.email, customer.phone].some((value) =>
      value?.toLocaleLowerCase("en-GB").includes(term),
    )
  );
}

/** Stop only at an empty page so a smaller gateway cap cannot hide customers.
 * The caller supplies a stable unique order and tenant filter on every page.
 */
export async function collectCustomerPages<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await fetchPage(rows.length, rows.length + 499);
    if (error) throw error;
    if (!data)
      throw new Error(
        "Could not read the complete customer list. Please try again.",
      );
    if (!data.length) return rows;
    rows.push(...data);
    if (rows.length > 100_000)
      throw new Error(
        "This customer list is too large to load here. Please contact support.",
      );
  }
}
