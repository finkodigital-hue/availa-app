import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Pencil, Trash2, Package, TrendingUp, TrendingDown } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
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

function StockPage() {
  const { data: biz } = useMyBusiness();
  const bid = biz?.id;
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Partial<InventoryItem> | null>(null);
  const [adjust, setAdjust] = useState<InventoryItem | null>(null);
  const [adjustDelta, setAdjustDelta] = useState<string>("");

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
    const payload: any = {
      business_id: bid,
      name: edit.name.trim(),
      brand: edit.brand?.toString().trim() || null,
      unit: edit.unit?.toString().trim() || null,
      current_stock: Number(edit.current_stock) || 0,
      low_stock_threshold:
        edit.low_stock_threshold === null ||
        edit.low_stock_threshold === undefined ||
        (edit.low_stock_threshold as any) === ""
          ? null
          : Number(edit.low_stock_threshold),
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

  const remove = async (id: string) => {
    const { error } = await supabase.from("inventory_items").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Item deleted");
    invalidate();
  };

  const applyAdjust = async () => {
    if (!adjust) return;
    const delta = Number(adjustDelta);
    if (!Number.isFinite(delta) || delta === 0) {
      toast.error("Enter a non-zero amount");
      return;
    }
    const next = Number(adjust.current_stock) + delta;
    const { error } = await supabase
      .from("inventory_items")
      .update({ current_stock: next })
      .eq("id", adjust.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Stock updated to ${next}`);
    setAdjust(null);
    setAdjustDelta("");
    invalidate();
  };

  const isLow = (i: InventoryItem) =>
    i.low_stock_threshold !== null &&
    Number(i.current_stock) <= Number(i.low_stock_threshold);

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock"
        subtitle="Track inventory manually per business."
        action={
          <Button onClick={() => setEdit({ current_stock: 0 })}>
            <Plus className="h-4 w-4 mr-2" /> Add item
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
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
      ) : (
        <div className="grid gap-3">
          {items.map((i) => (
            <div
              key={i.id}
              className="rounded-lg border bg-card p-4 flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">{i.name}</span>
                  {i.brand && (
                    <span className="text-sm text-muted-foreground">· {i.brand}</span>
                  )}
                  {isLow(i) && <Badge variant="destructive">Low</Badge>}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {Number(i.current_stock)} {i.unit || "units"}
                  {i.low_stock_threshold !== null && (
                    <span className="ml-2">
                      · threshold {Number(i.low_stock_threshold)}
                    </span>
                  )}
                  {i.cost_cents !== null && (
                    <span className="ml-2">· ${(i.cost_cents / 100).toFixed(2)}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAdjust(i);
                    setAdjustDelta("");
                  }}
                >
                  Adjust
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setEdit(i)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="icon">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  }
                  title="Delete item?"
                  description={`This will permanently remove "${i.name}".`}
                  confirmLabel="Delete"
                  onConfirm={() => remove(i.id)}
                />
              </div>
            </div>
          ))}
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
                <Input
                  value={edit?.unit ?? ""}
                  onChange={(e) => setEdit({ ...edit, unit: e.target.value })}
                  placeholder="ml, g, bottle…"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Current stock</Label>
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
                  onChange={(e) =>
                    setEdit({ ...edit, low_stock_threshold: e.target.value as any })
                  }
                />
              </div>
            </div>
            <div>
              <Label>Cost (cents)</Label>
              <Input
                type="number"
                value={edit?.cost_cents ?? ""}
                onChange={(e) => setEdit({ ...edit, cost_cents: e.target.value as any })}
                placeholder="e.g. 1200 for $12.00"
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
            <DialogTitle>Adjust stock</DialogTitle>
            <DialogDescription>
              {adjust?.name} — current: {adjust ? Number(adjust.current_stock) : 0}{" "}
              {adjust?.unit || ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Change (use negative to remove)</Label>
              <Input
                type="number"
                value={adjustDelta}
                onChange={(e) => setAdjustDelta(e.target.value)}
                placeholder="e.g. 5 or -2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjust(null)}>
              Cancel
            </Button>
            <Button onClick={applyAdjust}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
