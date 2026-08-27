import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
  Crown,
  ImagePlus,
  Loader2,
  Minus,
  PackageCheck,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/image";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type ExistingStockItem = {
  id: string;
  name: string;
  brand: string | null;
};

type ScanResponseItem = {
  name: string;
  brand: string;
  category: string;
  unit: string;
  quantity: number;
  confidence: number;
  note: string;
};

type ReviewRow = ScanResponseItem & {
  localId: string;
  selected: boolean;
  existingId: string | null;
};

export type ReviewedStockItem = Pick<
  ReviewRow,
  "name" | "brand" | "category" | "unit" | "quantity" | "existingId"
>;

export function StockAiScanner({
  businessId,
  plan,
  demo = false,
  categories,
  existingItems,
  onApply,
}: {
  businessId: string | undefined;
  plan: string | null | undefined;
  demo?: boolean;
  categories: string[];
  existingItems: ExistingStockItem[];
  onApply: (items: ReviewedStockItem[]) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [analysing, setAnalysing] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const chooseFile = (next: File | undefined) => {
    if (!next) return;
    if (!next.type.startsWith("image/")) return toast.error("Choose a photo to scan");
    if (next.size > 20 * 1024 * 1024) return toast.error("Choose a photo smaller than 20 MB");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(next);
    setPreviewUrl(URL.createObjectURL(next));
    setRows([]);
  };

  const analyze = async () => {
    if (!file || !businessId || analysing) return;
    setAnalysing(true);
    try {
      const compressed = await compressImage(file, 1600, 0.78);
      if (compressed.size > 5 * 1024 * 1024) {
        throw new Error("The compressed photo is still too large. Try taking a closer photo.");
      }
      if (demo) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        setRows(createReviewRows(DEMO_SCAN_ITEMS, existingItems));
        return;
      }
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Please sign in again before scanning stock.");

      const form = new FormData();
      form.append("businessId", businessId);
      form.append("categories", JSON.stringify(categories));
      form.append("image", compressed, "stock-scan.jpg");
      const response = await fetch("/api/stock-scan", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!response.ok) throw new Error((await response.text()) || "The photo couldn't be scanned");
      const result = (await response.json()) as { items?: ScanResponseItem[] };
      const detected = Array.isArray(result.items) ? result.items : [];
      setRows(createReviewRows(detected, existingItems));
      if (!detected.length) toast.message("No clear stock items were found in that photo.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The photo couldn't be scanned");
    } finally {
      setAnalysing(false);
    }
  };

  const updateRow = (id: string, patch: Partial<ReviewRow>) => {
    setRows((current) => current.map((row) => (row.localId === id ? { ...row, ...patch } : row)));
  };

  const apply = async () => {
    if (applying) return;
    const selected = rows
      .filter((row) => row.selected)
      .map((row) => ({
        name: row.name.trim(),
        brand: row.brand.trim(),
        category: row.category.trim() || "Other",
        unit: row.unit.trim() || "unit",
        quantity: Math.max(0, Math.round(Number(row.quantity) || 0)),
        existingId: row.existingId,
      }));
    if (!selected.length) return toast.error("Select at least one item to apply");
    if (selected.some((row) => !row.name)) return toast.error("Every selected item needs a name");

    setApplying(true);
    try {
      await onApply(selected);
      toast.success(
        `${selected.length} reviewed stock item${selected.length === 1 ? "" : "s"} applied`,
      );
      reset();
      setOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "The reviewed stock couldn't be applied",
      );
    } finally {
      setApplying(false);
    }
  };

  const reset = () => {
    setFile(null);
    setRows([]);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const selectedCount = rows.filter((row) => row.selected).length;
  const studio = (plan ?? "free") !== "free";
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && (analysing || applying)) return;
    if (!nextOpen) reset();
    setOpen(nextOpen);
  };
  const replacePhoto = () => {
    reset();
    window.setTimeout(() => inputRef.current?.click(), 0);
  };

  return (
    <>
      <Button variant="outline" className="h-10 bg-card" onClick={() => setOpen(true)}>
        <Sparkles className="mr-2 h-4 w-4 text-[color:var(--gold-deep)]" /> Scan photo
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1280px]">
          <DialogHeader className="border-b px-5 py-5 pr-12 sm:px-7">
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--gold-deep)]">
              <Sparkles className="h-3.5 w-3.5" /> AI inventory assistant
            </div>
            <DialogTitle className="font-display text-2xl">
              {rows.length ? "Review scanned stock" : "Scan stock from a photo"}
            </DialogTitle>
            <DialogDescription>
              AI creates an editable draft first. Nothing changes until you review and approve it.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
            {!studio ? (
              <div className="rounded-2xl border border-dashed bg-secondary/30 p-8 text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[color:var(--cream)] text-[color:var(--gold-deep)]">
                  <Crown className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-display text-xl">AI stock scanning is a Studio feature</h3>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                  Upgrade to photograph a shelf, review the detected products and update stock in
                  one go.
                </p>
                <Button asChild className="mt-5">
                  <Link to="/settings" search={{ tab: "plan" } as never}>
                    View Studio plan
                  </Link>
                </Button>
              </div>
            ) : rows.length ? (
              <ReviewTable
                rows={rows}
                categories={categories}
                existingItems={existingItems}
                previewUrl={previewUrl}
                onReplacePhoto={replacePhoto}
                updateRow={updateRow}
              />
            ) : (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className={cn(
                    "relative grid min-h-72 w-full place-items-center overflow-hidden rounded-2xl border border-dashed transition-colors",
                    previewUrl
                      ? "border-transparent bg-black"
                      : "bg-secondary/20 hover:bg-secondary/40",
                  )}
                >
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt="Stock to analyse"
                      className="max-h-80 w-full object-contain"
                    />
                  ) : (
                    <div className="px-6 text-center">
                      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-card shadow-sm">
                        <Camera className="h-6 w-6 text-[color:var(--gold-deep)]" />
                      </div>
                      <div className="mt-4 text-sm font-semibold">Take or upload a shelf photo</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Keep labels facing the camera and avoid covering products.
                      </div>
                    </div>
                  )}
                </button>
                <div className="flex items-start gap-2 rounded-xl bg-secondary/40 p-3 text-xs leading-5 text-muted-foreground">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  The image is compressed and sent for analysis. It is not added to your salon
                  gallery or saved as a stock photo.
                </div>
              </div>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              capture="environment"
              className="sr-only"
              onClick={(event) => {
                event.currentTarget.value = "";
              }}
              onChange={(event) => chooseFile(event.target.files?.[0])}
            />
          </div>

          {studio && (
            <DialogFooter className="border-t bg-card px-5 py-4 sm:justify-between sm:px-7">
              <div>
                {(file || rows.length > 0) && (
                  <Button variant="ghost" onClick={reset} disabled={analysing || applying}>
                    <RotateCcw className="mr-2 h-4 w-4" /> Start again
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => handleOpenChange(false)}>
                  Cancel
                </Button>
                {rows.length ? (
                  <Button onClick={apply} disabled={applying || selectedCount === 0}>
                    {applying ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                    )}
                    Apply reviewed stock ({selectedCount})
                  </Button>
                ) : (
                  <Button onClick={analyze} disabled={!file || analysing || !businessId}>
                    {analysing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 h-4 w-4" />
                    )}
                    {analysing ? "Analysing photo…" : "Analyse photo"}
                  </Button>
                )}
              </div>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReviewTable({
  rows,
  categories,
  existingItems,
  previewUrl,
  onReplacePhoto,
  updateRow,
}: {
  rows: ReviewRow[];
  categories: string[];
  existingItems: ExistingStockItem[];
  previewUrl: string | null;
  onReplacePhoto: () => void;
  updateRow: (id: string, patch: Partial<ReviewRow>) => void;
}) {
  const selectedCount = rows.filter((row) => row.selected).length;
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="space-y-3 lg:sticky lg:top-0">
        {previewUrl && (
          <div className="overflow-hidden rounded-2xl border bg-card">
            <div className="bg-black">
              <img
                src={previewUrl}
                alt="Photo being reviewed"
                className="aspect-[4/3] w-full object-contain"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-full rounded-none border-t"
              onClick={onReplacePhoto}
            >
              <ImagePlus className="mr-2 h-4 w-4" /> Choose another photo
            </Button>
          </div>
        )}
        <div className="rounded-2xl border bg-secondary/20 p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-card shadow-sm">
              <PackageCheck className="h-5 w-5 text-[color:var(--gold-deep)]" />
            </div>
            <div>
              <div className="text-2xl font-semibold leading-none">{selectedCount}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                of {rows.length} items selected
              </div>
            </div>
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-[color:var(--gold-deep)] transition-all"
              style={{ width: `${(selectedCount / rows.length) * 100}%` }}
            />
          </div>
        </div>
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Check names and counts. Untick anything you do not want to add.
        </div>
      </aside>

      <div className="min-w-0 overflow-hidden rounded-2xl border bg-card">
        <div className="hidden grid-cols-[36px_minmax(170px,1fr)_132px_126px_140px_100px_28px] items-center gap-3 border-b bg-secondary/20 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground xl:grid">
          <span>Use</span>
          <span>Product</span>
          <span>Count</span>
          <span>Unit</span>
          <span>Category</span>
          <span>Confidence</span>
          <span />
        </div>
        {rows.map((row, index) => (
          <article
            key={row.localId}
            className={cn(
              "border-b transition-colors last:border-b-0",
              row.selected ? "bg-card" : "bg-secondary/20 opacity-60",
            )}
          >
            <div className="grid items-center gap-3 px-4 py-3 xl:grid-cols-[36px_minmax(170px,1fr)_132px_126px_140px_100px_28px]">
              <Checkbox
                checked={row.selected}
                onCheckedChange={(checked) =>
                  updateRow(row.localId, { selected: checked === true })
                }
                aria-label={`Include ${row.name}`}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">
                  {row.name || "Unnamed product"}
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {row.brand || `Detected item ${index + 1}`}
                </div>
              </div>
              <QuantityControl row={row} updateRow={updateRow} />
              <ReviewSelect
                value={row.unit}
                options={COMMON_UNITS}
                onValueChange={(unit) => updateRow(row.localId, { unit })}
                placeholder="Unit"
              />
              <ReviewSelect
                value={row.category}
                options={[...categories, "Other"]}
                onValueChange={(category) => updateRow(row.localId, { category })}
                placeholder="Category"
              />
              <div
                className={cn(
                  "text-xs font-medium",
                  row.confidence >= 0.8 ? "text-emerald-700" : "text-amber-700",
                )}
              >
                {Math.round(row.confidence * 100)}% confident
              </div>
              <button
                type="button"
                onClick={() => setExpandedId(expandedId === row.localId ? null : row.localId)}
                className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label={`${expandedId === row.localId ? "Close" : "Edit"} ${row.name}`}
                aria-expanded={expandedId === row.localId}
              >
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform",
                    expandedId === row.localId && "rotate-180",
                  )}
                />
              </button>
            </div>
            {expandedId === row.localId && (
              <div className="grid gap-4 border-t bg-secondary/10 px-4 py-4 sm:grid-cols-2 xl:grid-cols-12">
                <ReviewField label="Save this result as" className="sm:col-span-2 xl:col-span-12">
                  <Select
                    value={row.existingId ?? "__new__"}
                    onValueChange={(value) =>
                      updateRow(row.localId, { existingId: value === "__new__" ? null : value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__new__">Create a new stock item</SelectItem>
                      {existingItems.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          Update {item.name}
                          {item.brand ? ` · ${item.brand}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </ReviewField>
                <ReviewField label="Product name" className="xl:col-span-5">
                  <Input
                    value={row.name}
                    onChange={(event) => updateRow(row.localId, { name: event.target.value })}
                  />
                </ReviewField>
                <ReviewField label="Brand" className="xl:col-span-3">
                  <Input
                    value={row.brand}
                    onChange={(event) => updateRow(row.localId, { brand: event.target.value })}
                    placeholder="Optional"
                  />
                </ReviewField>
                <div className="sm:col-span-2 xl:col-span-4">
                  <Label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    AI note
                  </Label>
                  <div className="mt-1.5 flex min-h-10 items-center rounded-md bg-secondary/50 px-3 py-2 text-xs leading-5 text-muted-foreground">
                    {row.note || "No uncertainty flagged."}
                  </div>
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function QuantityControl({
  row,
  updateRow,
}: {
  row: ReviewRow;
  updateRow: (id: string, patch: Partial<ReviewRow>) => void;
}) {
  return (
    <div className="flex h-9 overflow-hidden rounded-md border bg-background">
      <button
        type="button"
        className="grid w-9 shrink-0 place-items-center text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30"
        onClick={() => updateRow(row.localId, { quantity: Math.max(0, row.quantity - 1) })}
        disabled={row.quantity <= 0}
        aria-label={`Decrease ${row.name} count`}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <Input
        type="number"
        min={0}
        step={1}
        value={row.quantity}
        onChange={(event) => updateRow(row.localId, { quantity: Number(event.target.value) })}
        className="h-9 min-w-0 flex-1 rounded-none border-y-0 text-center shadow-none focus-visible:ring-0"
      />
      <button
        type="button"
        className="grid w-9 shrink-0 place-items-center text-muted-foreground hover:bg-secondary hover:text-foreground"
        onClick={() => updateRow(row.localId, { quantity: row.quantity + 1 })}
        aria-label={`Increase ${row.name} count`}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ReviewSelect({
  value,
  options,
  onValueChange,
  placeholder,
}: {
  value: string;
  options: string[];
  onValueChange: (value: string) => void;
  placeholder: string;
}) {
  const values = Array.from(new Set([value, ...options].filter(Boolean)));
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="h-9 min-w-0">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {values.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ReviewField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const COMMON_UNITS = ["bottle", "can", "box", "tub", "tube", "sachet", "pack", "pair", "unit"];

const DEMO_SCAN_ITEMS: ScanResponseItem[] = [
  {
    name: "Daily Shampoo 300ml",
    brand: "LUMINA",
    category: "Hair care",
    unit: "bottle",
    quantity: 4,
    confidence: 0.98,
    note: "",
  },
  {
    name: "Daily Conditioner 250ml",
    brand: "LUMINA",
    category: "Hair care",
    unit: "bottle",
    quantity: 3,
    confidence: 0.97,
    note: "",
  },
  {
    name: "Nourishing Hair Mask 250ml",
    brand: "LUMINA",
    category: "Hair care",
    unit: "tub",
    quantity: 2,
    confidence: 0.96,
    note: "",
  },
  {
    name: "Permanent Hair Colour 5.0",
    brand: "LUMINA",
    category: "Colour",
    unit: "box",
    quantity: 1,
    confidence: 0.95,
    note: "",
  },
  {
    name: "Permanent Hair Colour 6.3",
    brand: "LUMINA",
    category: "Colour",
    unit: "box",
    quantity: 1,
    confidence: 0.95,
    note: "",
  },
  {
    name: "Permanent Hair Colour 7.4",
    brand: "LUMINA",
    category: "Colour",
    unit: "box",
    quantity: 1,
    confidence: 0.95,
    note: "",
  },
  {
    name: "Permanent Hair Colour 4.1",
    brand: "LUMINA",
    category: "Colour",
    unit: "box",
    quantity: 1,
    confidence: 0.94,
    note: "",
  },
  {
    name: "Permanent Hair Colour 1.0",
    brand: "LUMINA",
    category: "Colour",
    unit: "box",
    quantity: 1,
    confidence: 0.93,
    note: "",
  },
  {
    name: "Flex Hold Hairspray 400ml",
    brand: "LUMINA",
    category: "Salon essentials",
    unit: "can",
    quantity: 1,
    confidence: 0.97,
    note: "",
  },
];

function createReviewRows(
  items: ScanResponseItem[],
  existingItems: ExistingStockItem[],
): ReviewRow[] {
  return items.map((item) => ({
    ...item,
    localId: crypto.randomUUID(),
    selected: true,
    existingId:
      existingItems.find((existing) => normalize(existing.name) === normalize(item.name))?.id ??
      null,
  }));
}
