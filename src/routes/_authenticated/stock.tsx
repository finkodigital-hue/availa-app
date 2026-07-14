import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Package, TrendingUp, TrendingDown, Search, MoreVertical, Minus, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { fmtMoney } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/stock")({
  component: StockPage,
});

type InventoryItem = {
  id: string;
  business_id: string;
  name: string;
  brand: string | null;
  unit: string | null;
  current_stock: number;
  low_stock_threshold: number | null;
  cost_cents: number | null;
};

const UNIT_PRESETS = ["ml", "g", "unit", "bottle"];

type StockState = "ok" | "low" | "out";

function stockState(i: InventoryItem): StockState {
  const stock = Number(i.current_stock);
  if (stock <= 0) return "out";
  if (i.low_stock_threshold !== null && stock <= Number(i.low_stock_threshold)) return "low";
  return "ok";
}

function gaugePct(i: InventoryItem) {
  const stock = Number(i.current_stock);
  const par = i.low_stock_threshold !== null ? Math.max(Number(i.low_stock_threshold) * 2.2, 1) : Math.max(stock, 1);
  return Math.max(stock > 0 ? 4 : 0, Math.min(100, Math.round((stock / par) * 100)));
}

const STATE_META: Record<StockState, { label: string; barClass: string; pillClass: string; borderClass: string }> = {
  ok: {
    label: "Healthy",
    barClass: "bg-emerald-500",
    pillClass: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
    borderClass: "border-l-emerald-500/70",
  },
  low: {
    label: "Running low",
    barClass: "bg-brass",
    pillClass: "bg-brass/20 text-[oklch(0.4_0.08_75)] dark:text-brass",
    borderClass: "border-l-brass",
  },
  out: {
    label: "Out of stock",
    barClass: "bg-destructive",
    pillClass: "bg-destructive/12 text-destructive",
    borderClass: "border-l-destructive",
  },
};

function StockPage() {
  const { data: biz } = useMyBusiness();
  const bid = biz?.id;
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Partial<InventoryItem> | null>(null);
  const [adjust, setAdjust] = useState<InventoryItem | null>(null);
  const [adjustDelta, setAdjustDelta] = useState<string>("");
  const [pendingDelete, setPendingDelete] = useState<InventoryItem | null>(null);
  const [search, setSearch] = useState("");
  const [onlyAttention, setOnlyAttention] = useState(false);

  const { data: items, isLoading } = useQuery({
    queryKey: ["inventory_items", bid],
    enabled: !!bid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_items")
        .select("*")
        .eq("business_id", bid!)
        .order("name", { ascending: true });
      if (error) throw error;
      return data as InventoryItem[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["inventory_items", bid] });

  const save = async () => {
    if (!edit || !bid) return;
    if (!edit.name?.trim()) {
      toast.error("Name is required");
      return;
    }
    const stock = Number(edit.current_stock) || 0;
    const thresholdBlank =
      edit.low_stock_threshold === null ||
      edit.low_stock_threshold === undefined ||
      (edit.low_stock_threshold as any) === "";
    // New items left blank get a sensible default (20% of starting stock) so
    // low-stock warnings work out of the box; existing items stay untouched.
    const defaultThreshold = !edit.id && thresholdBlank && stock > 0 ? Math.max(1, Math.round(stock * 0.2)) : null;
    const payload: any = {
      business_id: bid,
      name: edit.name.trim(),
      brand: edit.brand?.toString().trim() || null,
      unit: edit.unit?.toString().trim() || null,
      current_stock: stock,
      low_stock_threshold: thresholdBlank ? defaultThreshold : Number(edit.low_stock_threshold),
      cost_cents:
        edit.cost_cents === null ||
        edit.cost_cents === undefined ||
        (edit.cost_cents as any) === ""
          ? null
          : Math.round(Number(edit.cost_cents)),
    };
    const { error } = edit.id
      ? await supabase.from("inventory_items").update(payload).eq("id", edit.id)
      : await supabase.from("inventory_items").insert(payload);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(edit.id ? "Item updated" : "Item added");
    setEdit(null);
    invalidate();
  };

  const remove = async (id: string, name: string) => {
    const { error } = await supabase.from("inventory_items").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Deleted "${name}"`);
    invalidate();
  };

  const nudge = async (i: InventoryItem, delta: number) => {
    const next = Math.max(0, Number(i.current_stock) + delta);
    qc.setQueryData<InventoryItem[]>(["inventory_items", bid], (old) =>
      old?.map((x) => (x.id === i.id ? { ...x, current_stock: next } : x)),
    );
    const { error } = await supabase.from("inventory_items").update({ current_stock: next }).eq("id", i.id);
    if (error) {
      toast.error(error.message);
      invalidate();
      return;
    }
    invalidate();
  };

  const stepFor = (i: InventoryItem) => {
    const u = i.unit?.trim().toLowerCase();
    return u === "bottle" || u === "unit" ? 1 : 5;
  };

  const applyAdjust = async () => {
    if (!adjust) return;
    const delta = Number(adjustDelta);
    if (!Number.isFinite(delta) || delta === 0) {
      toast.error("Enter a non-zero amount");
      return;
    }
    const next = Math.max(0, Number(adjust.current_stock) + delta);
    const { error } = await supabase
      .from("inventory_items")
      .update({ current_stock: next })
      .eq("id", adjust.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Stock updated to ${next}${adjust.unit ? ` ${adjust.unit}` : ""}`);
    setAdjust(null);
    setAdjustDelta("");
    invalidate();
  };

  const { data: profitability } = useQuery({
    queryKey: ["service-profitability", bid],
    enabled: !!bid,
    queryFn: async () => {
      const [{ data: services }, { data: recipes }] = await Promise.all([
        supabase.from("services").select("id, name, price_cents").eq("business_id", bid!).is("archived_at", null),
        supabase.from("service_recipe_items").select("service_id, quantity, inventory_items(cost_cents)").eq("business_id", bid!),
      ]);
      const costs: Record<string, number> = {};
      (recipes ?? []).forEach((r: any) => {
        const c = Number(r.inventory_items?.cost_cents ?? 0) * Number(r.quantity ?? 0);
        costs[r.service_id] = (costs[r.service_id] || 0) + c;
      });
      return (services ?? []).map((s: any) => {
        const cost = costs[s.id] || 0;
        const profit = Number(s.price_cents || 0) - cost;
        const margin = s.price_cents > 0 ? (profit / s.price_cents) * 100 : 0;
        return { id: s.id, name: s.name, price: s.price_cents, cost, profit, margin };
      });
    },
  });

  const ranked = (profitability ?? []).filter((s) => s.price > 0);
  const mostProfitable = [...ranked].sort((a, b) => b.profit - a.profit).slice(0, 3);
  const leastProfitable = [...ranked].sort((a, b) => a.profit - b.profit).slice(0, 3);

  const needingAttention = useMemo(() => (items ?? []).filter((i) => stockState(i) !== "ok"), [items]);
  const inventoryValue = useMemo(
    () => (items ?? []).reduce((sum, i) => sum + Number(i.current_stock) * (i.cost_cents ?? 0), 0),
    [items],
  );

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items ?? []).filter((i) => {
      if (onlyAttention && stockState(i) === "ok") return false;
      if (q && !(i.name.toLowerCase().includes(q) || (i.brand ?? "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [items, search, onlyAttention]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock"
        subtitle="What's on the shelf, at a glance."
        action={
          <Button onClick={() => setEdit({ current_stock: 0 })}>
            <Plus className="h-4 w-4 mr-2" /> Add item
          </Button>
        }
      />

      {items && items.length > 0 && (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="text-2xl font-display font-bold tabular-nums">{items.length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Products tracked</div>
          </div>
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div
              className={`text-2xl font-display font-bold tabular-nums ${needingAttention.length > 0 ? "text-[oklch(0.4_0.08_75)] dark:text-brass" : ""}`}
            >
              {needingAttention.length}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">Need attention</div>
          </div>
          <div className="rounded-2xl border bg-card p-4 shadow-sm col-span-2 sm:col-span-1">
            <div className="text-2xl font-display font-bold tabular-nums text-primary">{fmtMoney(inventoryValue)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Inventory value</div>
          </div>
        </div>
      )}

      {ranked.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 mb-3 text-sm font-medium">
              <TrendingUp className="h-4 w-4 text-emerald-500" /> Most profitable services
            </div>
            <ol className="space-y-2 text-sm">
              {mostProfitable.map((s, idx) => (
                <li key={s.id} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-4">{idx + 1}.</span>
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className="tabular-nums font-medium">{fmtMoney(s.profit)}</span>
                  <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">{s.margin.toFixed(0)}%</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 mb-3 text-sm font-medium">
              <TrendingDown className="h-4 w-4 text-amber-500" /> Least profitable services
            </div>
            <ol className="space-y-2 text-sm">
              {leastProfitable.map((s, idx) => (
                <li key={s.id} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-4">{idx + 1}.</span>
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className={`tabular-nums font-medium ${s.profit < 0 ? "text-destructive" : ""}`}>{fmtMoney(s.profit)}</span>
                  <span className={`text-xs tabular-nums w-10 text-right ${s.profit < 0 ? "text-destructive" : "text-muted-foreground"}`}>{s.margin.toFixed(0)}%</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {items && items.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex-1 min-w-[200px] flex items-center gap-2 rounded-full border bg-card px-4 py-2">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or brand…"
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            />
          </div>
          <button
            type="button"
            onClick={() => setOnlyAttention((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              onlyAttention
                ? "bg-brass/20 border-transparent text-[oklch(0.4_0.08_75)] dark:text-brass"
                : "bg-card text-muted-foreground hover:bg-secondary/60"
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" /> Needs attention only
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 w-full rounded-2xl" />
          ))}
        </div>
      ) : !items || items.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No stock items yet"
          description="Add products, tools, or consumables you want to track."
          action={
            <Button onClick={() => setEdit({ current_stock: 0 })}>
              <Plus className="h-4 w-4 mr-2" /> Add item
            </Button>
          }
        />
      ) : visibleItems.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No items match your search.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleItems.map((i) => {
            const state = stockState(i);
            const meta = STATE_META[state];
            const step = stepFor(i);
            return (
              <div
                key={i.id}
                className={`rounded-2xl border border-l-[3px] bg-card p-4 shadow-sm flex flex-col gap-3 ${meta.borderClass}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{i.name}</div>
                    {i.brand && <div className="text-xs text-muted-foreground truncate">{i.brand}</div>}
                  </div>
                  <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full ${meta.pillClass}`}>
                    {meta.label}
                  </span>
                </div>

                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${meta.barClass}`}
                    style={{ width: `${gaugePct(i)}%` }}
                  />
                </div>

                <div className="flex items-baseline justify-between">
                  <div className="font-display text-xl font-bold tabular-nums">
                    {Number(i.current_stock)}
                    <span className="text-xs font-sans font-medium text-muted-foreground ml-1">{i.unit || "units"}</span>
                  </div>
                  {i.low_stock_threshold !== null && (
                    <div className="text-[11px] text-muted-foreground">warns below {Number(i.low_stock_threshold)}</div>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <div className="inline-flex items-center rounded-full border overflow-hidden">
                    <button
                      type="button"
                      onClick={() => nudge(i, -step)}
                      className="h-7 w-7 flex items-center justify-center hover:bg-secondary/60"
                      aria-label={`Decrease by ${step}`}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-px h-4 bg-border" />
                    <button
                      type="button"
                      onClick={() => nudge(i, step)}
                      className="h-7 w-7 flex items-center justify-center hover:bg-secondary/60"
                      aria-label={`Increase by ${step}`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setAdjust(i);
                      setAdjustDelta("");
                    }}
                  >
                    Adjust
                  </Button>
                  <div className="flex-1" />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEdit(i)}>
                        <Pencil className="h-3.5 w-3.5 mr-2" /> Edit item
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setPendingDelete(i)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete item
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Edit item" : "Add item"}</DialogTitle>
            <DialogDescription>Track a product or consumable.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input
                value={edit?.name ?? ""}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                placeholder="e.g. Shampoo"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Brand</Label>
                <Input
                  value={edit?.brand ?? ""}
                  onChange={(e) => setEdit({ ...edit, brand: e.target.value })}
                />
              </div>
              <div>
                <Label>Unit</Label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {UNIT_PRESETS.map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setEdit({ ...edit, unit: u })}
                      className={`text-xs rounded-full border px-3 py-1.5 font-medium transition-colors ${
                        edit?.unit === u ? "bg-primary text-primary-foreground border-transparent" : "hover:bg-secondary/60"
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
                <Input
                  className="mt-1.5"
                  value={edit?.unit ?? ""}
                  onChange={(e) => setEdit({ ...edit, unit: e.target.value })}
                  placeholder="or type a custom unit"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Starting stock</Label>
                <Input
                  type="number"
                  value={edit?.current_stock ?? 0}
                  onChange={(e) =>
                    setEdit({ ...edit, current_stock: e.target.value as any })
                  }
                />
              </div>
              <div>
                <Label>Low stock threshold</Label>
                <Input
                  type="number"
                  value={edit?.low_stock_threshold ?? ""}
                  placeholder={edit?.id ? "" : "Defaults to 20% of stock"}
                  onChange={(e) =>
                    setEdit({ ...edit, low_stock_threshold: e.target.value as any })
                  }
                />
              </div>
            </div>
            {!edit?.id && (
              <p className="text-xs text-muted-foreground -mt-1">
                {(() => {
                  const stock = Number(edit?.current_stock) || 0;
                  const blank =
                    edit?.low_stock_threshold === null || edit?.low_stock_threshold === undefined || (edit?.low_stock_threshold as any) === "";
                  const shown = blank ? (stock > 0 ? Math.max(1, Math.round(stock * 0.2)) : null) : Number(edit?.low_stock_threshold);
                  return shown !== null
                    ? `You'll see a "running low" warning once stock drops below ${shown}${edit?.unit ? ` ${edit.unit}` : ""}.`
                    : `Add a starting stock amount to get a suggested threshold.`;
                })()}
              </p>
            )}
            <div>
              <Label>Cost ($)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={(edit?.cost_cents as any) === "" || edit?.cost_cents === null || edit?.cost_cents === undefined ? "" : Number(edit.cost_cents) / 100}
                onChange={(e) =>
                  setEdit({ ...edit, cost_cents: e.target.value === "" ? "" : Math.round(parseFloat(e.target.value) * 100) as any })
                }
                placeholder="e.g. 12.00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>
              Cancel
            </Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!adjust} onOpenChange={(o) => !o && setAdjust(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust — {adjust?.name}</DialogTitle>
            <DialogDescription>
              Current: {adjust ? Number(adjust.current_stock) : 0} {adjust?.unit || ""}. Life happens — spills, waste,
              freebies, restocks.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: `+50 restock`, delta: 50 },
                { label: `+10`, delta: 10 },
                { label: `−5`, delta: -5 },
                { label: `−1`, delta: -1 },
              ].map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => setAdjustDelta(String(c.delta))}
                  className="text-xs rounded-full border px-3 py-1.5 font-medium hover:bg-secondary/60"
                >
                  {c.label} {adjust?.unit || ""}
                </button>
              ))}
            </div>
            <div>
              <Label>Or enter an exact change (use negative to remove)</Label>
              <Input
                type="number"
                value={adjustDelta}
                onChange={(e) => setAdjustDelta(e.target.value)}
                placeholder="e.g. 5 or -2"
              />
            </div>
            {adjust && adjustDelta !== "" && Number.isFinite(Number(adjustDelta)) && (
              <p className="text-xs text-muted-foreground">
                New total: <span className="font-medium text-foreground">{Math.max(0, Number(adjust.current_stock) + Number(adjustDelta))}</span>{" "}
                {adjust.unit || ""}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjust(null)}>
              Cancel
            </Button>
            <Button onClick={applyAdjust}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl">Delete item?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove "{pendingDelete?.name}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async (e) => {
                e.preventDefault();
                if (pendingDelete) await remove(pendingDelete.id, pendingDelete.name);
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
