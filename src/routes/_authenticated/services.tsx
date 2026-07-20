import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Scissors, Clock, DollarSign, Check, Archive, ArchiveRestore, Tag, Package, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { fmtMoney as formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/services")({
  component: ServicesPage,
});

type Service = {
  id: string; name: string; description: string | null;
  duration_minutes: number; price_cents: number; currency: string;
  active: boolean; image_url: string | null;
  buffer_before_min: number; buffer_after_min: number; color: string | null;
  category: string | null; archived_at: string | null;
};
type Staff = { id: string; name: string };
type InventoryItem = { id: string; name: string; unit: string | null; cost_cents: number | null };
type RecipeLine = { inventory_item_id: string; quantity: number };


const COLORS = ["#C2410C", "#0EA5E9", "#10B981", "#A855F7", "#F59E0B", "#EC4899", "#6366F1", "#64748B"];


function ServicesPage() {
  const { data: biz } = useMyBusiness();
  const fmtMoney = (cents: number) => formatMoney(cents, biz?.currency ?? "GBP");
  const bid = biz?.id;
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Partial<Service> | null>(null);
  const [linked, setLinked] = useState<Set<string>>(new Set());
  const [recipe, setRecipe] = useState<RecipeLine[]>([]);


  const { data: services, isLoading } = useQuery({
    queryKey: ["services", bid],
    enabled: !!bid,
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("*").eq("business_id", bid!).order("created_at", { ascending: false });
      if (error) throw error;
      return data as Service[];
    },
  });

  const { data: allStaff } = useQuery({
    queryKey: ["all-staff", bid],
    enabled: !!bid,
    queryFn: async () => {
      const { data } = await supabase.from("staff").select("id, name").eq("business_id", bid!).eq("active", true).order("name");
      return (data ?? []) as Staff[];
    },
  });

  const { data: inventory } = useQuery({
    queryKey: ["inventory_items", bid],
    enabled: !!bid,
    queryFn: async () => {
      const { data } = await supabase.from("inventory_items").select("id, name, unit, cost_cents").eq("business_id", bid!).order("name");
      return (data ?? []) as InventoryItem[];
    },
  });

  const { data: recipeStats } = useQuery({
    queryKey: ["service-recipe-stats", bid],
    enabled: !!bid,
    queryFn: async () => {
      const { data } = await supabase
        .from("service_recipe_items")
        .select("service_id, quantity, inventory_items(cost_cents)")
        .eq("business_id", bid!);
      const counts: Record<string, number> = {};
      const costs: Record<string, number> = {};
      (data ?? []).forEach((r: any) => {
        counts[r.service_id] = (counts[r.service_id] || 0) + 1;
        const c = Number(r.inventory_items?.cost_cents ?? 0) * Number(r.quantity ?? 0);
        costs[r.service_id] = (costs[r.service_id] || 0) + c;
      });
      return { counts, costs };
    },
  });
  const recipeCounts = recipeStats?.counts;
  const serviceCost = recipeStats?.costs ?? {};

  const inventoryById = (id: string) => inventory?.find((i) => i.id === id);
  const isDiscreteUnit = (item?: InventoryItem) => {
    const u = item?.unit?.trim().toLowerCase();
    return u === "bottle" || u === "unit";
  };
  const defaultQtyFor = (item?: InventoryItem) => (isDiscreteUnit(item) ? 1 : 30);
  const stepFor = (item?: InventoryItem) => (isDiscreteUnit(item) ? 1 : 5);
  const recipeCostPreview = recipe.reduce((sum, r) => {
    const item = inventoryById(r.inventory_item_id);
    return sum + Number(r.quantity) * (item?.cost_cents ?? 0);
  }, 0);

  // Load linked staff + recipe whenever editing existing
  useEffect(() => {
    if (edit?.id) {
      supabase.from("service_staff").select("staff_id").eq("service_id", edit.id).then(({ data }) => {
        setLinked(new Set((data ?? []).map((r: any) => r.staff_id)));
      });
      supabase.from("service_recipe_items").select("inventory_item_id, quantity").eq("service_id", edit.id).then(({ data }) => {
        setRecipe((data ?? []).map((r: any) => ({ inventory_item_id: r.inventory_item_id, quantity: Number(r.quantity) })));
      });
    } else if (edit) {
      setLinked(new Set());
      setRecipe([]);
    }
  }, [edit?.id]);



  const save = async () => {
    if (!edit || !bid) return;
    if (!edit.name) return toast.error("Name is required");
    if (!(Number(edit.duration_minutes) > 0)) return toast.error("Duration must be greater than 0 minutes");
    const payload: any = {
      business_id: bid,
      name: edit.name,
      description: edit.description ?? null,
      duration_minutes: Number(edit.duration_minutes),
      price_cents: Math.round(Number(edit.price_cents) || 0),
      buffer_before_min: Number(edit.buffer_before_min) || 0,
      buffer_after_min: Number(edit.buffer_after_min) || 0,
      color: edit.color ?? null,
      category: edit.category?.trim() || null,
      active: edit.active ?? true,
      currency: biz?.currency ?? "GBP",
    };
    const { data, error } = edit.id
      ? await supabase.from("services").update(payload).eq("id", edit.id).select("id").single()
      : await supabase.from("services").insert(payload).select("id").single();
    if (error) return toast.error(error.message);
    const sid = data!.id;
    // sync staff
    await supabase.from("service_staff").delete().eq("service_id", sid);
    if (linked.size > 0) {
      await supabase.from("service_staff").insert(Array.from(linked).map((staff_id) => ({ service_id: sid, staff_id, business_id: bid })));
    }
    // sync recipe
    await supabase.from("service_recipe_items").delete().eq("service_id", sid);
    if (recipe.length > 0) {
      await supabase.from("service_recipe_items").insert(
        recipe.map((r) => ({ service_id: sid, business_id: bid, inventory_item_id: r.inventory_item_id, quantity: r.quantity }))
      );
    }
    toast.success(edit.id ? "Service updated" : "Service created");
    setEdit(null);
    qc.invalidateQueries({ queryKey: ["services"] });
    qc.invalidateQueries({ queryKey: ["service-recipe-stats", bid] });
    qc.invalidateQueries({ queryKey: ["slots-day"] });

  };

  const toggleArchive = async (s: Service) => {
    const archived = !s.archived_at;
    const { error } = await supabase
      .from("services")
      .update({ archived_at: archived ? new Date().toISOString() : null, active: !archived } as any)
      .eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success(archived ? "Service archived" : "Service restored");
    qc.invalidateQueries({ queryKey: ["services"] });
  };

  const del = async (id: string) => {
    const { error } = await supabase.from("services").delete().eq("id", id);
    if (error) {
      // Likely FK violation — guide toward archive.
      toast.error("This service has bookings — archive it instead.");
      return;
    }
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
          <Button onClick={() => setEdit({ active: true, duration_minutes: 60, buffer_before_min: 0, buffer_after_min: 0, color: COLORS[0] })} className="shadow-glow">
            <Plus className="h-4 w-4 mr-1" /> New service
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : services?.length === 0 ? (
        <EmptyState
          icon={Scissors}
          title="No services yet"
          description="Create your first offering — a haircut, a 60-minute massage, an intro consult."
          action={
            <Button onClick={() => setEdit({ active: true, duration_minutes: 60, buffer_before_min: 0, buffer_after_min: 0, color: COLORS[0] })}>
              <Plus className="h-4 w-4 mr-1" /> Add your first service
            </Button>
          }
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {services?.map((s, i) => {
            const isArchived = !!s.archived_at;
            return (
              <div
                key={s.id}
                className={`group rounded-xl border bg-card p-5 card-hover animate-rise stagger-${(i % 6) + 1} relative overflow-hidden ${isArchived ? "opacity-60" : ""}`}
              >
                {s.color && <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: s.color }} />}
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-display text-xl truncate">{s.name}</h3>
                      {s.category && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                          <Tag className="h-2.5 w-2.5" />{s.category}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1.5">
                      <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{s.duration_minutes} min</span>
                      <span className="inline-flex items-center gap-1"><DollarSign className="h-3 w-3" />{fmtMoney(s.price_cents)}</span>
                      {(s.buffer_before_min > 0 || s.buffer_after_min > 0) && (
                        <span className="text-muted-foreground/80">+{s.buffer_before_min}/{s.buffer_after_min}m buffer</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-2 rounded-lg hover:bg-secondary" onClick={() => setEdit(s)} aria-label="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="p-2 rounded-lg hover:bg-secondary"
                      onClick={() => toggleArchive(s)}
                      aria-label={isArchived ? "Restore" : "Archive"}
                      title={isArchived ? "Restore" : "Archive"}
                    >
                      {isArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                    </button>
                    <ConfirmDialog
                      trigger={
                        <button className="p-2 rounded-lg hover:bg-destructive/10 hover:text-destructive" aria-label="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      }
                      title="Delete this service?"
                      description="If it has bookings, archive it instead to preserve history."
                      onConfirm={async () => { await del(s.id); }}
                    />
                  </div>
                </div>
                {s.description && (
                  <p className="text-sm text-muted-foreground mt-3 line-clamp-2 text-pretty">{s.description}</p>
                )}
                {recipeCounts?.[s.id] ? (
                  <p className="text-[11px] text-muted-foreground mt-2 inline-flex items-center gap-1">
                    <Package className="h-3 w-3" />{recipeCounts[s.id]} product{recipeCounts[s.id] === 1 ? "" : "s"}
                  </p>
                ) : null}
                {(() => {
                  const cost = Number(serviceCost[s.id] || 0);
                  const profit = Number(s.price_cents || 0) - cost;
                  const margin = s.price_cents > 0 ? (profit / s.price_cents) * 100 : 0;
                  return (
                    <div className="mt-3 grid grid-cols-3 gap-1.5 rounded-lg border bg-secondary/30 px-2.5 py-2 text-[11px]">
                      <div>
                        <div className="text-muted-foreground">Cost</div>
                        <div className="tabular-nums font-medium">{fmtMoney(cost)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Profit</div>
                        <div className={`tabular-nums font-medium ${profit < 0 ? "text-destructive" : ""}`}>{fmtMoney(profit)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Margin</div>
                        <div className={`tabular-nums font-medium ${profit < 0 ? "text-destructive" : ""}`}>{s.price_cents > 0 ? `${margin.toFixed(0)}%` : "—"}</div>
                      </div>
                    </div>
                  );
                })()}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {isArchived && <Badge variant="secondary">Archived</Badge>}
                  {!isArchived && !s.active && <Badge variant="secondary">Hidden</Badge>}
                </div>

              </div>
            );
          })}

        </div>
      )}

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto">
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
            <div>
              <Label>Category</Label>
              <Input value={edit?.category ?? ""} onChange={(e) => setEdit({ ...edit, category: e.target.value })} className="mt-1.5 h-10" placeholder="Hair, Nails, Skincare…" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Duration (min)</Label>
                <Input type="number" min={5} step={5} value={edit?.duration_minutes ?? 60} onChange={(e) => setEdit({ ...edit, duration_minutes: Number(e.target.value) })} className="mt-1.5 h-10" />
              </div>
              <div>
                <Label>Price ({biz?.currency ?? "GBP"})</Label>
                <Input type="number" min={0} step="0.01" value={(edit?.price_cents ?? 0) / 100} onChange={(e) => setEdit({ ...edit, price_cents: Math.round((parseFloat(e.target.value) || 0) * 100) })} className="mt-1.5 h-10" />
                <p className="text-[11px] text-muted-foreground mt-1">{fmtMoney(Number(edit?.price_cents) || 0)}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Buffer before (min)</Label>
                <Input type="number" min={0} step={5} value={edit?.buffer_before_min ?? 0} onChange={(e) => setEdit({ ...edit, buffer_before_min: Number(e.target.value) })} className="mt-1.5 h-10" />
              </div>
              <div>
                <Label>Buffer after (min)</Label>
                <Input type="number" min={0} step={5} value={edit?.buffer_after_min ?? 0} onChange={(e) => setEdit({ ...edit, buffer_after_min: Number(e.target.value) })} className="mt-1.5 h-10" />
              </div>
            </div>
            <div>
              <Label>Calendar color</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {COLORS.map((c) => (
                  <button key={c} type="button" onClick={() => setEdit({ ...edit, color: c })}
                    className={`h-7 w-7 rounded-full border-2 transition-all ${edit?.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ background: c }} aria-label={c}
                  />
                ))}
              </div>
            </div>
            {allStaff && allStaff.length > 0 && (
              <div>
                <Label>Staff that perform this</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">Leave empty to let any staff perform it.</p>
                <div className="flex flex-wrap gap-1.5">
                  {allStaff.map((st) => {
                    const on = linked.has(st.id);
                    return (
                      <button
                        key={st.id} type="button"
                        onClick={() => {
                          const next = new Set(linked);
                          if (on) next.delete(st.id); else next.add(st.id);
                          setLinked(next);
                        }}
                        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                          on ? "bg-primary text-primary-foreground border-transparent" : "bg-card hover:bg-secondary/60"
                        }`}
                      >
                        {on && <Check className="h-3 w-3" />}
                        {st.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <Label>Products used</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">Automatically deducted from stock whenever a booking for this service is marked completed.</p>
              {inventory && inventory.length > 0 ? (
                <div className="rounded-xl border bg-secondary/30 p-3 space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {inventory.map((i) => {
                      const on = recipe.some((r) => r.inventory_item_id === i.id);
                      return (
                        <button
                          key={i.id}
                          type="button"
                          onClick={() => {
                            if (on) {
                              setRecipe(recipe.filter((r) => r.inventory_item_id !== i.id));
                            } else {
                              setRecipe([...recipe, { inventory_item_id: i.id, quantity: defaultQtyFor(i) }]);
                            }
                          }}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                            on ? "bg-primary/10 border-primary text-primary" : "bg-card hover:bg-secondary/60"
                          }`}
                        >
                          <Package className="h-3 w-3" />
                          {i.name}
                          {on && <Check className="h-3 w-3" />}
                        </button>
                      );
                    })}
                  </div>

                  {recipe.length > 0 ? (
                    <div className="space-y-1.5">
                      {recipe.map((r, idx) => {
                        const item = inventoryById(r.inventory_item_id);
                        const step = stepFor(item);
                        return (
                          <div key={idx} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                            <span className="flex-1 truncate">{item?.name ?? "Unknown item"}</span>
                            <div className="inline-flex items-center rounded-full border overflow-hidden">
                              <button
                                type="button"
                                onClick={() =>
                                  setRecipe(recipe.map((x, i) => (i === idx ? { ...x, quantity: Math.max(0, x.quantity - step) } : x)))
                                }
                                className="h-6 w-6 flex items-center justify-center hover:bg-secondary/60"
                                aria-label="Decrease"
                              >
                                −
                              </button>
                              <span className="w-px h-3 bg-border" />
                              <button
                                type="button"
                                onClick={() => setRecipe(recipe.map((x, i) => (i === idx ? { ...x, quantity: x.quantity + step } : x)))}
                                className="h-6 w-6 flex items-center justify-center hover:bg-secondary/60"
                                aria-label="Increase"
                              >
                                +
                              </button>
                            </div>
                            <span className="text-muted-foreground tabular-nums w-16 text-right">
                              {r.quantity}{item?.unit ? ` ${item.unit}` : ""}
                            </span>
                            <button
                              type="button"
                              onClick={() => setRecipe(recipe.filter((_, i) => i !== idx))}
                              className="p-1 rounded hover:bg-destructive/10 hover:text-destructive"
                              aria-label="Remove"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic px-1">No products selected yet — tap one above.</p>
                  )}

                  {recipeCostPreview > 0 && (
                    <div className="flex items-center justify-between rounded-lg bg-emerald-500/10 px-3 py-2 text-xs">
                      <span className="text-muted-foreground">Estimated product cost per booking</span>
                      <span className="font-semibold tabular-nums">{fmtMoney(recipeCostPreview)}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No inventory items yet — add some in Stock first.</p>
              )}
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
