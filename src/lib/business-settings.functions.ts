import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

const CURRENCIES = new Set(["GBP", "USD", "EUR", "AUD", "CAD", "NZD"]);

type BusinessProfileInput = {
  name: string;
  description?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  timezone: string;
  currency: string;
  instagram?: string | null;
  facebook?: string | null;
  tiktok?: string | null;
  twitter?: string | null;
  reminderHoursBefore?: number | null;
};

type WhiteLabelInput = {
  customDomain?: string | null;
  faviconUrl?: string | null;
  browserTitle?: string | null;
  emailLogoUrl?: string | null;
  emailFooter?: string | null;
  hidePoweredBy: boolean;
};

function optionalText(value: string | null | undefined, max: number) {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length > max) throw new Error(`A value is longer than ${max} characters.`);
  return trimmed || null;
}

async function ownedBusiness(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data, error } = await context.supabase
    .from("businesses")
    .select("id, plan, reminder_hours_before, hide_powered_by")
    .eq("owner_id", context.userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Only the business owner can change these settings.");
  return data as {
    id: string;
    plan: string;
    reminder_hours_before: number | null;
    hide_powered_by: boolean | null;
  };
}

export const saveBusinessProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: BusinessProfileInput) => {
    const name = data.name.trim();
    if (!name || name.length > 120) throw new Error("Enter a valid business name.");
    if (!data.timezone || data.timezone.length > 80) throw new Error("Enter a valid timezone.");
    if (!CURRENCIES.has(data.currency)) throw new Error("Choose a supported currency.");
    return { ...data, name };
  })
  .handler(async ({ data, context }) => {
    const business = await ownedBusiness(context);
    const studio = business.plan === "studio";
    const reminderHours = Math.max(1, Math.min(168, Number(data.reminderHoursBefore) || 24));
    const payload = {
      name: data.name,
      description: optionalText(data.description, 2000),
      address: optionalText(data.address, 500),
      phone: optionalText(data.phone, 50),
      email: optionalText(data.email, 254),
      website: optionalText(data.website, 500),
      timezone: data.timezone,
      currency: data.currency,
      instagram: optionalText(data.instagram, 200),
      facebook: optionalText(data.facebook, 200),
      tiktok: optionalText(data.tiktok, 200),
      twitter: optionalText(data.twitter, 200),
    };
    const { error } = await context.supabase
      .from("businesses")
      .update(payload as never)
      .eq("id", business.id);
    if (error) throw error;

    const savedReminderHours = Number(business.reminder_hours_before) || 24;
    if (studio && reminderHours !== savedReminderHours) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: reminderError } = await supabaseAdmin
        .from("businesses")
        .update({ reminder_hours_before: reminderHours })
        .eq("id", business.id);
      if (reminderError) throw reminderError;
    }
    return { saved: true };
  });

export const saveWhiteLabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: WhiteLabelInput) => data)
  .handler(async ({ data, context }) => {
    const business = await ownedBusiness(context);
    const studio = business.plan === "studio";
    const customDomain = optionalText(data.customDomain, 253)?.toLowerCase() ?? null;
    if (customDomain && (!/^[a-z0-9.-]+$/.test(customDomain) || customDomain.includes(".."))) {
      throw new Error("Enter a valid custom domain without https:// or a path.");
    }
    const safeAssetPath = (value: string | null | undefined) => {
      const path = optionalText(value, 1000);
      if (path && !path.startsWith(`${business.id}/`)) {
        throw new Error("That uploaded asset does not belong to this business.");
      }
      return path;
    };
    const hidePoweredBy = studio && data.hidePoweredBy;
    const { error } = await context.supabase
      .from("businesses")
      .update({
        custom_domain: customDomain,
        favicon_url: safeAssetPath(data.faviconUrl),
        browser_title: optionalText(data.browserTitle, 120),
        email_logo_url: safeAssetPath(data.emailLogoUrl),
        email_footer: optionalText(data.emailFooter, 1000),
      })
      .eq("id", business.id);
    if (error) throw error;

    if (hidePoweredBy !== Boolean(business.hide_powered_by)) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: brandingError } = await supabaseAdmin
        .from("businesses")
        .update({ hide_powered_by: hidePoweredBy })
        .eq("id", business.id);
      if (brandingError) throw brandingError;
    }
    return { saved: true };
  });
