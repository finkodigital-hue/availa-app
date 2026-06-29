import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Pencil, Trash2, Scissors, Clock, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { fmtMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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

  const { data: services, isLoading } = useQuery({
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
      price_cents: Math.round(Number(edit.price_cents) || 0),
      active: edit.active ?? true,
    };
    if (!payload.name) return toast.error("Name is required");
    const { error } = edit.id
      ? await supabase.from("services").update(payload).eq("id", edit.id)
      : await supabase.from("services").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(edit.id ? "Service updated" : "Service created");
    setEdit(null);
    qc.invalidateQueries({ queryKey: ["services"] });
  };

  const del = async (id: string) => {
    if (!confirm("Delete this service? Existing bookings will be kept.")) return;
    const { error } = await supabase.from("services").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Service deleted");
    qc.invalidateQueries({ queryKey: ["services"] });
  };

  return (
    <div className="p-5 sm:p-8 md:p-10 max-w-6xl">
      <PageHeader
        eyebrow="Catalog"
        title="Services"
        subtitle="What customers can book — name it, price it, set the duration."
        action={
          <Button onClick={() => setEdit({ active: true, duration_minutes: 60 })} className="shadow-glow">
            <Plus className="h-4 w-4 mr-1" /> New service
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : services?.length === 0 ? (
        <EmptyState
          icon={Scissors}
          title="No services yet"
          description="Create your first offering — a haircut, a 60-minute massage, an intro consult. Customers see them on your booking page."
          action={
            <Button onClick={() => setEdit({ active: true, duration_minutes: 60 })}>
              <Plus className="h-4 w-4 mr-1" /> Add your first service
            </Button>
          }
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {services?.map((s, i) => (
            <div
              key={s.id}
              className={`group rounded-2xl border bg-card p-5 card-hover animate-rise stagger-${(i % 6) + 1}`}
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <h3 className="font-display text-xl truncate">{s.name}</h3>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1.5">
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{s.duration_minutes} min</span>
                    <span className="inline-flex items-center gap-1"><DollarSign className="h-3 w-3" />{fmtMoney(s.price_cents)}</span>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="p-2 rounded-lg hover:bg-secondary" onClick={() => setEdit(s)} aria-label="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button className="p-2 rounded-lg hover:bg-destructive/10 hover:text-destructive" onClick={() => del(s.id)} aria-label="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {s.description && (
                <p className="text-sm text-muted-foreground mt-3 line-clamp-2 text-pretty">{s.description}</p>
              )}
              {!s.active && (
                <Badge variant="secondary" className="mt-3">Inactive</Badge>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">{edit?.id ? "Edit service" : "New service"}</DialogTitle>
            <DialogDescription>Customers see this on your booking page.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={edit?.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className="mt-1.5 h-10" placeholder="Signature haircut" autoFocus />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={edit?.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} className="mt-1.5" placeholder="What's included…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Duration (min)</Label>
                <Input type="number" min={5} step={5} value={edit?.duration_minutes ?? 60} onChange={(e) => setEdit({ ...edit, duration_minutes: Number(e.target.value) })} className="mt-1.5 h-10" />
              </div>
              <div>
                <Label>Price (cents)</Label>
                <Input type="number" min={0} value={edit?.price_cents ?? 0} onChange={(e) => setEdit({ ...edit, price_cents: Number(e.target.value) })} className="mt-1.5 h-10" />
                <p className="text-[11px] text-muted-foreground mt-1">{fmtMoney(Number(edit?.price_cents) || 0)}</p>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-secondary/60 p-3">
              <div>
                <Label className="text-sm">Active</Label>
                <p className="text-xs text-muted-foreground">Visible on your booking page.</p>
              </div>
              <Switch checked={edit?.active ?? true} onCheckedChange={(v) => setEdit({ ...edit, active: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
            <Button onClick={save}>{edit?.id ? "Save changes" : "Create service"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
