import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Recoverable workspace closure for a business owner. Separate from
// customer-portal.functions.ts (customers requesting a business delete
// *their* personal data) and billing.functions.ts (upgrading/managing the
// Studio subscription). Data and sign-in are retained for a 30-day recovery window;
// permanent purge is an operator-only runbook action after backup checks.
//
// Deliberately requires the caller to already know the exact business name
// (checked server-side, not just in the UI) before anything happens -- this
// closure is reversible, but still requires deliberate confirmation.

const STORAGE_BUCKETS = ["business-assets", "business-public-assets"] as const;

function stripeSecretKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key)
    throw new Error(
      "Stripe is not configured yet. Add STRIPE_SECRET_KEY to the server environment first.",
    );
  return key;
}

async function stripeRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`https://api.stripe.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${stripeSecretKey()}`,
      ...init.headers,
    },
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      body?.error?.message ?? "Stripe could not complete that request.",
    );
  return body as T;
}

async function listStorageFolder(
  admin: any,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const files: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data: entries, error } = await admin.storage
      .from(bucket)
      .list(prefix, { limit: 1000, offset });
    if (error) throw error;
    for (const entry of entries ?? []) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id === null) {
        files.push(...(await listStorageFolder(admin, bucket, path)));
      } else {
        files.push(path);
      }
    }
    if (!entries || entries.length < 1000) break;
  }
  return files;
}

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { confirmName: string }) => {
    if (!data?.confirmName?.trim())
      throw new Error("Type the business name to confirm.");
    return data;
  })
  .handler(async ({ data, context }): Promise<{ scheduledFor: string }> => {
    const { data: business, error } = await context.supabase
      .from("businesses")
      .select("id, name, stripe_subscription_id, deletion_scheduled_for")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    if (!business) throw new Error("No workspace found for this account.");
    if (data.confirmName.trim() !== business.name.trim()) {
      throw new Error(
        "That doesn't match the business name — nothing was deleted.",
      );
    }

    if (business.deletion_scheduled_for) {
      return { scheduledFor: business.deletion_scheduled_for };
    }

    // Cancel any live Bookzenvo subscription first so billing stops.
    // Best-effort: closure must remain available if it is already cancelled
    // or Stripe is temporarily unavailable.
    if (business.stripe_subscription_id) {
      try {
        await stripeRequest(
          `/v1/subscriptions/${encodeURIComponent(business.stripe_subscription_id)}`,
          {
            method: "DELETE",
          },
        );
      } catch {
        // See comment above.
      }
    }

    const requestedAt = new Date();
    const scheduledFor = new Date(
      requestedAt.getTime() + 30 * 86400000,
    ).toISOString();
    const { error: closeError } = await context.supabase
      .from("businesses")
      .update({
        deletion_requested_at: requestedAt.toISOString(),
        deletion_scheduled_for: scheduledFor,
      })
      .eq("id", business.id)
      .eq("owner_id", context.userId);
    if (closeError) throw closeError;
    return { scheduledFor };
  });

export const cancelAccountDeletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ restored: true }> => {
    const { error } = await context.supabase
      .from("businesses")
      .update({
        deletion_requested_at: null,
        deletion_scheduled_for: null,
      })
      .eq("owner_id", context.userId);
    if (error) throw error;
    return { restored: true };
  });

export const exportMyWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Record<string, unknown>> => {
    const { data: business, error } = await context.supabase
      .from("businesses")
      .select("id")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    if (!business) throw new Error("Workspace not found.");
    const { data, error: exportError } = await (context.supabase as any).rpc(
      "export_owner_workspace",
      { p_business_id: business.id },
    );
    if (exportError) throw exportError;
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const storage: Record<string, string[]> = {};
    for (const bucket of STORAGE_BUCKETS) {
      storage[bucket] = await listStorageFolder(
        supabaseAdmin,
        bucket,
        business.id,
      );
    }
    return { ...data, storageManifest: storage };
  });
