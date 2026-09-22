export class UsageLimitError extends Error {
  retryAfter: number;
  constructor(retryAfter: number, period: string) {
    super(`This workspace has reached its ${period === "minute" ? "short-term" : period === "month" ? "monthly" : "daily"} safety limit. Please try later or contact support.`);
    this.retryAfter = retryAfter;
  }
}

export async function consumeBusinessUsage(businessId: string, feature: "ai" | "sms", database?: any) {
  const db = database ?? (await import("@/integrations/supabase/client.server")).supabaseAdmin;
  const { data, error } = await db.rpc("consume_business_usage", { p_business_id: businessId, p_feature: feature });
  if (error || !data) throw new Error("Usage protection is unavailable; please try again later");
  if (!data.allowed) throw new UsageLimitError(data.retry_after ?? 60, data.period);
}

export function usageLimitResponse(error: UsageLimitError) {
  return new Response(error.message, { status: 429, headers: { "retry-after": String(error.retryAfter), "cache-control": "no-store" } });
}
