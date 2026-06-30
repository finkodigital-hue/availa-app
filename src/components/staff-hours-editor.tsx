import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WEEKDAYS } from "@/lib/format";
import { toast } from "sonner";

type Row = { id?: string; staff_id: string; business_id: string; weekday: number; open_time: string | null; close_time: string | null; closed: boolean };

export function StaffHoursEditor({ staffId, businessId }: { staffId: string; businessId: string }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["staff-hours", staffId],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff_hours").select("*").eq("staff_id", staffId).order("weekday");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    const map = new Map<number, any>((data ?? []).map((r: any) => [r.weekday, r]));
    setRows(Array.from({ length: 7 }, (_, i) => map.get(i) ?? {
      staff_id: staffId, business_id: businessId, weekday: i,
      open_time: "09:00", close_time: "17:00", closed: true,
    }));
  }, [data, staffId, businessId]);

  const save = async () => {
    setSaving(true);
    try {
      // upsert each row
      for (const r of rows) {
        const payload: any = {
          staff_id: r.staff_id, business_id: r.business_id, weekday: r.weekday,
          open_time: r.closed ? null : r.open_time, close_time: r.closed ? null : r.close_time, closed: r.closed,
        };
        if (r.id) {
          await supabase.from("staff_hours").update(payload).eq("id", r.id);
        } else {
          await supabase.from("staff_hours").upsert(payload, { onConflict: "staff_id,weekday" });
        }
      }
      toast.success("Working hours saved");
      qc.invalidateQueries({ queryKey: ["staff-hours", staffId] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not save");
    } finally { setSaving(false); }
  };

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Overrides business hours for this staff member. Leave all days closed to inherit business hours.</p>
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={r.weekday} className={`grid grid-cols-[72px_1fr_1fr_auto] items-center gap-2 rounded-lg px-2 py-1.5 ${r.closed ? "opacity-60" : ""}`}>
            <span className="text-xs font-medium">{WEEKDAYS[r.weekday]}</span>
            <Input type="time" disabled={r.closed} value={r.open_time?.slice(0, 5) ?? ""} onChange={(e) => { const c = [...rows]; c[i] = { ...r, open_time: e.target.value }; setRows(c); }} className="h-8 tabular-nums text-xs" />
            <Input type="time" disabled={r.closed} value={r.close_time?.slice(0, 5) ?? ""} onChange={(e) => { const c = [...rows]; c[i] = { ...r, close_time: e.target.value }; setRows(c); }} className="h-8 tabular-nums text-xs" />
            <Switch checked={!r.closed} onCheckedChange={(v) => { const c = [...rows]; c[i] = { ...r, closed: !v }; setRows(c); }} />
          </div>
        ))}
      </div>
      <Button onClick={save} disabled={saving} size="sm">
        {saving && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
        Save hours
      </Button>
    </div>
  );
}
