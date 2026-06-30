import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export function StaffServicesEditor({ staffId, businessId }: { staffId: string; businessId: string }) {
  const qc = useQueryClient();

  const { data: services, isLoading } = useQuery({
    queryKey: ["all-services-for-staff", businessId],
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("id, name, duration_minutes").eq("business_id", businessId).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: linked } = useQuery({
    queryKey: ["staff-services", staffId],
    queryFn: async () => {
      const { data, error } = await supabase.from("service_staff").select("service_id").eq("staff_id", staffId);
      if (error) throw error;
      return new Set((data ?? []).map((r: any) => r.service_id));
    },
  });

  const toggle = async (sid: string) => {
    if (!linked) return;
    if (linked.has(sid)) {
      const { error } = await supabase.from("service_staff").delete().eq("staff_id", staffId).eq("service_id", sid);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("service_staff").insert({ staff_id: staffId, service_id: sid, business_id: businessId });
      if (error) return toast.error(error.message);
    }
    qc.invalidateQueries({ queryKey: ["staff-services", staffId] });
  };

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  if (!services || services.length === 0) return <p className="text-sm text-muted-foreground">No services yet. Add some on the Services page.</p>;

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">Pick the services this staff member can perform. With none selected, they appear for every service.</p>
      <div className="flex flex-wrap gap-2">
        {services.map((s: any) => {
          const on = linked?.has(s.id);
          return (
            <button
              key={s.id}
              onClick={() => toggle(s.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                on ? "bg-primary text-primary-foreground border-transparent" : "bg-card hover:bg-secondary/60"
              }`}
            >
              {on && <Check className="h-3 w-3" />}
              {s.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
