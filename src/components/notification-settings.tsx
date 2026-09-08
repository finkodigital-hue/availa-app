/* eslint-disable @typescript-eslint/no-explicit-any -- Delivery rows come from a server-only table deliberately excluded from browser database types. */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  getNotificationCenter,
  saveNotificationPreferences,
} from "@/lib/notification.functions";
import { getServerFnAuthHeaders } from "@/lib/server-fn-auth";

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
] as const;

export function NotificationSettings({ businessId }: { businessId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(getNotificationCenter);
  const save = useServerFn(saveNotificationPreferences);
  const query = useQuery({
    queryKey: ["notification-settings", businessId],
    queryFn: async () => load({ headers: await getServerFnAuthHeaders() }),
  });
  const preferences = query.data?.preferences;
  const change = async (key: string, checked: boolean) => {
    if (!preferences) return;
    const next = { ...preferences, [key]: checked };
    qc.setQueryData(["notification-settings", businessId], {
      ...query.data,
      preferences: next,
    });
    try {
      await save({ data: next, headers: await getServerFnAuthHeaders() });
    } catch (error: any) {
      toast.error(error.message ?? "Could not save notification preferences.");
      query.refetch();
    }
  };
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
              <div className="text-sm font-medium">{title}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {description}
              </div>
            </div>
            <Switch
              checked={preferences?.[key] ?? true}
              disabled={!preferences}
              onCheckedChange={(checked) => change(key, checked)}
              aria-label={title}
            />
          </div>
        ))}
      </div>
      <div>
        <h3 className="text-sm font-semibold">Recent email delivery</h3>
        <div className="mt-2 divide-y rounded-2xl border bg-card">
          {(query.data?.deliveries ?? []).slice(0, 20).map((item: any) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-4 p-3 text-sm"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{item.subject}</div>
                <div className="text-xs text-muted-foreground">
                  {item.recipient_masked} ·{" "}
                  {new Date(item.created_at).toLocaleString()}
                </div>
              </div>
              <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs capitalize">
                {item.status}
              </span>
            </div>
          ))}
          {!query.isLoading && !query.data?.deliveries?.length && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No emails have been queued yet.
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
