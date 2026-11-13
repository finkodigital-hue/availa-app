import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasExpectedBearer } from "@/lib/internal-auth.server";

const DEFAULT_WINDOW_MINUTES = 20;
const DEFAULT_THRESHOLD = 5;
const REMINDER_CRON_MAX_AGE_MS = 40 * 60_000;
const ERASURE_STORAGE_JOB_MAX_AGE_MS = 45 * 60_000;

function isAuthorized(request: Request) {
  return (
    hasExpectedBearer(request, process.env.MONITORING_SECRET) ||
    hasExpectedBearer(request, process.env.MONITORING_CRON_SECRET)
  );
}

function validCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validHeartbeatTime(value: unknown, now: number) {
  if (value === null) return true;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(
      value,
    )
  )
    return false;
  const day = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  const parsed = Date.parse(value);
  return (
    Number.isFinite(day) &&
    new Date(day).toISOString().slice(0, 10) === value.slice(0, 10) &&
    Number.isFinite(parsed) &&
    parsed <= now
  );
}

function monitoringError() {
  return Response.json(
    { status: "error", checkedAt: new Date().toISOString() },
    { status: 503, headers: { "cache-control": "no-store" } },
  );
}

export const Route = createFileRoute("/api/monitoring/client-errors")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthorized(request)) {
          return Response.json(
            { error: "Not found", checkedAt: new Date().toISOString() },
            { status: 404, headers: { "cache-control": "no-store" } },
          );
        }
        try {
          const since = new Date(
            Date.now() - DEFAULT_WINDOW_MINUTES * 60_000,
          ).toISOString();
          // Generated database types intentionally lag the pending migration.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { count, error } = await (supabaseAdmin as any)
            .from("client_errors")
            .select("id", { count: "exact", head: true })
            .gte("created_at", since);

          if (error || !validCount(count)) return monitoringError();

          const observed = count;
          // Generated database types intentionally lag the operational tables.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const db = supabaseAdmin as any;
          const [
            deliveryIssues,
            changeEmailIssues,
            paymentIssues,
            balanceIssues,
            giftIssues,
            refundIssues,
            erasureStorageIssues,
            stalledErasureStorageJobs,
            reminderCron,
          ] = await Promise.all([
            db
              .from("notification_deliveries")
              .select("id", { count: "exact", head: true })
              .eq("manual_review", true),
            db
              .from("booking_change_email_outbox")
              .select("id", { count: "exact", head: true })
              .eq("manual_review", true),
            db
              .from("booking_payment_issues")
              .select("payment_intent_id", { count: "exact", head: true })
              .in("status", ["open", "refund_pending"])
              .lt(
                "created_at",
                new Date(Date.now() - 30 * 60_000).toISOString(),
              ),
            db
              .from("balance_checkout_attempts")
              .select("id", { count: "exact", head: true })
              .eq("state", "review"),
            db
              .from("gift_card_refunds")
              .select("stripe_refund_id", { count: "exact", head: true })
              .eq("manual_review", true),
            db
              .from("stripe_refund_reviews")
              .select("stripe_refund_id", { count: "exact", head: true })
              .eq("manual_review", true),
            db
              .from("customer_erasure_storage_jobs")
              .select("id", { count: "exact", head: true })
              .eq("status", "failed"),
            db
              .from("customer_erasure_storage_jobs")
              .select("id", { count: "exact", head: true })
              .eq("status", "pending")
              .lt(
                "created_at",
                new Date(
                  Date.now() - ERASURE_STORAGE_JOB_MAX_AGE_MS,
                ).toISOString(),
              ),
            db
              .from("operational_job_heartbeats")
              .select("last_started_at,last_completed_at,last_success_at")
              .eq("job_name", "send-reminders")
              .maybeSingle(),
          ]);
          if (
            deliveryIssues.error ||
            changeEmailIssues.error ||
            paymentIssues.error ||
            balanceIssues.error ||
            giftIssues.error ||
            refundIssues.error ||
            erasureStorageIssues.error ||
            stalledErasureStorageJobs.error ||
            reminderCron.error
          )
            return monitoringError();
          const counts = [
            deliveryIssues,
            changeEmailIssues,
            paymentIssues,
            balanceIssues,
            giftIssues,
            refundIssues,
            erasureStorageIssues,
            stalledErasureStorageJobs,
          ];
          if (counts.some((result) => !validCount(result.count)))
            return monitoringError();
          const heartbeat = reminderCron.data;
          const heartbeatFields = [
            "last_started_at",
            "last_completed_at",
            "last_success_at",
          ];
          const checkedNow = Date.now();
          if (
            heartbeat !== null &&
            (typeof heartbeat !== "object" ||
              Array.isArray(heartbeat) ||
              heartbeatFields.some(
                (field) =>
                  !Object.hasOwn(heartbeat, field) ||
                  !validHeartbeatTime(heartbeat[field], checkedNow),
              ))
          )
            return monitoringError();
          const unresolvedDeliveries = deliveryIssues.count;
          const unresolvedChangeEmails = changeEmailIssues.count;
          const unresolvedPayments = paymentIssues.count;
          const unresolvedBalanceCheckouts = balanceIssues.count;
          const unresolvedGiftRefunds = giftIssues.count;
          const unresolvedRefunds = refundIssues.count;
          const unresolvedErasureStorageJobs = erasureStorageIssues.count;
          const stalledErasureStorageJobCount = stalledErasureStorageJobs.count;
          const reminderCronLastSuccessAt =
            reminderCron.data?.last_success_at ?? null;
          const reminderCronStale =
            !reminderCronLastSuccessAt ||
            Date.now() - Date.parse(reminderCronLastSuccessAt) >
              REMINDER_CRON_MAX_AGE_MS;
          const healthy =
            observed < DEFAULT_THRESHOLD &&
            !unresolvedDeliveries &&
            !unresolvedChangeEmails &&
            !unresolvedPayments &&
            !unresolvedBalanceCheckouts &&
            !unresolvedGiftRefunds &&
            !unresolvedRefunds &&
            !unresolvedErasureStorageJobs &&
            !stalledErasureStorageJobCount &&
            !reminderCronStale;
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
              unresolvedErasureStorageJobs,
              stalledErasureStorageJobs: stalledErasureStorageJobCount,
              reminderCronStale,
              reminderCronLastStartedAt:
                reminderCron.data?.last_started_at ?? null,
              reminderCronLastCompletedAt:
                reminderCron.data?.last_completed_at ?? null,
              reminderCronLastSuccessAt,
            },
            {
              status: healthy ? 200 : 503,
              headers: { "cache-control": "no-store" },
            },
          );
        } catch {
          // Operational failures may contain provider bodies or customer data.
          // Return a fixed health failure; never log the raw exception.
          return monitoringError();
        }
      },
    },
  },
});
