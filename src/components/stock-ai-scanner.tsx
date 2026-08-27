import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Crown,
  ImagePlus,
  Loader2,
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
  categories,
  existingItems,
  onApply,
}: {
  businessId: string | undefined;
  plan: string | null | undefined;
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
      setRows(
        detected.map((item) => ({
          ...item,
          localId: crypto.randomUUID(),
          selected: true,
          existingId:
            existingItems.find((existing) => normalize(existing.name) === normalize(item.name))
              ?.id ?? null,
        })),
      );
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
      setOpen(false);
      setFile(null);
      setRows([]);
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

  return (
    <>
      <Button variant="outline" className="h-10 bg-card" onClick={() => setOpen(true)}>
        <Sparkles className="mr-2 h-4 w-4 text-[color:var(--gold-deep)]" /> Scan photo
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Scan stock from a photo</DialogTitle>
            <DialogDescription>
              AI creates an editable draft first. Nothing changes until you review and approve it.
            </DialogDescription>
          </DialogHeader>

          {!studio ? (
            <div className="rounded-2xl border border-dashed bg-secondary/30 p-8 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[color:var(--cream)] text-[color:var(--gold-deep)]">
                <Crown className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-display text-xl">AI stock scanning is a Studio feature</h3>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                Upgrade to photograph a shelf, review the detected products and update stock in one
                go.
              </p>
              <Button asChild className="mt-5">
                <Link to="/settings" search={{ tab: "plan" } as never}>
                  View Studio plan
                </Link>
              </Button>
            </div>
          ) : rows.length ? (
            <ReviewTable rows={rows} existingItems={existingItems} updateRow={updateRow} />
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
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                capture="environment"
                className="sr-only"
                onChange={(event) => chooseFile(event.target.files?.[0])}
              />
              <div className="flex items-start gap-2 rounded-xl bg-secondary/40 p-3 text-xs leading-5 text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                The image is compressed and sent for analysis. It is not added to your salon gallery
                or saved as a stock photo.
              </div>
            </div>
          )}

          {studio && (
            <DialogFooter className="gap-2 sm:justify-between">
              <div>
                {(file || rows.length > 0) && (
                  <Button variant="ghost" onClick={reset} disabled={analysing || applying}>
                    <RotateCcw className="mr-2 h-4 w-4" /> Start again
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
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
  existingItems,
  updateRow,
}: {
  rows: ReviewRow[];
  existingItems: ExistingStockItem[];
  updateRow: (id: string, patch: Partial<ReviewRow>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        Check every count before applying. Photos can hide duplicate products or make labels hard to
        read.
      </div>
      <div className="space-y-3">
        {rows.map((row, index) => (
          <article
            key={row.localId}
            className={cn("rounded-2xl border p-4", !row.selected && "opacity-55")}
          >
            <div className="flex items-start gap-3">
              <Checkbox
                checked={row.selected}
                onCheckedChange={(checked) =>
                  updateRow(row.localId, { selected: checked === true })
                }
                aria-label={`Include ${row.name}`}
                className="mt-2"
              />
              <div className="min-w-0 flex-1">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Detected item {index + 1}
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    {row.existingId && (
                      <span className="rounded-full bg-sky-50 px-2 py-1 text-sky-800">
                        Updates existing item
                      </span>
                    )}
                    <span
                      className={cn(
                        "rounded-full px-2 py-1",
                        row.confidence >= 0.8
                          ? "bg-emerald-50 text-emerald-800"
                          : "bg-amber-50 text-amber-800",
                      )}
                    >
                      {Math.round(row.confidence * 100)}% confident
                    </span>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                  <ReviewField label="Apply as" className="sm:col-span-2 lg:col-span-6">
                    <Select
                      value={row.existingId ?? "__new__"}
                      onValueChange={(value) =>
                        updateRow(row.localId, {
                          existingId: value === "__new__" ? null : value,
                        })
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
                  <ReviewField label="Product name" className="lg:col-span-2">
                    <Input
                      value={row.name}
                      onChange={(event) => updateRow(row.localId, { name: event.target.value })}
                    />
                  </ReviewField>
                  <ReviewField label="Brand" className="lg:col-span-2">
                    <Input
                      value={row.brand}
                      onChange={(event) => updateRow(row.localId, { brand: event.target.value })}
                      placeholder="Optional"
                    />
                  </ReviewField>
                  <ReviewField label="Count">
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={row.quantity}
                      onChange={(event) =>
                        updateRow(row.localId, { quantity: Number(event.target.value) })
                      }
                    />
                  </ReviewField>
                  <ReviewField label="Unit">
                    <Input
                      value={row.unit}
                      onChange={(event) => updateRow(row.localId, { unit: event.target.value })}
                    />
                  </ReviewField>
                  <ReviewField label="Category" className="sm:col-span-2 lg:col-span-3">
                    <Input
                      value={row.category}
                      onChange={(event) => updateRow(row.localId, { category: event.target.value })}
                    />
                  </ReviewField>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <Label className="text-xs">AI note</Label>
                    <div className="mt-2 min-h-10 rounded-md bg-secondary/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
                      {row.note || "No uncertainty flagged."}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
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
      <Label className="text-xs">{label}</Label>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
