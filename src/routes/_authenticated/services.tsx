import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { fmtMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/services")({
  component: ServicesPage,
});

type Service = {
  id: string; name: string; description: string | null;
  duration_minutes: number; price_cents: number; currency: string;
  active: boolean; image_url: string | null;
};

function ServicesPage() {
  const { data: biz } = useMyBusiness();
  const bid = biz?.id;
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Partial<Service> | null>(null);

  const { data: services } = useQuery({
    queryKey: ["services", bid],
    enabled: !!bid,
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("*").eq("business_id", bid!).order("created_at", { ascending: false });
      if (error) throw error;
      return data as Service[];
    },
  });

  const save = async () => {
    if (!edit || !bid) return;
    const payload = {
      business_id: bid,
      name: edit.name ?? "",
      description: edit.description ?? null,
      duration_minutes: Number(edit.duration_minutes) || 60,
      price_cents: Math.round((Number(edit.price_cents) || 0)),
      active: edit.active ?? true,
    };
    if (!payload.name) return toast.error("Name is required");
    const { error } = edit.id
      ? await supabase.from("services").update(payload).eq("id", edit.id)
      : await supabase.from("services").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    setEdit(null);
    qc.invalidateQueries({ queryKey: ["services"] });
  };

  const del = async (id: string) => {
    if (!confirm("Delete this service?")) return;
    const { error } = await supabase.from("services").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["services"] });
  };

  return (
    <div className="p-6 md:p-10 max-w-6xl">
      <PageHeader
        title="Services"
        subtitle="What customers can book."
        action={<Button onClick={() => setEdit({ active: true, duration_minutes: 60 })}><Plus className="h-4 w-4 mr-1" /> New service</Button>}
      />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {services?.map((s) => (
          <div key={s.id} className="rounded-2xl border bg-card p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display text-xl">{s.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">{s.duration_minutes} min · {fmtMoney(s.price_cents)}</p>
              </div>
              <div className="flex gap-1">
                <button className="p-2 rounded-lg hover:bg-muted" onClick={() => setEdit(s)}><Pencil className="h-3.5 w-3.5" /></button>
                <button className="p-2 rounded-lg hover:bg-muted" onClick={() => del(s.id)}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            {s.description && <p className="text-sm text-muted-foreground mt-3 line-clamp-2">{s.description}</p>}
            {!s.active && <span className="inline-block mt-3 text-xs px-2 py-0.5 rounded-full bg-muted">Inactive</span>}
          </div>
        ))}
        {services?.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed p-12 text-center text-muted-foreground">
            No services yet. Create your first one.
          </div>
        )}
      </div>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.id ? "Edit service" : "New service"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name</Label><Input value={edit?.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className="mt-1.5" /></div>
            <div><Label>Description</Label><Textarea value={edit?.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} className="mt-1.5" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Duration (min)</Label><Input type="number" value={edit?.duration_minutes ?? 60} onChange={(e) => setEdit({ ...edit, duration_minutes: Number(e.target.value) })} className="mt-1.5" /></div>
              <div><Label>Price (cents)</Label><Input type="number" value={edit?.price_cents ?? 0} onChange={(e) => setEdit({ ...edit, price_cents: Number(e.target.value) })} className="mt-1.5" /></div>
            </div>
            <div className="flex items-center justify-between"><Label>Active</Label><Switch checked={edit?.active ?? true} onCheckedChange={(v) => setEdit({ ...edit, active: v })} /></div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
