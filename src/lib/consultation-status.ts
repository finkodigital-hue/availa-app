export type RecordStatus = {
  status: string;
  expires_at?: string | null;
  patch_test_outcome?: string | null;
  consultation_templates?:
    | { kind?: string; name?: string }
    | { kind?: string; name?: string }[]
    | null;
  template_snapshot?: { kind?: string; name?: string; id?: string } | null;
};

/** A recorded result is not a clinical clearance for a future treatment. */
export function consultationStatus(row: RecordStatus, now = Date.now()) {
  if (row.status === "withdrawn")
    return { label: "Consent withdrawn", attention: true };
  if (
    row.status === "expired" ||
    (row.expires_at && Date.parse(row.expires_at) <= now)
  ) {
    return { label: "Expired", attention: true };
  }
  if (row.status !== "signed")
    return { label: "Signature needed", attention: true };
  const template = Array.isArray(row.consultation_templates)
    ? row.consultation_templates[0]
    : row.consultation_templates;
  if ((template?.kind ?? row.template_snapshot?.kind) === "patch_test") {
    if (row.patch_test_outcome === "passed")
      return { label: "Pass recorded", attention: false };
    if (row.patch_test_outcome === "failed")
      return { label: "Failed", attention: true };
    if (row.patch_test_outcome === "retest_required")
      return { label: "Retest required", attention: true };
    return { label: "Result needed", attention: true };
  }
  return { label: "Signed", attention: false };
}
