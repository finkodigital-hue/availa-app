import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CalendarPlus, CalendarX } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Notification = {
  id: string;
  type: "booking_created" | "booking_cancelled";
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

export function NotificationsBell({ variant = "sidebar" }: { variant?: "sidebar" | "icon" }) {
  const { data: business } = useMyBusiness();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const bid = business?.id;

  const { data: notifications } = useQuery({
    queryKey: ["notifications", bid],
    enabled: !!bid,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("notifications")
        .select("id, type, title, body, link, read_at, created_at")
        .eq("business_id", bid!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
  });

  const unread = (notifications ?? []).filter((n) => !n.read_at).length;

  const markAllRead = async () => {
    if (!bid || unread === 0) return;
    const ids = (notifications ?? []).filter((n) => !n.read_at).map((n) => n.id);
    const now = new Date().toISOString();
    qc.setQueryData<Notification[]>(["notifications", bid], (old) =>
      old?.map((n) => (ids.includes(n.id) ? { ...n, read_at: now } : n)) ?? [],
    );
    await (supabase as any).from("notifications").update({ read_at: now }).in("id", ids);
  };

  const markRead = async (id: string) => {
    const now = new Date().toISOString();
    qc.setQueryData<Notification[]>(["notifications", bid], (old) =>
      old?.map((n) => (n.id === id ? { ...n, read_at: now } : n)) ?? [],
    );
    await (supabase as any).from("notifications").update({ read_at: now }).eq("id", id);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {variant === "icon" ? (
          <button
            type="button"
            className="relative h-9 w-9 grid place-items-center rounded-lg hover:bg-card"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            {unread > 0 && (
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary" />
            )}
          </button>
        ) : (
          <button
            type="button"
            className="relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-card/60 transition-all w-full"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            <span>Notifications</span>
            {unread > 0 && (
              <span className="ml-auto inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align={variant === "icon" ? "end" : "start"} side={variant === "icon" ? "bottom" : "right"} className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <button type="button" onClick={markAllRead} className="text-xs text-primary hover:underline">
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto divide-y">
          {(notifications ?? []).length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">No notifications yet.</div>
          )}
          {(notifications ?? []).map((n) => {
            const Icon = n.type === "booking_cancelled" ? CalendarX : CalendarPlus;
            return (
              <Link
                key={n.id}
                to={n.link ?? "/dashboard"}
                onClick={() => {
                  markRead(n.id);
                  setOpen(false);
                }}
                className={`flex items-start gap-3 px-4 py-3 hover:bg-secondary/40 transition-colors ${!n.read_at ? "bg-primary/[0.03]" : ""}`}
              >
                <Icon
                  className={`h-4 w-4 mt-0.5 shrink-0 ${n.type === "booking_cancelled" ? "text-destructive" : "text-[color:var(--confirmed)]"}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{n.title}</div>
                  {n.body && <div className="text-xs text-muted-foreground truncate">{n.body}</div>}
                  <div className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(n.created_at)}</div>
                </div>
                {!n.read_at && <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />}
              </Link>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
