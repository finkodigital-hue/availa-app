/* eslint-disable @typescript-eslint/no-explicit-any -- Private queue RPCs are intentionally absent from browser database types. */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  validateAccountDeletionCancellation,
  validateAccountDeletionRequest,
  type AccountDeletionRequest,
} from "@/lib/account-deletion";

async function identity(context: any, recent: boolean) {
  const { getRequest } = await import("@tanstack/react-start/server");
  const { requireAccountDeletionIdentity } =
    await import("@/lib/verified-account-deletion.server");
  const authorization = getRequest().headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  return requireAccountDeletionIdentity(
    context.supabase,
    token,
    context.userId,
    recent,
  );
}

function queueFailure(error: unknown): Error {
  const safeMessages = [
    "Deletion request is no longer available. Please refresh.",
    "Deletion processing has started. Contact support if you need to change your request.",
  ];
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "";
  return new Error(
    safeMessages.includes(message)
      ? message
      : "We couldn't confirm your account request. Please try again.",
  );
}

async function queueRpc(name: string, args: Record<string, string>) {
  try {
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any).rpc(name, args);
    if (error) throw error;
    return data;
  } catch (error) {
    throw queueFailure(error);
  }
}

export const getMyAccountDeletionRequest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AccountDeletionRequest | null> => {
    const user = await identity(context, false);
    return queueRpc("get_account_deletion_status_server", {
      p_user_id: user.userId,
    });
  });

export const requestMyAccountDeletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validateAccountDeletionRequest)
  .handler(async ({ data, context }): Promise<AccountDeletionRequest> => {
    const user = await identity(context, true);
    const request = await queueRpc("request_account_deletion_server", {
      p_user_id: user.userId,
      p_contact_email: user.contactEmail,
      p_request_key: data.requestKey,
    });
    if (!request)
      throw new Error("Your request could not be confirmed. Please try again.");
    return request;
  });

export const cancelMyAccountDeletionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validateAccountDeletionCancellation)
  .handler(async ({ data, context }): Promise<AccountDeletionRequest> => {
    const user = await identity(context, true);
    const request = await queueRpc("cancel_account_deletion_request_server", {
      p_user_id: user.userId,
      p_request_id: data.requestId,
    });
    if (!request)
      throw new Error(
        "Your cancellation could not be confirmed. Please refresh.",
      );
    return request;
  });
