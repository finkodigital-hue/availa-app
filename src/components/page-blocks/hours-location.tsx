import { useQuery } from "@tanstack/react-query";
import { MapPin, Phone, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { WEEKDAYS } from "@/lib/format";
import type { HoursLocationConfig } from "./types";

function formatTime(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function HoursLocation({ config }: { config: HoursLocationConfig }) {
  const { data, isLoading } = useQuery({
    queryKey: ["page-block-hours-location", config.businessId],
    queryFn: async () => {
      const [bizRes, hoursRes] = await Promise.all([
        supabase
          .from("businesses")
          .select("address, phone")
          .eq("id", config.businessId)
          .maybeSingle(),
        supabase
          .from("business_hours")
          .select("weekday, open_time, close_time, closed")
          .eq("business_id", config.businessId)
          .order("weekday"),
      ]);
      if (bizRes.error) throw bizRes.error;
      if (hoursRes.error) throw hoursRes.error;
      return { business: bizRes.data, hours: hoursRes.data ?? [] };
    },
  });

  if (isLoading) return <Skeleton className="h-48 rounded-2xl" />;

  return (
    <section className="rounded-2xl border bg-card p-8 sm:p-10 grid sm:grid-cols-2 gap-8">
      <div>
        {config.heading && <h2 className="font-display text-2xl mb-4">{config.heading}</h2>}
        {data?.business?.address && (
          <div className="flex items-start gap-2 text-sm mb-2">
            <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <span>{data.business.address}</span>
          </div>
        )}
        {data?.business?.phone && (
          <div className="flex items-start gap-2 text-sm">
            <Phone className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <span>{data.business.phone}</span>
          </div>
        )}
        {!data?.business?.address && !data?.business?.phone && (
          <p className="text-sm text-muted-foreground">No address or phone set yet.</p>
        )}
      </div>
      <div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground mb-3">
          <Clock className="h-3.5 w-3.5" /> Hours
        </div>
        <div className="space-y-1.5 text-sm">
          {data?.hours.map((h) => (
            <div key={h.weekday} className="flex justify-between">
              <span className="text-muted-foreground">{WEEKDAYS[h.weekday]}</span>
              <span>
                {h.closed ? "Closed" : `${formatTime(h.open_time)} – ${formatTime(h.close_time)}`}
              </span>
            </div>
          ))}
          {(!data?.hours || data.hours.length === 0) && (
            <p className="text-muted-foreground">Hours not set yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}
