import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ComponentType } from "react";
import {
  AlertTriangle,
  Box,
  Coins,
  Droplets,
  MoreHorizontal,
  Minus,
  Package,
  Pencil,
  Plus,
  Scissors,
  Search,
  SlidersHorizontal,
  Trash2,
  Wrench,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { StockAiScanner, type ReviewedStockItem } from "@/components/stock-ai-scanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { fmtMoney as formatMoney } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/stock")({
  component: StockPage,
});

type InventoryItem = {
  id: string;
  business_id: string;
  name: string;
  brand: string | null;
  category: string | null;
  unit: string | null;
  current_stock: number;
  low_stock_threshold: number | null;
  cost_cents: number | null;
};

type StockState = "good" | "low" | "out";

const BASE_CATEGORIES = ["Colour", "Hair care", "Salon essentials", "Tools"];
const UNIT_PRESETS = ["unit", "bottle", "tube", "box", "ml", "g"];

const CATEGORY_STYLE: Record<
  string,
  { icon: ComponentType<{ className?: string }>; tint: string }
> = {
  Colour: { icon: Droplets, tint: "bg-violet-50 text-violet-700" },
  "Hair care": { icon: Box, tint: "bg-emerald-50 text-emerald-700" },
  "Salon essentials": { icon: Scissors, tint: "bg-orange-50 text-orange-700" },
  Tools: { icon: Wrench, tint: "bg-sky-50 text-sky-700" },
  Other: { icon: Package, tint: "bg-secondary text-muted-foreground" },
};

const DEMO_ITEMS: InventoryItem[] = [
  {
    id: "demo-1",
    business_id: "demo",
    name: "Illumina Color 7/1",
    brand: "Wella Professionals",
    category: "Colour",
    unit: "tubes",
    current_stock: 18,
    low_stock_threshold: 6,
    cost_cents: 745,
  },
  {
    id: "demo-2",
    business_id: "demo",
    name: "Koleston Perfect 6/0",
    brand: "Wella Professionals",
    category: "Colour",
    unit: "tubes",
    current_stock: 9,
    low_stock_threshold: 6,
    cost_cents: 680,
  },
  {
    id: "demo-3",
    business_id: "demo",
    name: "Vibrance 6.34",
    brand: "Schwarzkopf",
    category: "Colour",
    unit: "bottles",
    current_stock: 4,
    low_stock_threshold: 6,
    cost_cents: 820,
  },
  {
    id: "demo-4",
    business_id: "demo",
    name: "Moisture Repair Shampoo",
    brand: "L’Oréal Professionnel",
    category: "Hair care",
    unit: "bottles",
    current_stock: 12,
    low_stock_threshold: 5,
    cost_cents: 1120,
  },
  {
    id: "demo-5",
    business_id: "demo",
    name: "Blond Absolu Masque",
    brand: "Kérastase",
    category: "Hair care",
    unit: "jars",
    current_stock: 5,
    low_stock_threshold: 5,
    cost_cents: 2150,
  },
  {
    id: "demo-6",
    business_id: "demo",
    name: "Oil Reflections Elixir",
    brand: "Wella Professionals",
    category: "Hair care",
    unit: "bottles",
    current_stock: 7,
    low_stock_threshold: 3,
    cost_cents: 1450,
  },
  {
    id: "demo-7",
    business_id: "demo",
    name: "Foil Rolls Silver",
    brand: "Sibel",
    category: "Salon essentials",
    unit: "rolls",
    current_stock: 24,
    low_stock_threshold: 6,
    cost_cents: 925,
  },
  {
    id: "demo-8",
    business_id: "demo",
    name: "Developer 20 Vol",
    brand: "L’Oréal Professionnel",
    category: "Salon essentials",
    unit: "litres",
    current_stock: 6,
    low_stock_threshold: 8,
    cost_cents: 980,
  },
  {
    id: "demo-9",
    business_id: "demo",
    name: "Cotton Pads",
    brand: "BeautyPro",
    category: "Salon essentials",
    unit: "packs",
    current_stock: 3,
    low_stock_threshold: 5,
    cost_cents: 340,
  },
];

function getStockState(item: InventoryItem): StockState {
  if (Number(item.current_stock) <= 0) return "out";
  if (
    item.low_stock_threshold !== null &&
    Number(item.current_stock) <= Number(item.low_stock_threshold)
  )
    return "low";
  return "good";
}

function getCategory(item: InventoryItem) {
  return item.category?.trim() || "Other";
}

function StockPill({ state }: { state: StockState }) {
  const styles = {
    good: "bg-emerald-50 text-emerald-800 before:bg-emerald-500",
    low: "bg-amber-50 text-amber-800 before:bg-amber-500",
    out: "bg-destructive/10 text-destructive before:bg-destructive",
  }[state];
  const label = state === "good" ? "Good" : state === "low" ? "Low" : "Out";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-medium before:h-1.5 before:w-1.5 before:rounded-full ${styles}`}
    >
      {label}
    </span>
  );
}

function StockPage() {
  const { data: biz } = useMyBusiness();
  const bid = biz?.id;
  const qc = useQueryClient();
  const fmtMoney = (cents: number) => formatMoney(cents, biz?.currency ?? "GBP");
  const currencySymbol =
    new Intl.NumberFormat("en-GB", { style: "currency", currency: biz?.currency ?? "GBP" })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value ?? "£";

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [edit, setEdit] = useState<Partial<InventoryItem> | null>(null);
  const [adjust, setAdjust] = useState<InventoryItem | null>(null);
  const [adjustDelta, setAdjustDelta] = useState("");
  const [pendingDelete, setPendingDelete] = useState<InventoryItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [demoItems, setDemoItems] = useState(DEMO_ITEMS);

  const { data: storedItems, isLoading } = useQuery({
    queryKey: ["inventory_items", bid],
    enabled: !!bid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_items")
        .select("*")
        .eq("business_id", bid!)
        .order("name");
      if (error) throw error;
      return data as unknown as InventoryItem[];
    },
  });

  const demoMode =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("demo") === "stock";
  const items = useMemo(
    () => (demoMode && !storedItems?.length ? demoItems : (storedItems ?? [])),
    [demoItems, demoMode, storedItems],
  );
  const invalidate = () => qc.invalidateQueries({ queryKey: ["inventory_items", bid] });

  const categories = useMemo(() => {
    const values = new Set([...BASE_CATEGORIES, ...items.map(getCategory)]);
    return [...values]
      .filter((value) => value !== "Other")
      .concat(values.has("Other") ? ["Other"] : []);
  }, [items]);

  const attentionCount = items.filter((item) => getStockState(item) !== "good").length;
  const inventoryValue = items.reduce(
    (sum, item) => sum + Number(item.current_stock) * Number(item.cost_cents ?? 0),
    0,
  );

  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      if (category !== "all" && getCategory(item) !== category) return false;
      if (attentionOnly && getStockState(item) === "good") return false;
      return (
        !term ||
        item.name.toLowerCase().includes(term) ||
        (item.brand ?? "").toLowerCase().includes(term)
      );
    });
  }, [attentionOnly, category, items, search]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, InventoryItem[]>();
    visibleItems.forEach((item) =>
      groups.set(getCategory(item), [...(groups.get(getCategory(item)) ?? []), item]),
    );
    return [...groups.entries()].sort(([a], [b]) => {
      const ai = categories.indexOf(a);
      const bi = categories.indexOf(b);
      return ai === bi ? a.localeCompare(b) : ai - bi;
    });
  }, [categories, visibleItems]);

  const openNew = () =>
    setEdit({
      current_stock: 0,
      unit: "unit",
      category: category === "all" ? BASE_CATEGORIES[0] : category,
    });

  const save = async () => {
    if (!edit || !bid || saving) return;
    if (!edit.name?.trim()) return toast.error("Add an item name");
    const quantity = Math.max(0, Number(edit.current_stock) || 0);
    const thresholdBlank =
      edit.low_stock_threshold === null ||
      edit.low_stock_threshold === undefined ||
      (edit.low_stock_threshold as unknown) === "";
    const payload = {
      business_id: bid,
      name: edit.name.trim(),
      brand: edit.brand?.trim() || null,
      category: edit.category?.trim() || "Other",
      unit: edit.unit?.trim() || "unit",
      current_stock: quantity,
      low_stock_threshold: thresholdBlank
        ? quantity
          ? Math.max(1, Math.round(quantity * 0.2))
          : null
        : Math.max(0, Number(edit.low_stock_threshold)),
      cost_cents:
        edit.cost_cents === null ||
        edit.cost_cents === undefined ||
        (edit.cost_cents as unknown) === ""
          ? null
          : Math.max(0, Math.round(Number(edit.cost_cents))),
    };

    if (demoMode && !storedItems?.length) {
      const demoItem: InventoryItem = {
        ...payload,
        id: edit.id ?? `demo-${Date.now()}`,
      };
      setDemoItems((current) =>
        edit.id
          ? current.map((item) => (item.id === edit.id ? demoItem : item))
          : [...current, demoItem],
      );
      toast.success(edit.id ? "Stock item updated" : "Stock item added");
      setEdit(null);
      return;
    }

    setSaving(true);
    const { error } = edit.id
      ? await supabase
          .from("inventory_items")
          .update(payload as never)
          .eq("id", edit.id)
      : await supabase.from("inventory_items").insert(payload as never);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(edit.id ? "Stock item updated" : "Stock item added");
    setEdit(null);
    invalidate();
  };

  const nudge = async (item: InventoryItem, delta: number) => {
    const next = Math.max(0, Number(item.current_stock) + delta);
    if (demoMode && item.id.startsWith("demo-")) {
      setDemoItems((current) =>
        current.map((entry) => (entry.id === item.id ? { ...entry, current_stock: next } : entry)),
      );
      return;
    }
    qc.setQueryData<InventoryItem[]>(["inventory_items", bid], (old) =>
      old?.map((entry) => (entry.id === item.id ? { ...entry, current_stock: next } : entry)),
    );
    const { error } = await supabase
      .from("inventory_items")
      .update({ current_stock: next })
      .eq("id", item.id);
    if (error) {
      toast.error(error.message);
      invalidate();
    }
  };

  const applyAdjustment = async () => {
    if (!adjust || saving) return;
    const delta = Number(adjustDelta);
    if (!Number.isFinite(delta) || delta === 0)
      return toast.error("Enter an amount to add or remove");
    const next = Math.max(0, Number(adjust.current_stock) + delta);
    if (demoMode && adjust.id.startsWith("demo-")) {
      setDemoItems((current) =>
        current.map((item) => (item.id === adjust.id ? { ...item, current_stock: next } : item)),
      );
      toast.success(`Quantity updated to ${next} ${adjust.unit || "units"}`);
      setAdjust(null);
      setAdjustDelta("");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("inventory_items")
      .update({ current_stock: next })
      .eq("id", adjust.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Quantity updated to ${next} ${adjust.unit || "units"}`);
    setAdjust(null);
    setAdjustDelta("");
    invalidate();
  };

  const remove = async (item: InventoryItem) => {
    if (demoMode && item.id.startsWith("demo-")) {
      setDemoItems((current) => current.filter((entry) => entry.id !== item.id));
      toast.success(`${item.name} deleted`);
      return;
    }
    const { error } = await supabase.from("inventory_items").delete().eq("id", item.id);
    if (error) return toast.error(error.message);
    toast.success(`${item.name} deleted`);
    invalidate();
  };

  const applyAiScan = async (reviewed: ReviewedStockItem[]) => {
    if (!bid) throw new Error("Your workspace is still loading. Please try again.");

    if (demoMode && !storedItems?.length) {
      setDemoItems((current) => {
        const next = [...current];
        reviewed.forEach((reviewedItem) => {
          const existingIndex = reviewedItem.existingId
            ? next.findIndex((item) => item.id === reviewedItem.existingId)
            : -1;
          const previous = existingIndex >= 0 ? next[existingIndex] : null;
          const item: InventoryItem = {
            id: previous?.id ?? `demo-${crypto.randomUUID()}`,
            business_id: "demo",
            name: reviewedItem.name,
            brand: reviewedItem.brand || null,
            category: reviewedItem.category || "Other",
            unit: reviewedItem.unit || "unit",
            current_stock: reviewedItem.quantity,
            low_stock_threshold:
              previous?.low_stock_threshold ??
              (reviewedItem.quantity ? Math.max(1, Math.round(reviewedItem.quantity * 0.2)) : null),
            cost_cents: previous?.cost_cents ?? null,
          };
          if (existingIndex >= 0) next[existingIndex] = item;
          else next.push(item);
        });
        return next;
      });
      return;
    }

    const existingById = new Map(items.map((item) => [item.id, item]));
    const payload = reviewed.map((reviewedItem) => {
      const previous = reviewedItem.existingId
        ? existingById.get(reviewedItem.existingId)
        : undefined;
      return {
        id: previous?.id ?? crypto.randomUUID(),
        business_id: bid,
        name: reviewedItem.name,
        brand: reviewedItem.brand || null,
        category: reviewedItem.category || "Other",
        unit: reviewedItem.unit || "unit",
        current_stock: reviewedItem.quantity,
        low_stock_threshold:
          previous?.low_stock_threshold ??
          (reviewedItem.quantity ? Math.max(1, Math.round(reviewedItem.quantity * 0.2)) : null),
        cost_cents: previous?.cost_cents ?? null,
      };
    });
    const { error } = await supabase
      .from("inventory_items")
      .upsert(payload as never, { onConflict: "id" });
    if (error) throw error;
    await invalidate();
  };

  return (
    <div
      className="min-w-0 max-w-full overflow-hidden p-5 sm:p-8 xl:p-10"
      data-premium-page="stock"
    >
      <PageHeader
        eyebrow="Inventory"
        title="Stock"
        subtitle="Your product shelf at a glance."
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <div className="relative sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search stock items…"
                className="h-10 bg-card pl-9"
              />
            </div>
            <StockAiScanner
              businessId={bid}
              plan={biz?.plan}
              demo={demoMode}
              categories={categories}
              existingItems={items}
              onApply={applyAiScan}
            />
            <Button onClick={openNew} className="h-10 shadow-glow">
              <Plus className="mr-2 h-4 w-4" /> Add stock item
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <StockSkeleton />
      ) : items.length === 0 ? (
        <div className="grid min-h-[460px] place-items-center rounded-2xl border bg-card px-6 text-center">
          <div className="max-w-sm">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[color:var(--cream)]">
              <Package className="h-7 w-7" />
            </div>
            <h2 className="mt-5 font-display text-2xl">Build your product shelf</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Add colour, hair care, tools, and salon essentials. We’ll let you know before anything
              runs out.
            </p>
            <Button onClick={openNew} className="mt-6">
              <Plus className="mr-2 h-4 w-4" /> Add your first item
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">
              Stock can be attached to services from the Services page.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {attentionCount > 0 && (
            <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-white text-amber-700">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-medium">
                    {attentionCount} item{attentionCount === 1 ? "" : "s"} need ordering
                  </div>
                  <div className="text-xs text-amber-800/70">Some products are running low.</div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="bg-white"
                onClick={() => setAttentionOnly((value) => !value)}
              >
                {attentionOnly ? "Show all stock" : "Review"}
              </Button>
            </div>
          )}

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-2 overflow-x-auto pb-1">
              <CategoryButton
                active={category === "all"}
                label="All categories"
                icon={Box}
                onClick={() => setCategory("all")}
              />
              {categories.map((name) => (
                <CategoryButton
                  key={name}
                  active={category === name}
                  label={name}
                  icon={(CATEGORY_STYLE[name] ?? CATEGORY_STYLE.Other).icon}
                  onClick={() => setCategory(name)}
                />
              ))}
            </div>
            <div className="flex shrink-0 items-center gap-3 rounded-xl border bg-card px-4 py-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-[color:var(--cream)] text-[color:var(--gold-deep)]">
                <Coins className="h-4 w-4" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Stock value
                </div>
                <div className="text-sm font-semibold tabular-nums">{fmtMoney(inventoryValue)}</div>
              </div>
            </div>
          </div>

          {groupedItems.length === 0 ? (
            <div className="grid min-h-52 place-items-center rounded-2xl border bg-card text-center">
              <div>
                <Search className="mx-auto h-5 w-5 text-muted-foreground" />
                <div className="mt-3 text-sm font-medium">No items found</div>
                <button
                  className="mt-1 text-xs text-primary hover:underline"
                  onClick={() => {
                    setSearch("");
                    setCategory("all");
                    setAttentionOnly(false);
                  }}
                >
                  Clear search and filters
                </button>
              </div>
            </div>
          ) : (
            groupedItems.map(([groupName, groupItems]) => (
              <section key={groupName}>
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="text-lg font-semibold tracking-tight">{groupName}</h2>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                    {groupItems.length} item{groupItems.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {groupItems.map((item) => (
                    <StockCard
                      key={item.id}
                      item={item}
                      onEdit={() => setEdit(item)}
                      onDelete={() => setPendingDelete(item)}
                      onAdjust={() => {
                        setAdjust(item);
                        setAdjustDelta("");
                      }}
                      onNudge={(delta) => nudge(item, delta)}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      )}

      <StockEditor
        edit={edit}
        setEdit={setEdit}
        categories={categories}
        currencySymbol={currencySymbol}
        saving={saving}
        onSave={save}
      />

      <Dialog open={!!adjust} onOpenChange={(open) => !open && setAdjust(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Adjust stock</DialogTitle>
            <DialogDescription>
              {adjust?.name} currently has {Number(adjust?.current_stock ?? 0)}{" "}
              {adjust?.unit || "units"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-4 gap-2">
              {[50, 10, -5, -1].map((delta) => (
                <button
                  key={delta}
                  type="button"
                  onClick={() => setAdjustDelta(String(delta))}
                  className={`rounded-lg border px-2 py-2 text-sm font-medium ${adjustDelta === String(delta) ? "border-foreground bg-foreground text-background" : "hover:bg-secondary/60"}`}
                >
                  {delta > 0 ? `+${delta}` : delta}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="stock-change">Exact change</Label>
              <Input
                id="stock-change"
                type="number"
                value={adjustDelta}
                onChange={(event) => setAdjustDelta(event.target.value)}
                placeholder="Use a minus number to remove stock"
              />
            </div>
            {adjust && adjustDelta && Number.isFinite(Number(adjustDelta)) && (
              <div className="rounded-lg bg-[color:var(--cream)] px-3 py-2 text-sm">
                New quantity:{" "}
                <span className="font-semibold">
                  {Math.max(0, Number(adjust.current_stock) + Number(adjustDelta))}{" "}
                  {adjust.unit || "units"}
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjust(null)}>
              Cancel
            </Button>
            <Button onClick={applyAdjustment} disabled={saving}>
              {saving ? "Updating…" : "Update quantity"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl">
              Delete stock item?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes “{pendingDelete?.name}”. Any services using it will lose that
              stock link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep item</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async (event) => {
                event.preventDefault();
                if (pendingDelete) await remove(pendingDelete);
                setPendingDelete(null);
              }}
            >
              Delete item
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CategoryButton({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors ${active ? "border-foreground bg-foreground text-background shadow-sm" : "bg-card text-muted-foreground hover:text-foreground"}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function StockCard({
  item,
  onEdit,
  onDelete,
  onAdjust,
  onNudge,
}: {
  item: InventoryItem;
  onEdit: () => void;
  onDelete: () => void;
  onAdjust: () => void;
  onNudge: (delta: number) => void;
}) {
  const group = getCategory(item);
  const meta = CATEGORY_STYLE[group] ?? CATEGORY_STYLE.Other;
  const Icon = meta.icon;
  const step = ["unit", "units", "bottle", "bottles", "tube", "tubes", "box", "boxes"].includes(
    (item.unit ?? "").toLowerCase(),
  )
    ? 1
    : 5;
  return (
    <article className="group rounded-2xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-soft">
      <div className="flex items-start gap-3">
        <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-xl ${meta.tint}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium">{item.name}</h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {item.brand || "No brand"}
          </p>
          <div className="mt-3 flex items-end gap-2">
            <span className="font-display text-2xl leading-none tabular-nums">
              {Number(item.current_stock)}
            </span>
            <span className="text-xs text-muted-foreground">{item.unit || "units"}</span>
          </div>
          <div className="mt-2">
            <StockPill state={getStockState(item)} />
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 opacity-70 group-hover:opacity-100"
              aria-label={`Actions for ${item.name}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onAdjust}>
              <SlidersHorizontal className="mr-2 h-3.5 w-3.5" /> Adjust quantity
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="mr-2 h-3.5 w-3.5" /> Edit item
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete item
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mt-4 grid grid-cols-[42px_1fr_42px] overflow-hidden rounded-lg border">
        <button
          type="button"
          onClick={() => onNudge(-step)}
          className="grid h-9 place-items-center hover:bg-secondary/60"
          aria-label={`Remove ${step}`}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onAdjust}
          className="border-x text-xs font-medium hover:bg-secondary/40"
        >
          Adjust
        </button>
        <button
          type="button"
          onClick={() => onNudge(step)}
          className="grid h-9 place-items-center hover:bg-secondary/60"
          aria-label={`Add ${step}`}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </article>
  );
}

function StockEditor({
  edit,
  setEdit,
  categories,
  currencySymbol,
  saving,
  onSave,
}: {
  edit: Partial<InventoryItem> | null;
  setEdit: (value: Partial<InventoryItem> | null) => void;
  categories: string[];
  currencySymbol: string;
  saving: boolean;
  onSave: () => void;
}) {
  const categoryOptions = Array.from(new Set([...BASE_CATEGORIES, ...categories]));
  const categoryValue = edit?.category ?? "";
  const unitValue = edit?.unit ?? "";
  const selectedCategory = categoryOptions.includes(categoryValue) ? categoryValue : "__custom__";
  const selectedUnit = UNIT_PRESETS.includes(unitValue) ? unitValue : "__custom__";

  return (
    <Dialog open={!!edit} onOpenChange={(open) => !open && setEdit(null)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {edit?.id ? "Edit stock item" : "Add stock item"}
          </DialogTitle>
          <DialogDescription>
            Keep the details simple so stock stays easy to manage.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-1">
          <section>
            <div className="mb-3 text-sm font-medium">Product details</div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="stock-name">Name</Label>
                <Input
                  id="stock-name"
                  autoFocus
                  value={edit?.name ?? ""}
                  onChange={(event) => setEdit({ ...edit, name: event.target.value })}
                  placeholder="e.g. Colour developer"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stock-brand">
                  Brand <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="stock-brand"
                  value={edit?.brand ?? ""}
                  onChange={(event) => setEdit({ ...edit, brand: event.target.value })}
                  placeholder="e.g. Wella"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stock-category">Category</Label>
                <Select
                  value={selectedCategory}
                  onValueChange={(value) =>
                    setEdit({ ...edit, category: value === "__custom__" ? "" : value })
                  }
                >
                  <SelectTrigger id="stock-category">
                    <SelectValue placeholder="Choose a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                    <SelectItem value="__custom__">Add a custom category…</SelectItem>
                  </SelectContent>
                </Select>
                {selectedCategory === "__custom__" && (
                  <Input
                    aria-label="Custom category name"
                    value={edit?.category ?? ""}
                    onChange={(event) => setEdit({ ...edit, category: event.target.value })}
                    placeholder="Type your category name"
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="stock-unit">Unit</Label>
                <Select
                  value={selectedUnit}
                  onValueChange={(value) =>
                    setEdit({ ...edit, unit: value === "__custom__" ? "" : value })
                  }
                >
                  <SelectTrigger id="stock-unit">
                    <SelectValue placeholder="Choose a unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_PRESETS.map((unit) => (
                      <SelectItem key={unit} value={unit}>
                        {unit}
                      </SelectItem>
                    ))}
                    <SelectItem value="__custom__">Add a custom unit…</SelectItem>
                  </SelectContent>
                </Select>
                {selectedUnit === "__custom__" && (
                  <Input
                    aria-label="Custom unit name"
                    value={edit?.unit ?? ""}
                    onChange={(event) => setEdit({ ...edit, unit: event.target.value })}
                    placeholder="Type your unit, e.g. jar"
                  />
                )}
              </div>
            </div>
          </section>
          <div className="border-t" />
          <section>
            <div className="mb-3 text-sm font-medium">Stock &amp; cost</div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="stock-current">Current quantity</Label>
                <Input
                  id="stock-current"
                  type="number"
                  min={0}
                  value={edit?.current_stock ?? 0}
                  onChange={(event) =>
                    setEdit({ ...edit, current_stock: event.target.value as unknown as number })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stock-warning">Low-stock warning</Label>
                <Input
                  id="stock-warning"
                  type="number"
                  min={0}
                  value={edit?.low_stock_threshold ?? ""}
                  onChange={(event) =>
                    setEdit({
                      ...edit,
                      low_stock_threshold: event.target.value as unknown as number,
                    })
                  }
                  placeholder="Suggested automatically"
                />
                <p className="text-[11px] leading-4 text-muted-foreground">
                  We’ll notify you when stock reaches this level.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="stock-cost">
                  Cost per {edit?.unit || "unit"}{" "}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    {currencySymbol}
                  </span>
                  <Input
                    id="stock-cost"
                    type="number"
                    min={0}
                    step="0.01"
                    className="pl-8"
                    value={
                      edit?.cost_cents === null ||
                      edit?.cost_cents === undefined ||
                      (edit.cost_cents as unknown) === ""
                        ? ""
                        : Number(edit.cost_cents) / 100
                    }
                    onChange={(event) =>
                      setEdit({
                        ...edit,
                        cost_cents:
                          event.target.value === ""
                            ? ("" as unknown as number)
                            : Math.round(Number(event.target.value) * 100),
                      })
                    }
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>
          </section>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEdit(null)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : edit?.id ? "Save changes" : "Add item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StockSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-16 rounded-xl" />
      <div className="flex gap-2">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-10 w-32 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <Skeleton key={index} className="h-48 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
