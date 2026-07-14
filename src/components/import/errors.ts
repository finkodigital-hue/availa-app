// Translates Supabase/Postgres errors into plain language — an owner
// uploading a spreadsheet should never see a raw constraint-violation message.
export function describeImportError(e: unknown): string {
  const err = e as { code?: string; message?: string } | undefined;
  if (err?.code === "23505") return "Some of this data already exists and couldn't be added again.";
  if (err?.code === "23503") {
    return "This couldn't be saved because related data is missing — try importing Team, Clients, and Services first.";
  }
  const msg = err?.message ?? String(e);
  if (typeof msg === "string" && msg.length > 0 && msg.length < 160 && !/^\{|^Error:/.test(msg))
    return msg;
  return "Something went wrong while importing. Please try again.";
}
