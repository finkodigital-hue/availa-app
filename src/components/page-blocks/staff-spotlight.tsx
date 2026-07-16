import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import type { StaffSpotlightConfig } from "./types";

type StaffRow = {
  id: string;
  name: string;
  role: string | null;
  photo_url: string | null;
  bio: string | null;
};

export function StaffSpotlight({ config }: { config: StaffSpotlightConfig }) {
  const { data: staff, isLoading } = useQuery({
    queryKey: ["page-block-staff", config.businessId, (config.staffIds ?? []).join(",")],
    queryFn: async () => {
      let query = supabase
        .from("staff")
        .select("id, name, role, photo_url, bio")
        .eq("business_id", config.businessId)
        .eq("bookable", true);
      if (config.staffIds?.length) query = query.in("id", config.staffIds);
      const { data, error } = await query.order("name");
      if (error) throw error;
      return data as StaffRow[];
    },
  });

  return (
    <section>
      {config.heading && (
        <h2 className="font-display text-2xl mb-5 text-center">{config.heading}</h2>
      )}
      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
        {isLoading &&
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        {!isLoading && staff?.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            No staff to show yet.
          </div>
        )}
        {staff?.map((s) => (
          <div key={s.id} className="rounded-2xl border bg-card p-5 text-center">
            <div className="h-16 w-16 mx-auto rounded-full bg-secondary overflow-hidden grid place-items-center font-display text-xl">
              {s.photo_url ? (
                <img src={s.photo_url} alt="" className="h-full w-full object-cover" />
              ) : (
                s.name.charAt(0).toUpperCase()
              )}
            </div>
            <div className="font-medium mt-3">{s.name}</div>
            {s.role && <div className="text-xs text-muted-foreground">{s.role}</div>}
            {s.bio && (
              <p className="text-xs text-muted-foreground mt-2 text-pretty line-clamp-3">{s.bio}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
