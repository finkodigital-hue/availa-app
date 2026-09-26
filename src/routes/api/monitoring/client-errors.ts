import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const DEFAULT_WINDOW_MINUTES = 20;
const DEFAULT_THRESHOLD = 5;

function isAuthorized(request: Request) {
  const secret = process.env.MONITORING_SECRET;
  const supplied = request.headers.get("authorization");
  return Boolean(secret && supplied === `Bearer ${secret}`);
}

export const Route = createFileRoute("/api/monitoring/client-errors")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthorized(request)) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }

        const since = new Date(
          Date.now() - DEFAULT_WINDOW_MINUTES * 60_000,
        ).toISOString();
        // Generated database types intentionally lag the pending migration.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { count, error } = await (supabaseAdmin as any)
          .from("client_errors")
          .select("id", { count: "exact", head: true })
          .gte("created_at", since);

        if (error) {
          console.error("[monitoring] Could not count client errors", error);
          return Response.json(
            { status: "error", checkedAt: new Date().toISOString() },
            { status: 503, headers: { "cache-control": "no-store" } },
          );
        }

        const observed = count ?? 0;
        const db = supabaseAdmin as any;
        const [deliveryIssues, changeEmailIssues, paymentIssues, balanceIssues, giftIssues, refundIssues] = await Promise.all([
          db.from("notification_deliveries").select("id", { count: "exact", head: true }).eq("manual_review", true),
          db.from("booking_change_email_outbox").select("id", { count: "exact", head: true }).eq("manual_review", true),
          db.from("booking_payment_issues").select("payment_intent_id", { count: "exact", head: true })
            .in("status", ["open", "refund_pending"]).lt("created_at", new Date(Date.now()-30*60_000).toISOString()),
          db.from("balance_checkout_attempts").select("id", { count: "exact", head: true }).eq("state", "review"),
          db.from("gift_card_refunds").select("stripe_refund_id", { count: "exact", head: true }).eq("manual_review", true),
          db.from("stripe_refund_reviews").select("stripe_refund_id", { count: "exact", head: true }).eq("manual_review", true),
        ]);
        if (deliveryIssues.error || changeEmailIssues.error || paymentIssues.error || balanceIssues.error || giftIssues.error || refundIssues.error) return Response.json({ status: "error" }, { status: 503, headers: { "cache-control": "no-store" } });
        const unresolvedDeliveries = deliveryIssues.count ?? 0;
        const unresolvedChangeEmails = changeEmailIssues.count ?? 0;
        const unresolvedPayments = paymentIssues.count ?? 0;
        const unresolvedBalanceCheckouts = balanceIssues.count ?? 0;
        const unresolvedGiftRefunds = giftIssues.count ?? 0;
        const unresolvedRefunds = refundIssues.count ?? 0;
        const healthy = observed < DEFAULT_THRESHOLD && !unresolvedDeliveries && !unresolvedChangeEmails && !unresolvedPayments && !unresolvedBalanceCheckouts && !unresolvedGiftRefunds && !unresolvedRefunds;
        return Response.json(
          {
            status: healthy ? "ok" : "alert",
            checkedAt: new Date().toISOString(),
            windowMinutes: DEFAULT_WINDOW_MINUTES,
            threshold: DEFAULT_THRESHOLD,
            count: observed,
            unresolvedDeliveries,
            unresolvedChangeEmails,
            unresolvedPayments,
            unresolvedBalanceCheckouts,
            unresolvedGiftRefunds,
            unresolvedRefunds,
          },
          {
            status: healthy ? 200 : 503,
            headers: { "cache-control": "no-store" },
          },
        );
      },
    },
  },
});
