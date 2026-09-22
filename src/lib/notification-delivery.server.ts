export class DeliveryDeferredError extends Error {}
export class DeliveryReviewError extends Error {}
export class ProviderDeliveryError extends Error {
  retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.retryable = retryable;
  }
}

export async function markBookingNotification(database: any, bookingId: string,
  column: "confirmation_sent_at" | "reminder_sent_at" | "review_request_sent_at" | "aftercare_sent_at" | "rebooking_reminder_sent_at",
  startsAt?: string) {
  let query = database.from("bookings").update({ [column]: new Date().toISOString() }).eq("id", bookingId).is(column, null);
  if (startsAt) query = query.eq("starts_at", startsAt);
  const { error } = await query;
  if (error) throw new DeliveryDeferredError("Delivery recorded; booking marker update will retry");
}

/** A database lease serializes sends. Email retries reuse the exact original
 * request within the provider's 24-hour idempotency window. Ambiguous SMS
 * requests require provider reconciliation instead of automatic resubmission. */
export async function deliverNotification({ database, deliveryId, channel, payload, send }: {
  database: any;
  deliveryId: string;
  channel: "email" | "sms";
  payload: Record<string, unknown>;
  send: (snapshot: any) => Promise<string>;
}): Promise<string | undefined> {
  const { data: claim, error } = await database.rpc("claim_notification_delivery", {
    p_id: deliveryId, p_payload: payload,
  });
  if (error || !claim) throw new Error("Could not claim notification delivery");
  if (claim.state === "complete") return claim.provider_message_id ?? undefined;
  if (claim.state === "review") throw new DeliveryReviewError("Delivery requires provider review");
  if (claim.state !== "claimed") throw new DeliveryDeferredError("Delivery is in progress or waiting to retry");
  let providerId: string;
  try {
    providerId = await send(claim.payload);
    if (!providerId) throw new Error("Provider did not return a message identifier");
  } catch (cause) {
    const retryable = cause instanceof ProviderDeliveryError ? cause.retryable : channel === "email";
    // Never persist provider response bodies, recipient addresses or message content.
    const message = retryable ? "Provider request failed; retry scheduled" : "Provider outcome requires manual review";
    await database.rpc("finish_notification_delivery", {
      p_id: deliveryId, p_lease: claim.lease_token, p_provider_id: null,
      p_retryable: retryable, p_error: message,
    });
    throw retryable ? new DeliveryDeferredError(message) : new DeliveryReviewError(message);
  }
  const { data: saved, error: saveError } = await database.rpc("finish_notification_delivery", {
    p_id: deliveryId, p_lease: claim.lease_token, p_provider_id: providerId,
    p_retryable: false, p_error: null,
  });
  if (saveError || !saved) throw new DeliveryDeferredError("Provider accepted the message; reconciliation is pending");
  return providerId;
}
