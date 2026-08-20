import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Full account deletion for a business owner. Separate from
// customer-portal.functions.ts (customers requesting a business delete
// *their* personal data) and billing.functions.ts (upgrading/managing the
// Studio subscription) -- this deletes the owner's entire Bookzenvo
// workspace: the business row, everything hanging off it, their Storage
// files, and their sign-in itself.
//
// Deliberately requires the caller to already know the exact business name
// (checked server-side, not just in the UI) before anything happens -- this
// is the one action in the whole app with no undo.

const STORAGE_BUCKETS = ["business-assets", "business-public-assets"] as const;

function stripeSecretKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe is not configured yet. Add STRIPE_SECRET_KEY to the server environment first.");
  return key;
}

async function stripeRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`https://api.stripe.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${stripeSecretKey()}`,
      ...init.headers,
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message ?? "Stripe could not complete that request.");
  return body as T;
}

// Storage paths are `${businessId}/${folder}/${file}` (see src/lib/image.ts)
// -- one level of subfolders (gallery, staff, logo, etc.), not flat. Supabase
// Storage's `list()` isn't recursive, folders come back with `id: null`, so
// walk it by hand rather than assuming a fixed set of folder names.
async function wipeStorageFolder(admin: any, bucket: string, prefix: string): Promise<void> {
  const { data: entries } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  if (!entries?.length) return;
  const files: string[] = [];
  for (const entry of entries) {
    const path = `${prefix}/${entry.name}`;
    if (entry.id === null) {
      await wipeStorageFolder(admin, bucket, path);
    } else {
      files.push(path);
    }
  }
  if (files.length) await admin.storage.from(bucket).remove(files);
}

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { confirmName: string }) => {
    if (!data?.confirmName?.trim()) throw new Error("Type the business name to confirm.");
    return data;
  })
  .handler(async ({ data, context }): Promise<{ deleted: true }> => {
    const { data: business, error } = await context.supabase
      .from("businesses")
      .select("id, name, stripe_subscription_id")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    if (!business) throw new Error("No workspace found for this account.");
    if (data.confirmName.trim() !== business.name.trim()) {
      throw new Error("That doesn't match the business name — nothing was deleted.");
    }

    // Cancel any live Bookzenvo subscription first so billing definitely
    // stops. Best-effort: if it's already cancelled or Stripe rejects it for
    // some other reason, that shouldn't block deleting the account -- the
    // business row (and the subscription id stored on it) is about to be
    // gone either way.
    if (business.stripe_subscription_id) {
      try {
        await stripeRequest(`/v1/subscriptions/${encodeURIComponent(business.stripe_subscription_id)}`, {
          method: "DELETE",
        });
      } catch {
        // See comment above.
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Storage objects aren't covered by any SQL foreign key, so they'd
    // otherwise be orphaned forever once the business row is gone.
    for (const bucket of STORAGE_BUCKETS) {
      await wipeStorageFolder(supabaseAdmin, bucket, business.id);
    }

    // Deleting the auth user cascades to `businesses` (owner_id ON DELETE
    // CASCADE) and from there to every business-scoped table -- staff,
    // services, bookings, customers, hours, blocked dates, payments,
    // page content, and so on -- in one transaction on Postgres's side.
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(context.userId);
    if (deleteError) throw deleteError;

    return { deleted: true };
  });
