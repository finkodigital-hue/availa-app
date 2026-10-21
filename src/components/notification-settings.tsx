/* eslint-disable @typescript-eslint/no-explicit-any -- Delivery rows come from a server-only table deliberately excluded from browser database types. */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  getNotificationCenter,
  saveNotificationPreferences,
} from "@/lib/notification.functions";
import { getServerFnAuthHeaders } from "@/lib/server-fn-auth";

import { useMyBusiness } from "@/lib/business";

const STUDIO_MESSAGES = new Set([
  "customer_booking_reminder",
  "customer_booking_reminder_sms",
  "customer_aftercare_email",
  "customer_rebooking_email",
]);

const OPTIONS = [
  [
    "owner_booking_created",
    "New bookings",
    "Show an owner alert when a booking is created.",
  ],
  [
    "owner_booking_cancelled",
    "Cancellations",
    "Show an owner alert when a booking is cancelled.",
  ],
  [
    "owner_consultation_signed",
    "Signed consultations",
    "Show an owner alert when a consultation is signed.",
  ],
  [
    "owner_low_stock",
    "Low stock",
    "Show an owner alert when an item crosses its warning level.",
  ],
  [
    "owner_payment_failed",
    "Failed payments",
    "Show an owner alert when a payment fails.",
  ],
  [
    "customer_booking_confirmation",
    "Booking confirmations",
    "Email customers after a booking is created.",
  ],
  [
    "customer_booking_reminder",
    "Appointment reminders",
    "Email eligible customers before their appointment.",
  ],
  [
    "customer_booking_reminder_sms",
    "SMS appointment reminders",
    "After SMS activation, text eligible customers who provide an optional international-format mobile number after the booking notice.",
  ],
  [
    "customer_aftercare_email",
    "Aftercare emails",
    "Send service-specific care instructions after completed appointments.",
  ],
  [
    "customer_rebooking_email",
    "Smart rebooking emails",
    "Invite opted-in clients back when their service is normally due again.",
  ],
] as const;

export function NotificationSettings({ businessId }: { businessId: string }) {
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const { data: business } = useMyBusiness();
  const studio = business?.plan === "studio";
  const load = useServerFn(getNotificationCenter);
  const save = useServerFn(saveNotificationPreferences);
  const query = useQuery({
    queryKey: ["notification-settings", businessId],
    queryFn: async () => load({ headers: await getServerFnAuthHeaders() }),
  });
  const preferences = query.data?.preferences;
  const change = async (key: string, checked: boolean) => {
    if (!preferences || saving) return;
    setSaving(true);
    const next = { ...preferences, [key]: checked };
    qc.setQueryData(["notification-settings", businessId], {
      ...query.data,
      preferences: next,
    });
    try {
      await save({ data: next, headers: await getServerFnAuthHeaders() });
      toast.success("Notification preference saved");
    } catch (error: any) {
      toast.error(error.message ?? "Could not save notification preferences.");
      await query.refetch();
    } finally {
      setSaving(false);
    }
  };
  if (query.isLoading)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading notification settings…
      </p>
    );
  if (query.isError)
    return (
      <div role="alert">
        <p className="text-sm">Notification settings could not be loaded.</p>
        <Button
          variant="outline"
          className="mt-3"
          onClick={() => query.refetch()}
        >
          Try again
        </Button>
      </div>
    );
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Notifications</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose which operational alerts and customer messages are enabled.
        </p>
      </div>
      <div className="divide-y rounded-2xl border bg-card">
        {OPTIONS.map(([key, title, description]) => (
          <div
            key={key}
            className="flex items-center justify-between gap-5 p-4"
          >
            <div>
              <div className="text-sm font-medium">
                {title}
                {STUDIO_MESSAGES.has(key) && !studio && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    Studio
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {description}
              </div>
            </div>
            <Switch
              checked={
                STUDIO_MESSAGES.has(key) && !studio
                  ? false
                  : (preferences?.[key] ??
                    (key !== "customer_booking_reminder_sms" &&
                      key !== "customer_rebooking_email"))
              }
              disabled={
                !preferences || saving || (STUDIO_MESSAGES.has(key) && !studio)
              }
              onCheckedChange={(checked) => change(key, checked)}
              aria-label={title}
            />
          </div>
        ))}
      </div>
      <div>
        <h3 className="text-sm font-semibold">Message delivery</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Messages needing review appear first, followed by recent activity.
        </p>
        <div className="mt-2 divide-y rounded-2xl border bg-card">
          {(query.data?.deliveries ?? []).slice(0, 20).map((item: any) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-4 p-3 text-sm"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{item.subject}</div>
                <div className="text-xs text-muted-foreground">
                  {item.channel === "sms" ? "SMS" : "Email"} ·{" "}
                  {item.recipient_masked} ·{" "}
                  {new Date(item.created_at).toLocaleString()}
                </div>
                {item.manual_review && (
                  <p className="mt-1 text-xs text-destructive">
                    Delivery needs review. Contact support before sending again.
                  </p>
                )}
                {!item.manual_review && item.next_attempt_at && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    A retry is scheduled.
                  </p>
                )}
              </div>
              <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs capitalize">
                {item.manual_review ? "Needs review" : item.status}
              </span>
            </div>
          ))}
          {!query.isLoading && !query.data?.deliveries?.length && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No messages have been queued yet.
            </div>
          )}
        </div>
      </div>
      <Button variant="outline" onClick={() => query.refetch()}>
        Refresh delivery history
      </Button>
    </div>
  );
}
