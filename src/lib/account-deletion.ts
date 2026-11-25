export type AccountDeletionRequest = {
  id: string;
  status: "requested" | "in_review" | "cancelled" | "completed";
  requested_at: string;
  review_due_at: string;
  completion_target_at: string;
  review_started_at: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
  confirmation_sent_at: string | null;
  status_message: string | null;
  retained_data_summary: string | null;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function exactFields(
  input: unknown,
  fields: string[],
): Record<string, unknown> {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).length !== fields.length ||
    Object.keys(input).some((key) => !fields.includes(key))
  ) {
    throw new Error("Invalid account request. Refresh and try again.");
  }
  return input as Record<string, unknown>;
}

export function validateAccountDeletionRequest(input: unknown) {
  const data = exactFields(input, ["confirmation", "requestKey"]);
  if (data.confirmation !== "DELETE")
    throw new Error("Type DELETE to confirm.");
  if (typeof data.requestKey !== "string" || !UUID.test(data.requestKey))
    throw new Error("Invalid request reference. Refresh and try again.");
  return { confirmation: "DELETE" as const, requestKey: data.requestKey };
}

export function validateAccountDeletionCancellation(input: unknown) {
  const data = exactFields(input, ["requestId"]);
  if (typeof data.requestId !== "string" || !UUID.test(data.requestId))
    throw new Error("Invalid request reference. Refresh and try again.");
  return { requestId: data.requestId };
}
