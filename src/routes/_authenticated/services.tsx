import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Scissors,
  Clock,
  Check,
  Archive,
  ArchiveRestore,
  Package,
  X,
  Search,
  ChevronDown,
  Pencil,
  Tags,
  PackagePlus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { fmtMoney as formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/services")({
  component: ServicesPage,
});

type Service = {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price_cents: number;
  currency: string;
  active: boolean;
  image_url: string | null;
  buffer_before_min: number;
  buffer_after_min: number;
  color: string | null;
  category: string | null;
  archived_at: string | null;
  gap_min: number | null;
  active_after_min: number | null;
};
type Staff = { id: string; name: string };
type InventoryItem = {
  id: string;
  name: string;
  unit: string | null;
  cost_cents: number | null;
  current_stock: number;
  low_stock_threshold: number | null;
};
type RecipeLine = { inventory_item_id: string; quantity: number };

const COLORS = [
  "#C2410C",
  "#0EA5E9",
  "#10B981",
  "#A855F7",
  "#F59E0B",
  "#EC4899",
  "#6366F1",
  "#64748B",
];

function ServicesPage() {
  const { data: biz } = useMyBusiness();
  const fmtMoney = (cents: number) => formatMoney(cents, biz?.currency ?? "GBP");
  const bid = biz?.id;
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Partial<Service> | null>(null);
  const [linked, setLinked] = useState<Set<string>>(new Set());
  const [recipe, setRecipe] = useState<RecipeLine[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"active" | "archived">("active");
  const [saving, setSaving] = useState(false);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);
  const [stockPickerOpen, setStockPickerOpen] = useState(false);
  const [newStockName, setNewStockName] = useState("");
  const [newStockUnit, setNewStockUnit] = useState("unit");
  const [newStockAmount, setNewStockAmount] = useState(0);
  const [creatingStock, setCreatingStock] = useState(false);

  const { data: services, isLoading } = useQuery({
    queryKey: ["services", bid],
    enabled: !!bid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("business_id", bid!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Service[];
    },
  });

  const { data: allStaff } = useQuery({
    queryKey: ["all-staff", bid],
    enabled: !!bid,
    queryFn: async () => {
      const { data } = await supabase
        .from("staff")
        .select("id, name")
        .eq("business_id", bid!)
        .eq("active", true)
        .order("name");
      return (data ?? []) as Staff[];
    },
  });

  const { data: inventory, error: inventoryError } = useQuery({
    queryKey: ["inventory_items", bid],
    enabled: !!bid,
    queryFn: async () => {
      const { data } = await supabase
        .from("inventory_items")
        .select("id, name, unit, cost_cents, current_stock, low_stock_threshold")
        .eq("business_id", bid!)
        .order("name");
      return (data ?? []) as InventoryItem[];
    },
  });

  const { data: recipeStats } = useQuery({
    queryKey: ["service-recipe-stats", bid],
    enabled: !!bid,
    queryFn: async () => {
      const { data } = await supabase
        .from("service_recipe_items")
        .select("service_id")
        .eq("business_id", bid!);
      const counts: Record<string, number> = {};
      (data ?? []).forEach((r) => {
        counts[r.service_id] = (counts[r.service_id] || 0) + 1;
      });
      return counts;
    },
  });
  const recipeCounts = recipeStats;

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

  const configuredCategories = useMemo(
    () => biz?.service_categories ?? [],
    [biz?.service_categories],
  );
  const managedCategories = useMemo(() => {
    const serviceCategories = (services ?? [])
      .map((service) => service.category?.trim())
      .filter((category): category is string => !!category);
    return Array.from(new Set([...configuredCategories, ...serviceCategories])).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [configuredCategories, services]);
  const hasUncategorised = (services ?? []).some((service) => !service.category?.trim());
  const categories = hasUncategorised ? [...managedCategories, "Uncategorised"] : managedCategories;

  const filteredServices = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (services ?? []).filter((service) => {
      const category = service.category?.trim() || "Uncategorised";
      const statusMatches =
        statusFilter === "archived" ? !!service.archived_at : !service.archived_at;
      const categoryMatches = categoryFilter === "all" || category === categoryFilter;
      const searchMatches =
        !needle ||
        service.name.toLowerCase().includes(needle) ||
        category.toLowerCase().includes(needle);
      return statusMatches && categoryMatches && searchMatches;
    });
  }, [categoryFilter, search, services, statusFilter]);

  const groupedServices = useMemo(() => {
    const groups = new Map<string, Service[]>();
    filteredServices.forEach((service) => {
      const category = service.category?.trim() || "Uncategorised";
      const existing = groups.get(category) ?? [];
      existing.push(service);
      groups.set(category, existing);
    });
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredServices]);

  useEffect(() => {
    if (!edit && services?.length) {
      setEdit(services.find((service) => !service.archived_at) ?? services[0]);
    }
  }, [edit, services]);

  const editingServiceId = edit?.id;
  const hasEditor = !!edit;

  // Load linked staff + recipe whenever editing existing
  useEffect(() => {
    let cancelled = false;

    if (editingServiceId) {
      setLinked(new Set());
      setRecipe([]);
      supabase
        .from("service_staff")
        .select("staff_id")
        .eq("service_id", editingServiceId)
        .then(({ data }) => {
          if (!cancelled) setLinked(new Set((data ?? []).map((r) => r.staff_id)));
        });
      supabase
        .from("service_recipe_items")
        .select("inventory_item_id, quantity")
        .eq("service_id", editingServiceId)
        .then(({ data }) => {
          if (!cancelled) {
            setRecipe(
              (data ?? []).map((r) => ({
                inventory_item_id: r.inventory_item_id,
                quantity: Number(r.quantity),
              })),
            );
          }
        });
    } else if (hasEditor) {
      setLinked(new Set());
      setRecipe([]);
    }

    return () => {
      cancelled = true;
    };
  }, [editingServiceId, hasEditor]);

  const saveCategoryNames = async (nextCategories: string[]) => {
    if (!bid) return false;
    const clean = Array.from(
      new Map(
        nextCategories
          .map((category) => category.trim())
          .filter(Boolean)
          .map((category) => [category.toLowerCase(), category]),
      ).values(),
    );
    const { error } = await supabase
      .from("businesses")
      .update({ service_categories: clean })
      .eq("id", bid);
    if (error) {
      toast.error(error.message);
      return false;
    }
    await qc.invalidateQueries({ queryKey: ["my-business"] });
    return true;
  };

  const addCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return toast.error("Enter a category name");
    if (managedCategories.some((category) => category.toLowerCase() === name.toLowerCase())) {
      return toast.error("That category already exists");
    }
    setCategorySaving(true);
    try {
      if (await saveCategoryNames([...managedCategories, name])) {
        setNewCategoryName("");
        setCategoryFilter(name);
        toast.success(`Added “${name}”`);
      }
    } finally {
      setCategorySaving(false);
    }
  };

  const renameCategory = async (original: string) => {
    const name = renameValue.trim();
    if (!bid || !name) return toast.error("Enter a category name");
    if (
      managedCategories.some(
        (category) =>
          category.toLowerCase() === name.toLowerCase() &&
          category.toLowerCase() !== original.toLowerCase(),
      )
    ) {
      return toast.error("That category already exists");
    }
    setCategorySaving(true);
    const next = managedCategories.map((category) => (category === original ? name : category));
    try {
      if (!(await saveCategoryNames(next))) return;
      const { error } = await supabase
        .from("services")
        .update({ category: name })
        .eq("business_id", bid)
        .eq("category", original);
      if (error) {
        await saveCategoryNames(managedCategories);
        toast.error(error.message);
        return;
      }
      if (edit?.category === original) setEdit({ ...edit, category: name });
      if (categoryFilter === original) setCategoryFilter(name);
      setRenamingCategory(null);
      setRenameValue("");
      await qc.invalidateQueries({ queryKey: ["services", bid] });
      toast.success(`Renamed “${original}” to “${name}”`);
    } finally {
      setCategorySaving(false);
    }
  };

  const deleteCategory = async (category: string) => {
    if (!bid) return;
    setCategorySaving(true);
    const next = managedCategories.filter((name) => name !== category);
    try {
      if (!(await saveCategoryNames(next))) return;
      const { error } = await supabase
        .from("services")
        .update({ category: null })
        .eq("business_id", bid)
        .eq("category", category);
      if (error) {
        await saveCategoryNames(managedCategories);
        toast.error(error.message);
        return;
      }
      if (edit?.category === category) setEdit({ ...edit, category: null });
      if (categoryFilter === category) setCategoryFilter("all");
      await qc.invalidateQueries({ queryKey: ["services", bid] });
      toast.success(`Deleted “${category}”`);
    } finally {
      setCategorySaving(false);
    }
  };

  const attachStockItem = (item: InventoryItem) => {
    if (!recipe.some((line) => line.inventory_item_id === item.id)) {
      setRecipe([...recipe, { inventory_item_id: item.id, quantity: defaultQtyFor(item) }]);
    }
    setStockPickerOpen(false);
  };

  const createAndAttachStock = async () => {
    const name = newStockName.trim();
    if (!bid || !name) return toast.error("Enter a stock item name");
    setCreatingStock(true);
    try {
      const stock = Math.max(0, Number(newStockAmount) || 0);
      const { data, error } = await supabase
        .from("inventory_items")
        .insert({
          business_id: bid,
          name,
          unit: newStockUnit.trim() || "unit",
          current_stock: stock,
          low_stock_threshold: stock > 0 ? Math.max(1, Math.round(stock * 0.2)) : 0,
        })
        .select("id, name, unit, cost_cents, current_stock, low_stock_threshold")
        .single();
      if (error) return toast.error(error.message);
      const item = data as InventoryItem;
      setRecipe([...recipe, { inventory_item_id: item.id, quantity: defaultQtyFor(item) }]);
      setNewStockName("");
      setNewStockUnit("unit");
      setNewStockAmount(0);
      setStockPickerOpen(false);
      await qc.invalidateQueries({ queryKey: ["inventory_items", bid] });
      toast.success(`Created and attached “${item.name}”`);
    } finally {
      setCreatingStock(false);
    }
  };

  const save = async () => {
    if (!edit || !bid) return;
    if (!edit.name) return toast.error("Name is required");
    if (!(Number(edit.duration_minutes) > 0))
      return toast.error("Duration must be greater than 0 minutes");
    const hasGap = !!edit.gap_min;
    if (hasGap && !(Number(edit.gap_min) > 0 && Number(edit.active_after_min) > 0)) {
      return toast.error("Gap and second segment must both be greater than 0 minutes");
    }
    if (recipe.some((line) => !(Number(line.quantity) > 0))) {
      return toast.error("Stock amount used must be greater than 0");
    }

    setSaving(true);
    try {
      const categoryName = edit.category?.trim();
      if (
        categoryName &&
        !managedCategories.some((category) => category.toLowerCase() === categoryName.toLowerCase())
      ) {
        if (!(await saveCategoryNames([...managedCategories, categoryName]))) return;
      }
      const payload = {
        business_id: bid,
        name: edit.name,
        description: edit.description ?? null,
        duration_minutes: Number(edit.duration_minutes),
        price_cents: Math.round(Number(edit.price_cents) || 0),
        buffer_before_min: Number(edit.buffer_before_min) || 0,
        buffer_after_min: Number(edit.buffer_after_min) || 0,
        gap_min: hasGap ? Number(edit.gap_min) : null,
        active_after_min: hasGap ? Number(edit.active_after_min) : null,
        color: edit.color ?? null,
        category: categoryName || null,
        active: edit.active ?? true,
        currency: biz?.currency ?? "GBP",
      };
      const { data, error } = edit.id
        ? await supabase.from("services").update(payload).eq("id", edit.id).select("id").single()
        : await supabase.from("services").insert(payload).select("id").single();
      if (error) return toast.error(error.message);
      const sid = data!.id;
      // sync staff
      const { error: clearStaffError } = await supabase
        .from("service_staff")
        .delete()
        .eq("service_id", sid);
      if (clearStaffError) return toast.error(clearStaffError.message);
      if (linked.size > 0) {
        const { error: staffError } = await supabase
          .from("service_staff")
          .insert(
            Array.from(linked).map((staff_id) => ({ service_id: sid, staff_id, business_id: bid })),
          );
        if (staffError) return toast.error(staffError.message);
      }
      // sync recipe
      const { error: clearRecipeError } = await supabase
        .from("service_recipe_items")
        .delete()
        .eq("service_id", sid);
      if (clearRecipeError) return toast.error(clearRecipeError.message);
      if (recipe.length > 0) {
        const { error: recipeError } = await supabase.from("service_recipe_items").insert(
          recipe.map((r) => ({
            service_id: sid,
            business_id: bid,
            inventory_item_id: r.inventory_item_id,
            quantity: r.quantity,
          })),
        );
        if (recipeError) return toast.error(recipeError.message);
      }
      toast.success(edit.id ? "Service updated" : "Service created");
      setEdit({ ...edit, ...payload, id: sid });
      qc.invalidateQueries({ queryKey: ["services"] });
      qc.invalidateQueries({ queryKey: ["service-recipe-stats", bid] });
      qc.invalidateQueries({ queryKey: ["slots-day"] });
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async (s: Pick<Service, "id" | "archived_at">) => {
    const archived = !s.archived_at;
    const { error } = await supabase
      .from("services")
      .update({ archived_at: archived ? new Date().toISOString() : null, active: !archived })
      .eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success(archived ? "Service archived" : "Service restored");
    if (edit?.id === s.id) {
      setEdit({
        ...edit,
        archived_at: archived ? new Date().toISOString() : null,
        active: !archived,
      });
      setStatusFilter(archived ? "archived" : "active");
    }
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
    if (edit?.id === id) setEdit(null);
    qc.invalidateQueries({ queryKey: ["services"] });
  };

  const startNewService = () => {
    setEdit({
      active: true,
      duration_minutes: 60,
      price_cents: 0,
      buffer_before_min: 0,
      buffer_after_min: 0,
      color: COLORS[0],
      category: categoryFilter === "all" ? null : categoryFilter,
    });
    setLinked(new Set());
    setRecipe([]);
  };

  const activeCount = (services ?? []).filter((service) => !service.archived_at).length;
  const archivedCount = (services ?? []).filter((service) => !!service.archived_at).length;

  return (
    <div className="max-w-[1280px] p-5 sm:p-8 md:p-10">
      <PageHeader
        eyebrow="Catalog"
        title="Services"
        subtitle="Create and manage the services your customers can book."
        action={
          <Button onClick={startNewService} className="shadow-glow">
            <Plus className="mr-1 h-4 w-4" /> New service
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid min-h-[620px] overflow-hidden rounded-[22px] border bg-card lg:grid-cols-[0.9fr_1.25fr]">
          <div className="space-y-3 border-r p-5">
            <Skeleton className="h-11 rounded-xl" />
            {Array.from({ length: 10 }).map((_, index) => (
              <Skeleton key={index} className="h-11 rounded-lg" />
            ))}
          </div>
          <div className="space-y-5 p-7">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        </div>
      ) : services?.length === 0 && !edit ? (
        <EmptyState
          icon={Scissors}
          title="No services yet"
          description="Create your first offering — a haircut, a treatment, or an intro consultation."
          action={
            <Button onClick={startNewService}>
              <Plus className="mr-1 h-4 w-4" /> Add your first service
            </Button>
          }
        />
      ) : (
        <div className="grid min-h-[650px] overflow-hidden rounded-[22px] border bg-card lg:max-h-[calc(100vh-190px)] lg:grid-cols-[minmax(360px,0.9fr)_minmax(500px,1.25fr)]">
          <section className="flex min-h-[560px] flex-col border-b lg:min-h-0 lg:border-b-0 lg:border-r">
            <div className="space-y-3 border-b p-4">
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search services…"
                    className="h-11 rounded-xl pl-10"
                    aria-label="Search services"
                  />
                </div>
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  className="h-11 rounded-xl border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  aria-label="Filter by category"
                >
                  <option value="all">All categories</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCategoryManagerOpen(true)}
                  className="h-11 rounded-xl"
                >
                  <Tags className="mr-2 h-4 w-4" /> Categories
                </Button>
              </div>
              <div className="inline-flex rounded-xl bg-secondary/70 p-1 text-sm">
                <button
                  type="button"
                  onClick={() => setStatusFilter("active")}
                  className={`rounded-lg px-3 py-1.5 transition-colors ${statusFilter === "active" ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}
                >
                  Active <span className="ml-1 text-xs text-muted-foreground">{activeCount}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("archived")}
                  className={`rounded-lg px-3 py-1.5 transition-colors ${statusFilter === "archived" ? "bg-card font-medium shadow-sm" : "text-muted-foreground"}`}
                >
                  Archived{" "}
                  <span className="ml-1 text-xs text-muted-foreground">{archivedCount}</span>
                </button>
              </div>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Pencil className="h-3.5 w-3.5" /> Click any service below to edit it.
              </p>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_82px_84px_18px] gap-3 border-b px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <span>Service</span>
              <span>Duration</span>
              <span>Price</span>
              <span />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {groupedServices.length === 0 ? (
                <div className="px-6 py-16 text-center text-sm text-muted-foreground">
                  No services match those filters.
                </div>
              ) : (
                groupedServices.map(([category, categoryServices]) => (
                  <div key={category}>
                    <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-card/95 px-5 py-2.5 backdrop-blur">
                      <span className="font-display text-base">{category}</span>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                        {categoryServices.length}
                      </span>
                    </div>
                    {categoryServices.map((service) => {
                      const selected = edit?.id === service.id;
                      return (
                        <button
                          key={service.id}
                          type="button"
                          onClick={() => setEdit(service)}
                          className={`grid w-full grid-cols-[minmax(0,1fr)_82px_84px_18px] items-center gap-3 border-b px-5 py-3 text-left text-sm transition-colors ${selected ? "bg-[#f4ede2]" : "hover:bg-secondary/40"}`}
                        >
                          <span className="min-w-0 truncate font-medium">{service.name}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {service.duration_minutes} min
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            {fmtMoney(service.price_cents)}
                          </span>
                          <span
                            className={`h-2 w-2 rounded-full ${service.archived_at ? "bg-muted-foreground/40" : service.active ? "bg-emerald-600" : "bg-amber-500"}`}
                            title={
                              service.archived_at
                                ? "Archived"
                                : service.active
                                  ? "Visible"
                                  : "Hidden"
                            }
                          />
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="flex min-h-[650px] flex-col bg-background/35 lg:min-h-0">
            {edit ? (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">
                  <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {edit.id ? "Edit service" : "New service"}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <h2 className="font-display text-3xl">{edit.name || "Untitled service"}</h2>
                        <span
                          className={`h-2 w-2 rounded-full ${edit.archived_at ? "bg-muted-foreground/40" : edit.active === false ? "bg-amber-500" : "bg-emerald-600"}`}
                        />
                        <span className="text-xs text-muted-foreground">
                          {edit.archived_at
                            ? "Archived"
                            : edit.active === false
                              ? "Hidden"
                              : "Active"}
                        </span>
                      </div>
                    </div>
                    {edit.id && recipeCounts?.[edit.id] ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-xs text-muted-foreground">
                        <Package className="h-3 w-3" /> {recipeCounts[edit.id]} stock item
                        {recipeCounts[edit.id] === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label>Name</Label>
                      <Input
                        value={edit.name ?? ""}
                        onChange={(event) => setEdit({ ...edit, name: event.target.value })}
                        className="mt-1.5 h-11"
                        placeholder="Signature haircut"
                        autoFocus={!edit.id}
                      />
                    </div>
                    <div>
                      <Label>Category</Label>
                      <select
                        value={edit.category ?? ""}
                        onChange={(event) =>
                          setEdit({ ...edit, category: event.target.value || null })
                        }
                        className="mt-1.5 h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                        aria-label="Category"
                      >
                        <option value="">Uncategorised</option>
                        {managedCategories.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setCategoryManagerOpen(true)}
                        className="mt-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                      >
                        Add, rename or delete categories
                      </button>
                    </div>
                    <div>
                      <Label>{edit.gap_min ? "First segment (min)" : "Duration (min)"}</Label>
                      <Input
                        type="number"
                        min={5}
                        step={5}
                        value={edit.duration_minutes ?? 60}
                        onChange={(event) =>
                          setEdit({ ...edit, duration_minutes: Number(event.target.value) })
                        }
                        className="mt-1.5 h-11"
                      />
                    </div>
                    <div>
                      <Label>Price ({biz?.currency ?? "GBP"})</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={(edit.price_cents ?? 0) / 100}
                        onChange={(event) =>
                          setEdit({
                            ...edit,
                            price_cents: Math.round((parseFloat(event.target.value) || 0) * 100),
                          })
                        }
                        className="mt-1.5 h-11"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label>Description</Label>
                      <Textarea
                        value={edit.description ?? ""}
                        onChange={(event) => setEdit({ ...edit, description: event.target.value })}
                        className="mt-1.5 min-h-20"
                        placeholder="What is included?"
                      />
                    </div>
                  </div>

                  <div className="my-6 flex items-center justify-between border-y py-4">
                    <div>
                      <Label className="text-sm">Visible on booking page</Label>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Customers can see and book this service.
                      </p>
                    </div>
                    <Switch
                      checked={edit.active ?? true}
                      onCheckedChange={(value) => setEdit({ ...edit, active: value })}
                    />
                  </div>

                  <div className="rounded-2xl border bg-[#f7f2ea]/70 p-4 sm:p-5">
                    <div className="flex items-start gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border bg-card">
                        <Package className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-display text-xl">Stock used for each appointment</h3>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          Optional. Linked stock is deducted automatically when this service is
                          completed.
                        </p>
                      </div>
                    </div>

                    {recipe.length > 0 && (
                      <div className="mt-5 overflow-hidden rounded-xl border bg-card">
                        <div className="grid grid-cols-[minmax(0,1fr)_120px_150px_32px] gap-3 border-b px-4 py-2.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          <span>Stock item</span>
                          <span>Amount used</span>
                          <span>Stock left</span>
                          <span />
                        </div>
                        {recipe.map((line, index) => {
                          const item = inventoryById(line.inventory_item_id);
                          const appointmentsLeft =
                            item && line.quantity > 0
                              ? Math.floor(Number(item.current_stock) / line.quantity)
                              : 0;
                          const isLow = item
                            ? Number(item.current_stock) <=
                                Number(item.low_stock_threshold ?? -1) || appointmentsLeft <= 3
                            : false;
                          return (
                            <div
                              key={line.inventory_item_id}
                              className="grid grid-cols-[minmax(0,1fr)_120px_150px_32px] items-center gap-3 border-b px-4 py-3 text-sm last:border-b-0"
                            >
                              <span className="min-w-0 truncate font-medium">
                                {item?.name ?? "Unknown item"}
                              </span>
                              <div className="relative">
                                <Input
                                  type="number"
                                  min={0}
                                  step={stepFor(item)}
                                  value={line.quantity}
                                  onChange={(event) =>
                                    setRecipe(
                                      recipe.map((recipeLine, recipeIndex) =>
                                        recipeIndex === index
                                          ? {
                                              ...recipeLine,
                                              quantity: Math.max(0, Number(event.target.value)),
                                            }
                                          : recipeLine,
                                      ),
                                    )
                                  }
                                  className="h-9 pr-10"
                                  aria-label={`Amount of ${item?.name ?? "stock"} used`}
                                />
                                {item?.unit && (
                                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                    {item.unit}
                                  </span>
                                )}
                              </div>
                              <span
                                className={`text-xs ${isLow ? "text-amber-600" : "text-emerald-700"}`}
                              >
                                {item
                                  ? `${appointmentsLeft} appointment${appointmentsLeft === 1 ? "" : "s"} left`
                                  : "Unavailable"}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setRecipe(
                                    recipe.filter((_, recipeIndex) => recipeIndex !== index),
                                  )
                                }
                                className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                aria-label={`Remove ${item?.name ?? "stock item"}`}
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setStockPickerOpen(true)}
                        className="bg-card"
                      >
                        <PackagePlus className="mr-2 h-4 w-4" /> Attach stock item
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        {inventoryError
                          ? "Stock could not be loaded."
                          : inventory?.length
                            ? `${inventory.length} stock item${inventory.length === 1 ? "" : "s"} available`
                            : "No stock saved yet — you can create one here."}
                      </p>
                    </div>

                    {recipeCostPreview > 0 && (
                      <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs">
                        <span className="text-muted-foreground">
                          Estimated stock cost per appointment
                        </span>
                        <span className="font-semibold tabular-nums">
                          {fmtMoney(recipeCostPreview)}
                        </span>
                      </div>
                    )}
                  </div>

                  <details className="group mt-4 rounded-2xl border bg-card">
                    <summary className="flex cursor-pointer list-none items-center gap-3 p-4 sm:p-5">
                      <div className="grid h-9 w-9 place-items-center rounded-xl border">
                        <Clock className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-display text-lg">More timing and staff options</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Processing time, buffers, calendar colour and who can perform it.
                        </p>
                      </div>
                      <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="space-y-5 border-t p-4 sm:p-5">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <Label className="text-sm">Gap / processing time</Label>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Free the chair while colour develops.
                          </p>
                        </div>
                        <Switch
                          checked={!!edit.gap_min}
                          onCheckedChange={(value) =>
                            setEdit({
                              ...edit,
                              gap_min: value ? 30 : null,
                              active_after_min: value ? 15 : null,
                            })
                          }
                        />
                      </div>
                      {!!edit.gap_min && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label>Gap (min)</Label>
                            <Input
                              type="number"
                              min={5}
                              step={5}
                              value={edit.gap_min ?? 30}
                              onChange={(event) =>
                                setEdit({ ...edit, gap_min: Number(event.target.value) })
                              }
                              className="mt-1.5 h-10"
                            />
                          </div>
                          <div>
                            <Label>Second segment (min)</Label>
                            <Input
                              type="number"
                              min={5}
                              step={5}
                              value={edit.active_after_min ?? 15}
                              onChange={(event) =>
                                setEdit({ ...edit, active_after_min: Number(event.target.value) })
                              }
                              className="mt-1.5 h-10"
                            />
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Buffer before (min)</Label>
                          <Input
                            type="number"
                            min={0}
                            step={5}
                            value={edit.buffer_before_min ?? 0}
                            onChange={(event) =>
                              setEdit({ ...edit, buffer_before_min: Number(event.target.value) })
                            }
                            className="mt-1.5 h-10"
                          />
                        </div>
                        <div>
                          <Label>Buffer after (min)</Label>
                          <Input
                            type="number"
                            min={0}
                            step={5}
                            value={edit.buffer_after_min ?? 0}
                            onChange={(event) =>
                              setEdit({ ...edit, buffer_after_min: Number(event.target.value) })
                            }
                            className="mt-1.5 h-10"
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Calendar colour</Label>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {COLORS.map((color) => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => setEdit({ ...edit, color })}
                              className={`h-7 w-7 rounded-full border-2 transition-transform ${edit.color === color ? "scale-110 border-foreground" : "border-transparent"}`}
                              style={{ background: color }}
                              aria-label={`Use ${color} calendar colour`}
                            />
                          ))}
                        </div>
                      </div>
                      {allStaff && allStaff.length > 0 && (
                        <div>
                          <Label>Staff that perform this</Label>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Leave empty to allow any staff member.
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {allStaff.map((staff) => {
                              const selected = linked.has(staff.id);
                              return (
                                <button
                                  key={staff.id}
                                  type="button"
                                  onClick={() => {
                                    const next = new Set(linked);
                                    if (selected) next.delete(staff.id);
                                    else next.add(staff.id);
                                    setLinked(next);
                                  }}
                                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs ${selected ? "border-transparent bg-foreground text-background" : "bg-card hover:bg-secondary"}`}
                                >
                                  {selected && <Check className="h-3 w-3" />}
                                  {staff.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </details>
                </div>

                <div className="sticky bottom-0 grid gap-3 border-t bg-card/95 p-4 backdrop-blur sm:grid-cols-[minmax(0,1fr)_auto] sm:px-7">
                  <Button onClick={save} className="h-11" disabled={saving}>
                    {saving ? "Saving…" : edit.id ? "Save changes" : "Create service"}
                  </Button>
                  {edit.id && (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => toggleArchive(edit as Pick<Service, "id" | "archived_at">)}
                        className="h-11"
                      >
                        {edit.archived_at ? (
                          <ArchiveRestore className="mr-2 h-4 w-4" />
                        ) : (
                          <Archive className="mr-2 h-4 w-4" />
                        )}
                        {edit.archived_at ? "Restore" : "Archive"}
                      </Button>
                      <ConfirmDialog
                        trigger={
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-11 text-muted-foreground hover:text-destructive"
                            aria-label="Delete service"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        }
                        title="Delete this service?"
                        description="If it has bookings, archive it instead to preserve history."
                        onConfirm={async () => {
                          await del(edit.id!);
                        }}
                      />
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="grid flex-1 place-items-center p-10 text-center">
                <div>
                  <Scissors className="mx-auto h-8 w-8 text-muted-foreground" />
                  <h2 className="mt-4 font-display text-2xl">Choose a service</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Select a service from the list or create a new one.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      <Dialog
        open={categoryManagerOpen}
        onOpenChange={(open) => {
          setCategoryManagerOpen(open);
          if (!open) {
            setRenamingCategory(null);
            setRenameValue("");
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Manage categories</DialogTitle>
            <DialogDescription>
              These are your starting categories. Add your own, rename any of them, or delete ones
              you do not need.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Input
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void addCategory();
              }}
              placeholder="New category name"
              aria-label="New category name"
            />
            <Button type="button" onClick={addCategory} disabled={categorySaving}>
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>

          <div className="overflow-hidden rounded-xl border">
            {managedCategories.length === 0 ? (
              <p className="p-5 text-center text-sm text-muted-foreground">
                No categories yet. Add your first one above.
              </p>
            ) : (
              managedCategories.map((category) => {
                const serviceCount = (services ?? []).filter(
                  (service) => service.category?.trim() === category,
                ).length;
                const isRenaming = renamingCategory === category;
                return (
                  <div
                    key={category}
                    className="flex items-center gap-2 border-b p-3 last:border-b-0"
                  >
                    {isRenaming ? (
                      <Input
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void renameCategory(category);
                        }}
                        className="h-9"
                        autoFocus
                        aria-label={`Rename ${category}`}
                      />
                    ) : (
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{category}</p>
                        <p className="text-xs text-muted-foreground">
                          {serviceCount} service{serviceCount === 1 ? "" : "s"}
                        </p>
                      </div>
                    )}

                    {isRenaming ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => renameCategory(category)}
                          disabled={categorySaving}
                        >
                          Save
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setRenamingCategory(null)}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setRenamingCategory(category);
                            setRenameValue(category);
                          }}
                          aria-label={`Rename ${category}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <ConfirmDialog
                          trigger={
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="text-muted-foreground hover:text-destructive"
                              aria-label={`Delete ${category}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          }
                          title={`Delete “${category}”?`}
                          description={`${serviceCount} service${serviceCount === 1 ? "" : "s"} will be moved to Uncategorised. No services will be deleted.`}
                          onConfirm={() => deleteCategory(category)}
                        />
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCategoryManagerOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={stockPickerOpen} onOpenChange={setStockPickerOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Attach stock</DialogTitle>
            <DialogDescription>
              Choose an existing stock item, or create one here and attach it immediately.
            </DialogDescription>
          </DialogHeader>

          {inventoryError ? (
            <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              Stock could not be loaded. Refresh the page and try again.
            </p>
          ) : (
            <div className="space-y-2">
              {(inventory ?? [])
                .filter((item) => !recipe.some((line) => line.inventory_item_id === item.id))
                .map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => attachStockItem(item)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-secondary/50"
                  >
                    <span>
                      <span className="block text-sm font-medium">{item.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {item.current_stock} {item.unit || "units"} in stock
                      </span>
                    </span>
                    <span className="text-xs font-medium">Attach</span>
                  </button>
                ))}
              {(inventory?.length ?? 0) > 0 &&
                (inventory ?? []).every((item) =>
                  recipe.some((line) => line.inventory_item_id === item.id),
                ) && (
                  <p className="rounded-xl bg-secondary/60 p-3 text-sm text-muted-foreground">
                    All saved stock items are already attached to this service.
                  </p>
                )}
            </div>
          )}

          <div className="rounded-xl border bg-secondary/30 p-4">
            <div className="mb-3">
              <h3 className="font-medium">Create a new stock item</h3>
              <p className="text-xs text-muted-foreground">
                It will also appear on your main Stock page.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Item name</Label>
                <Input
                  value={newStockName}
                  onChange={(event) => setNewStockName(event.target.value)}
                  placeholder="e.g. Toner"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Unit</Label>
                <Input
                  value={newStockUnit}
                  onChange={(event) => setNewStockUnit(event.target.value)}
                  placeholder="ml, g, bottle…"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Starting stock</Label>
                <Input
                  type="number"
                  min={0}
                  value={newStockAmount}
                  onChange={(event) => setNewStockAmount(Number(event.target.value))}
                  className="mt-1.5"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setStockPickerOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={createAndAttachStock} disabled={creatingStock}>
              {creatingStock ? "Creating…" : "Create & attach"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
