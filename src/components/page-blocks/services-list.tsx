import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtMoney } from "@/lib/format";
import type { ServicesListConfig } from "./types";

type ServiceRow = {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price_cents: number;
};

export function ServicesList({ config }: { config: ServicesListConfig }) {
  const { data: services, isLoading } = useQuery({
    queryKey: ["page-block-services", config.businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, description, duration_minutes, price_cents")
        .eq("business_id", config.businessId)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as ServiceRow[];
    },
  });

  return (
    <section>
      {config.heading && (
        <h2 className="font-display text-2xl mb-5 text-center">{config.heading}</h2>
      )}
      <div className="space-y-3">
        {isLoading &&
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        {!isLoading && services?.length === 0 && (
          <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            No services to show yet.
          </div>
        )}
        {services?.map((s) => (
          <div key={s.id} className="rounded-2xl border bg-card p-5 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="font-medium">{s.name}</div>
              {s.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2 text-pretty">{s.description}</p>
              )}
              <div className="text-xs text-muted-foreground mt-2">{s.duration_minutes} min</div>
            </div>
            <div className="font-display text-lg tabular-nums shrink-0" style={{ color: "var(--brand)" }}>
              {fmtMoney(s.price_cents)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
