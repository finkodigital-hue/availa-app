import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  Search,
  UserCircle,
  Mail,
  Phone,
  Merge,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  MapPin,
  Upload,
  Image as ImageIcon,
  Calendar,
  Download,
  ChevronRight,
  MessageCircle,
  MoreHorizontal,
  Clock3,
  Filter,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { NewBookingDialog } from "@/components/new-booking-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { compressImage, signedUrl } from "@/lib/image";
import { fmtDate, fmtMoney as formatMoney, fmtTime, statusMeta } from "@/lib/format";
import { downloadCsv, downloadJson } from "@/lib/csv";
import { generateCustomerDataExport, eraseCustomer, type CustomerDataExport, type EraseCustomerResult } from "@/lib/customer-data-requests.functions";
import { getServerFnAuthHeaders } from "@/lib/server-fn-auth";
import { toast } from "sonner";

// PostgREST caps any single response at 1000 rows regardless of .limit() —
// a business the size of a real Fresha import (~1,000+ customers) needs
// this paginated, same reasoning as src/lib/import/commit.ts's PAGE_SIZE.
const EXPORT_PAGE_SIZE = 1000;

function isoDateOnly(d: string | null | undefined): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}

function relativeVisit(value: string | null | undefined): string {
  if (!value) return "No visits yet";
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 35) return `${Math.floor(days / 7)} week${days < 14 ? "" : "s"} ago`;
  if (days < 365) return `${Math.floor(days / 30)} month${days < 60 ? "" : "s"} ago`;
  return fmtDate(value);
}

export const Route = createFileRoute("/_authenticated/customers")({
  component: CustomersPage,
});

type Customer = {
  id: string;
  business_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  avatar_url: string | null;
  notes: string | null;
  created_at: string;
};

function CustomersPage() {
  const { data: biz } = useMyBusiness();
  const fmtMoney = (cents: number) => formatMoney(cents, biz?.currency ?? "GBP");
  const bid = biz?.id;
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [mergeFor, setMergeFor] = useState<any | null>(null);
  const [editing, setEditing] = useState<Partial<Customer> | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [bookingFor, setBookingFor] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [customerView, setCustomerView] = useState<"all" | "recent" | "regulars">("all");

  const { data: customers, isLoading } = useQuery({
    queryKey: ["customers", bid, q],
    enabled: !!bid,
    queryFn: async () => {
      let req = supabase
        .from("customers")
        .select("id, name, email, phone, address, avatar_url, notes, created_at")
        .eq("business_id", bid!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (q) {
        const term = q.trim();
        req = req.or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
      }
      // A per-customer embedded booking count runs as a correlated subquery
      // under RLS (is_business_owner() re-evaluated per booking row scanned)
      // and times out once a business has real appointment history — and a
      // client-side fetch-and-count doesn't scale either once a business has
      // tens of thousands of bookings. Aggregate server-side instead.
      const [
        { data, error },
        { data: visitRows, error: visitErr },
        { data: customerStats, error: statsErr },
      ] = await Promise.all([
        req,
        supabase.rpc("customer_visit_counts", { _business_id: bid! }),
        (supabase as any).rpc("customer_export_stats", { _business_id: bid! }),
      ]);
      if (error) throw error;
      if (visitErr) throw visitErr;
      if (statsErr) throw statsErr;
      const visitCounts = new Map<string, number>();
      for (const v of visitRows ?? []) {
        visitCounts.set(v.customer_id, Number(v.visits));
      }
      const statsByCustomer = new Map<string, { lastVisit: string | null; totalSpent: number }>();
      for (const row of customerStats ?? []) {
        statsByCustomer.set(row.customer_id, {
          lastVisit: row.last_visit,
          totalSpent: Number(row.total_spent_cents ?? 0),
        });
      }
      return (data ?? []).map((c) => ({
        ...c,
        visits: visitCounts.get(c.id) ?? 0,
        lastVisit: statsByCustomer.get(c.id)?.lastVisit ?? null,
        totalSpent: statsByCustomer.get(c.id)?.totalSpent ?? 0,
      }));
    },
  });

  const visibleCustomers = useMemo(() => {
    if (!customers) return [];
    if (customerView === "regulars") return customers.filter((customer) => customer.visits >= 3);
    if (customerView === "recent") {
      const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
      return customers.filter(
        (customer) => customer.lastVisit && new Date(customer.lastVisit).getTime() >= cutoff,
      );
    }
    return customers;
  }, [customerView, customers]);

  useEffect(() => {
    if (!visibleCustomers.length) {
      setOpenId(null);
      return;
    }
    if (!openId || !visibleCustomers.some((customer) => customer.id === openId)) {
      setOpenId(visibleCustomers[0].id);
    }
  }, [visibleCustomers, openId]);

  const selectCustomer = (customerId: string) => {
    setOpenId(customerId);
    if (window.matchMedia("(max-width: 1279px)").matches) {
      window.setTimeout(() => {
        document
          .getElementById("customer-profile")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    }
  };

  // Not plan-gated on purpose — being able to take your client list with
  // you works identically on Free and Studio. Exports whatever the current
  // search matches (unpaginated — the on-screen table caps at 200 rows,
  // this must not inherit that cap), never testshop-scale data structures
  // left unhandled.
  const exportClients = async () => {
    if (!bid) return;
    setExporting(true);
    try {
      const term = q.trim();

      const allCustomers: {
        id: string;
        name: string;
        email: string | null;
        phone: string | null;
        address: string | null;
        notes: string | null;
        created_at: string;
      }[] = [];
      for (let from = 0; ; from += EXPORT_PAGE_SIZE) {
        let req = supabase
          .from("customers")
          .select("id, name, email, phone, address, notes, created_at")
          .eq("business_id", bid)
          .order("created_at", { ascending: false })
          .range(from, from + EXPORT_PAGE_SIZE - 1);
        if (term) req = req.or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
        const { data, error } = await req;
        if (error) throw error;
        allCustomers.push(...(data ?? []));
        if (!data || data.length < EXPORT_PAGE_SIZE) break;
      }

      const statsMap = new Map<
        string,
        { visits: number; spent: number; first: string | null; last: string | null }
      >();
      for (let from = 0; ; from += EXPORT_PAGE_SIZE) {
        const { data, error } = await (supabase as any)
          .rpc("customer_export_stats", { _business_id: bid })
          .range(from, from + EXPORT_PAGE_SIZE - 1);
        if (error) throw error;
        for (const row of (data ?? []) as any[]) {
          statsMap.set(row.customer_id, {
            visits: Number(row.visits),
            spent: Number(row.total_spent_cents),
            first: row.first_visit,
            last: row.last_visit,
          });
        }
        if (!data || data.length < EXPORT_PAGE_SIZE) break;
      }

      const rows = allCustomers.map((c) => {
        const stats = statsMap.get(c.id);
        return {
          Name: c.name ?? "",
          Email: c.email ?? "",
          Phone: c.phone ?? "",
          Address: c.address ?? "",
          "Total Visits": stats?.visits ?? 0,
          "Total Spend": fmtMoney(stats?.spent ?? 0),
          "First Visit": isoDateOnly(stats?.first),
          "Last Visit": isoDateOnly(stats?.last),
          "Date Added": isoDateOnly(c.created_at),
          Notes: c.notes ?? "",
        };
      });

      const bizSlug =
        (biz?.name ?? "clients")
          .trim()
          .replace(/[^a-z0-9]+/gi, "-")
          .replace(/^-+|-+$/g, "")
          .toLowerCase() || "clients";
      const today = new Date().toISOString().slice(0, 10);
      downloadCsv(`${bizSlug}-clients-${today}.csv`, rows);

      toast.success(
        term
          ? `Exported ${rows.length} filtered client${rows.length === 1 ? "" : "s"}`
          : `Exported ${rows.length} client${rows.length === 1 ? "" : "s"}`,
      );
    } catch (e: any) {
      toast.error(e.message ?? "Could not export clients");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="max-w-[1500px] p-5 sm:p-8 md:p-10">
      <PageHeader
        eyebrow="People"
        title="Customers"
        subtitle="Your relationship workspace. Get to know your clients and keep every visit personal."
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Button
              className="w-full sm:w-auto"
              variant="outline"
              onClick={exportClients}
              disabled={exporting || !bid}
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-1" />
              )}
              {q.trim() ? "Export filtered clients" : "Export clients"}
            </Button>
            <Button onClick={() => setEditing({})} className="w-full shadow-glow sm:w-auto">
              <Plus className="h-4 w-4 mr-1" /> Add customer
            </Button>
          </div>
        }
      />
      {bid && <DataRequestsBanner businessId={bid} onView={setOpenId} />}
      <div className="mb-5 flex gap-2 xl:max-w-[520px]">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, email or phone…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-12 bg-card pl-10"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-12 w-12 shrink-0 bg-card"
              aria-label="Filter customers"
            >
              <Filter className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Show customers</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setCustomerView("all")}>
              All customers{customerView === "all" ? " ✓" : ""}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setCustomerView("recent")}>
              Recent clients{customerView === "recent" ? " ✓" : ""}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setCustomerView("regulars")}>
              Regulars · 3+ visits{customerView === "regulars" ? " ✓" : ""}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isLoading ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(360px,0.82fr)_minmax(500px,1.18fr)]">
          <div className="overflow-hidden rounded-2xl border bg-card">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-t px-5 py-4 first:border-t-0">
                <Skeleton className="h-11 w-11 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-2.5 w-48" />
                </div>
              </div>
            ))}
          </div>
          <Skeleton className="hidden min-h-[660px] rounded-2xl xl:block" />
        </div>
      ) : customers?.length === 0 ? (
        <EmptyState
          icon={UserCircle}
          title={q ? "No matches" : "No customers yet"}
          description={
            q
              ? "Try a different name, email or phone."
              : "Customers appear here whenever someone books, or you can add one manually."
          }
          action={
            !q ? (
              <Button onClick={() => setEditing({})}>
                <Plus className="mr-1 h-4 w-4" /> Add your first customer
              </Button>
            ) : undefined
          }
        />
      ) : visibleCustomers.length === 0 ? (
        <div className="rounded-2xl border bg-card px-6 py-14 text-center">
          <p className="font-display text-2xl">No customers in this view</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose another filter to see your client list.
          </p>
          <Button variant="outline" className="mt-5" onClick={() => setCustomerView("all")}>
            Show all customers
          </Button>
        </div>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(360px,0.82fr)_minmax(500px,1.18fr)]">
          <section
            className="overflow-hidden rounded-2xl border bg-card shadow-soft"
            aria-label="Customer list"
          >
            <div className="flex items-center justify-between border-b bg-secondary/15 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <span>
                {visibleCustomers.length} customer{visibleCustomers.length === 1 ? "" : "s"}
              </span>
              <span>
                {customerView === "all"
                  ? "All clients"
                  : customerView === "recent"
                    ? "Recent clients"
                    : "Regulars"}
              </span>
            </div>
            <div className="max-h-[720px] divide-y overflow-y-auto">
              {visibleCustomers.map((c: any) => {
                const selected = c.id === openId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectCustomer(c.id)}
                    className={`relative flex w-full items-center gap-3 px-4 py-3.5 text-left outline-none transition-colors hover:bg-secondary/25 focus-visible:bg-secondary/40 ${selected ? "bg-[color:var(--cream)]" : ""}`}
                  >
                    {selected && (
                      <span className="absolute inset-y-0 left-0 w-0.5 bg-[color:var(--gold-deep)]" />
                    )}
                    <CustomerAvatar customer={c} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{c.name}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                        {c.phone ? (
                          <Phone className="h-3 w-3 shrink-0" />
                        ) : c.email ? (
                          <Mail className="h-3 w-3 shrink-0" />
                        ) : null}
                        <span className="truncate">
                          {c.phone || c.email || "No contact details"}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs font-medium">
                        {c.visits} visit{c.visits === 1 ? "" : "s"}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {relativeVisit(c.lastVisit)}
                      </div>
                    </div>
                    <ChevronRight
                      className={`h-4 w-4 shrink-0 ${selected ? "text-[color:var(--gold-deep)]" : "text-muted-foreground/50"}`}
                    />
                  </button>
                );
              })}
            </div>
          </section>

          <CustomerDetailPanel
            customerId={openId}
            businessId={bid}
            currency={biz?.currency ?? "GBP"}
            onEdit={(c) => setEditing(c)}
            onDelete={() => {
              setOpenId(null);
              qc.invalidateQueries({ queryKey: ["customers"] });
            }}
            onBook={setBookingFor}
            onMerge={setMergeFor}
          />
        </div>
      )}

      <CustomerEditDialog
        editing={editing}
        businessId={bid}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          qc.invalidateQueries({ queryKey: ["customers"] });
        }}
      />

      {bid && (
        <NewBookingDialog
          open={!!bookingFor}
          onOpenChange={(o) => !o && setBookingFor(null)}
          businessId={bid}
          prefill={bookingFor ? { customerId: bookingFor } : undefined}
          onCreated={() => {
            setBookingFor(null);
            qc.invalidateQueries({ queryKey: ["customers"] });
          }}
        />
      )}

      <MergeDialog
        target={mergeFor}
        onClose={() => setMergeFor(null)}
        onDone={() => {
          setMergeFor(null);
          qc.invalidateQueries({ queryKey: ["customers"] });
        }}
        businessId={bid}
      />
    </div>
  );
}

type DataRequest = { id: string; customer_id: string | null; email: string; kind: "export" | "deletion"; created_at: string };

function DataRequestsBanner({
  businessId,
  onView,
}: {
  businessId: string;
  onView: (customerId: string) => void;
}) {
  const qc = useQueryClient();
  const [acting, setActing] = useState<DataRequest | null>(null);
  const { data: requests } = useQuery({
    queryKey: ["customer-data-requests", businessId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("customer_data_requests")
        .select("id, customer_id, email, kind, created_at")
        .eq("business_id", businessId)
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      // Degrade quietly if the migration hasn't been applied yet.
      if (error) return [];
      return (data ?? []) as DataRequest[];
    },
  });

  if (!requests || requests.length === 0) return null;

  return (
    <div className="mb-5 rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-400">
        {requests.length} pending data request{requests.length === 1 ? "" : "s"}
      </p>
      <ul className="space-y-1.5">
        {requests.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              <span className="font-medium">{r.email}</span> requested{" "}
              {r.kind === "deletion" ? "account deletion" : "a data export"}
            </span>
            <div className="flex gap-1.5">
              {r.customer_id && (
                <Button variant="outline" size="sm" onClick={() => onView(r.customer_id!)}>View</Button>
              )}
              {r.customer_id && (
                <Button size="sm" onClick={() => setActing(r)}>
                  {r.kind === "deletion" ? "Erase" : "Generate export"}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <DataRequestActionDialog
        request={acting}
        onClose={() => setActing(null)}
        onDone={() => qc.invalidateQueries({ queryKey: ["customer-data-requests", businessId] })}
      />
    </div>
  );
}

function DataRequestActionDialog({
  request,
  onClose,
  onDone,
}: {
  request: DataRequest | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [confirmName, setConfirmName] = useState("");
  const [busy, setBusy] = useState(false);
  const [exportResult, setExportResult] = useState<CustomerDataExport | null>(null);
  const [eraseResult, setEraseResult] = useState<EraseCustomerResult | null>(null);

  const reset = () => { setConfirmName(""); setBusy(false); setExportResult(null); setEraseResult(null); };
  const close = () => { reset(); onClose(); };

  const runExport = async () => {
    if (!request) return;
    setBusy(true);
    try {
      const headers = await getServerFnAuthHeaders();
      const result = await generateCustomerDataExport({ data: { requestId: request.id }, headers });
      downloadJson(`customer-data-${result.customer.name.replace(/\s+/g, "-").toLowerCase()}`, result);
      setExportResult(result);
      onDone();
    } catch (error: any) {
      toast.error(error.message ?? "Could not generate the export.");
    } finally {
      setBusy(false);
    }
  };

  const runErase = async () => {
    if (!request) return;
    setBusy(true);
    try {
      const headers = await getServerFnAuthHeaders();
      const result = await eraseCustomer({ data: { requestId: request.id }, headers });
      setEraseResult(result);
      onDone();
    } catch (error: any) {
      toast.error(error.message ?? "Could not erase this customer.");
    } finally {
      setBusy(false);
    }
  };

  if (!request) return null;
  const isExport = request.kind === "export";

  return (
    <Dialog open={!!request} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isExport ? "Generate data export" : "Erase customer data"}</DialogTitle>
          {!eraseResult && !exportResult && (
            <DialogDescription>
              Requested by <span className="font-medium">{request.email}</span>
            </DialogDescription>
          )}
        </DialogHeader>

        {isExport ? (
          exportResult ? (
            <div className="space-y-3 text-sm">
              <p>
                Downloaded <span className="font-medium">{exportResult.bookings.length}</span> booking
                {exportResult.bookings.length === 1 ? "" : "s"} and{" "}
                <span className="font-medium">{exportResult.payments.length}</span> payment record
                {exportResult.payments.length === 1 ? "" : "s"} for{" "}
                <span className="font-medium">{exportResult.customer.name}</span>. The request has been marked resolved.
              </p>
              <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Not included automatically — check manually if relevant:</p>
                {exportResult.notCovered.map((n) => <p key={n}>• {n}</p>)}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Compiles everything on file for this customer — profile, bookings and payment history — into a JSON file
              that downloads immediately, and marks this request resolved.
            </p>
          )
        ) : eraseResult ? (
          <div className="space-y-3 text-sm">
            <p>
              Erased. {eraseResult.bookingsScrubbed} booking{eraseResult.bookingsScrubbed === 1 ? "" : "s"} and{" "}
              {eraseResult.paymentsScrubbed} payment{eraseResult.paymentsScrubbed === 1 ? "" : "s"} kept for records with
              identity removed, {eraseResult.notificationsDeleted} notification
              {eraseResult.notificationsDeleted === 1 ? "" : "s"} deleted, {eraseResult.photosDeleted} photo
              {eraseResult.photosDeleted === 1 ? "" : "s"} deleted from storage.
              {eraseResult.authAccountRemoved
                ? " Their portal sign-in has been removed entirely."
                : " Their portal sign-in was left in place — it's still in use by another business's customer record for the same email."}
            </p>
            <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Not covered automatically — please check manually:</p>
              {eraseResult.manualCheckNotice.map((n) => <p key={n}>• {n}</p>)}
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border p-2.5">
                <p className="font-medium text-foreground mb-1">Removed</p>
                <ul className="text-muted-foreground space-y-0.5">
                  <li>Name, email, phone, address, notes, photo</li>
                  <li>Name/email/phone on their bookings and payments</li>
                  <li>Notes on their bookings</li>
                  <li>Matching notifications</li>
                  <li>Portal sign-in, if no other business needs it</li>
                </ul>
              </div>
              <div className="rounded-lg border p-2.5">
                <p className="font-medium text-foreground mb-1">Retained</p>
                <ul className="text-muted-foreground space-y-0.5">
                  <li>Booking dates, services, staff, status</li>
                  <li>Payment amounts and dates</li>
                  <li>(identity stripped — for reports/financial records)</li>
                </ul>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Blocked if this customer has any upcoming bookings — cancel or reassign those first. This cannot be undone.
            </p>
            <div>
              <Label htmlFor="confirm-erase-name" className="text-xs">
                Type the customer's name to confirm
              </Label>
              <Input
                id="confirm-erase-name"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                className="mt-1 h-9"
                autoComplete="off"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          {eraseResult || exportResult ? (
            <Button onClick={close}>Close</Button>
          ) : isExport ? (
            <>
              <Button variant="ghost" onClick={close} disabled={busy}>Cancel</Button>
              <Button onClick={runExport} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                Generate export
              </Button>
            </>
          ) : (
            <ErasureNameGate request={request} confirmName={confirmName} busy={busy} onCancel={close} onConfirm={runErase} />
          )
        }
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ErasureNameGate({
  request,
  confirmName,
  busy,
  onCancel,
  onConfirm,
}: {
  request: DataRequest;
  confirmName: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { data: customer } = useQuery({
    queryKey: ["erase-target-name", request.customer_id],
    enabled: !!request.customer_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("name").eq("id", request.customer_id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const matches = !!customer && confirmName.trim() === customer.name;
  return (
    <>
      <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
      <Button variant="destructive" onClick={onConfirm} disabled={busy || !matches}>
        {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
        Erase{customer ? ` "${customer.name}"` : ""}
      </Button>
    </>
  );
}

function CustomerAvatar({ customer, size = "sm" }: { customer: any; size?: "sm" | "md" | "lg" }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!customer.avatar_url) return setUrl(null);
    signedUrl(customer.avatar_url)
      .then(setUrl)
      .catch(() => setUrl(null));
  }, [customer.avatar_url]);
  const sizing =
    size === "lg"
      ? "h-24 w-24 text-3xl"
      : size === "md"
        ? "h-12 w-12 text-lg"
        : "h-10 w-10 text-sm";
  if (url)
    return (
      <img
        src={url}
        alt={customer.name}
        className={`${sizing} shrink-0 rounded-full object-cover`}
      />
    );
  return (
    <div
      className={`${sizing} grid shrink-0 place-items-center rounded-full bg-secondary font-display font-medium`}
    >
      {customer.name?.[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

function CustomerEditDialog({
  editing,
  businessId,
  onClose,
  onSaved,
}: {
  editing: Partial<Customer> | null;
  businessId: string | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Partial<Customer>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    setForm(editing ?? {});
    if (editing?.avatar_url)
      signedUrl(editing.avatar_url)
        .then(setPreview)
        .catch(() => setPreview(null));
    else setPreview(null);
  }, [editing]);

  const onPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !businessId) return;
    if (!form.id) return toast.error("Save customer first to upload a photo");
    setUploading(true);
    try {
      const blob = await compressImage(file, 480, 0.85);
      const path = `${businessId}/customers/${form.id}-${Date.now()}.jpg`;
      const { error } = await supabase.storage
        .from("business-assets")
        .upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (error) throw error;
      await supabase
        .from("customers")
        .update({ avatar_url: path } as any)
        .eq("id", form.id);
      setForm((f) => ({ ...f, avatar_url: path }));
      const u = await signedUrl(path).catch(() => null);
      setPreview(u);
      toast.success("Photo updated");
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!businessId) return;
    if (!form.name?.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      const payload: any = {
        business_id: businessId,
        name: form.name.trim(),
        email: form.email?.trim() || null,
        phone: form.phone?.trim() || null,
        address: form.address?.trim() || null,
        notes: form.notes ?? null,
      };
      if (form.id) {
        const { error } = await supabase.from("customers").update(payload).eq("id", form.id);
        if (error) throw error;
        toast.success("Customer saved");
      } else {
        const { data, error } = await supabase
          .from("customers")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        setForm((f) => ({ ...f, id: data!.id }));
        toast.success("Customer added");
      }
      onSaved();
    } catch (e: any) {
      if (e.code === "23505") {
        toast.error("A customer with this email already exists.");
      } else {
        toast.error(e.message ?? "Could not save");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!editing} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {editing?.id ? "Edit customer" : "New customer"}
          </DialogTitle>
          <DialogDescription>Contact details and private notes.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-secondary grid place-items-center overflow-hidden shrink-0">
              {preview ? (
                <img src={preview} alt="" className="w-full h-full object-cover" />
              ) : (
                <ImageIcon className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <label className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs hover:bg-secondary/40 cursor-pointer">
              {uploading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Upload className="h-3 w-3" />
              )}
              {preview ? "Change photo" : "Upload photo"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onPhoto}
                disabled={uploading || !form.id}
              />
            </label>
          </div>
          <div>
            <Label>Name</Label>
            <Input
              value={form.name ?? ""}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1.5 h-10"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email ?? ""}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="mt-1.5 h-10"
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={form.phone ?? ""}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="mt-1.5 h-10"
              />
            </div>
          </div>
          <div>
            <Label>Address</Label>
            <Input
              value={form.address ?? ""}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="mt-1.5 h-10"
              placeholder="Optional"
            />
          </div>
          <div>
            <Label>Private notes</Label>
            <p className="text-[11px] text-muted-foreground mt-0.5 mb-1.5">
              Allergies, preferences, colour formulas, medical notes. Never visible to the customer.
            </p>
            <Textarea
              rows={4}
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {form.id ? "Save changes" : "Add customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CustomerDetailPanel({
  customerId,
  businessId,
  currency = "GBP",
  onEdit,
  onDelete,
  onBook,
  onMerge,
}: {
  customerId: string | null;
  businessId: string | undefined;
  currency?: string;
  onEdit: (c: any) => void;
  onDelete: () => void;
  onBook: (id: string) => void;
  onMerge: (c: any) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["customer-detail", businessId, customerId],
    enabled: !!businessId && !!customerId,
    queryFn: async () => {
      const { data: customer } = await supabase
        .from("customers")
        .select("*")
        .eq("business_id", businessId!)
        .eq("id", customerId!)
        .single();
      const { data: bookings } = await supabase
        .from("bookings")
        .select("id, starts_at, ends_at, status, price_cents, notes, services(name), staff(name)")
        .eq("customer_id", customerId!)
        .order("starts_at", { ascending: false });
      return { customer, bookings: bookings ?? [] };
    },
  });

  const stats = useMemo(() => {
    const bks: any[] = data?.bookings ?? [];
    const completed = bks.filter((b) =>
      ["completed", "checked_in", "in_progress", "confirmed", "pending"].includes(b.status),
    );
    const past = completed.filter((b) => new Date(b.starts_at) < new Date());
    const upcoming = bks
      .filter((b) => b.status !== "cancelled" && new Date(b.starts_at) >= new Date())
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    const visits = past.length;
    const spent = past.reduce((s, b) => s + (b.price_cents ?? 0), 0);
    const avg = visits ? Math.round(spent / visits) : 0;
    // Favorites
    const byService = new Map<string, number>();
    const byStaff = new Map<string, number>();
    past.forEach((b) => {
      const s = b.services?.name;
      if (s) byService.set(s, (byService.get(s) ?? 0) + 1);
      const st = b.staff?.name;
      if (st) byStaff.set(st, (byStaff.get(st) ?? 0) + 1);
    });
    const favService = [...byService.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const favStaff = [...byStaff.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return { visits, spent, avg, upcoming, past, favService, favStaff };
  }, [data]);

  const del = async () => {
    if (!customerId) return;
    const { error: bookingsError } = await supabase
      .from("bookings")
      .delete()
      .eq("customer_id", customerId);
    if (bookingsError) {
      toast.error(bookingsError.message);
      return;
    }
    const { error } = await supabase.from("customers").delete().eq("id", customerId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Customer deleted");
    onDelete();
  };

  const c = data?.customer;
  const nextBooking = stats.upcoming[0];
  const lastBooking = stats.past[0];

  if (!customerId) {
    return (
      <section className="hidden min-h-[660px] place-items-center rounded-2xl border bg-card px-8 text-center xl:grid">
        <div>
          <UserCircle className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-4 font-display text-2xl">Choose a customer</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Their appointments, notes and client history will appear here.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      id="customer-profile"
      className="min-h-[660px] overflow-hidden rounded-2xl border bg-card shadow-soft"
    >
      {isLoading || !c ? (
        <div className="grid min-h-[660px] place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <CustomerAvatar customer={c} size="lg" />
              <div className="min-w-0">
                <h2 className="truncate font-display text-3xl sm:text-4xl">{c.name}</h2>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {c.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5" />
                      {c.phone}
                    </div>
                  )}
                  {c.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5" />
                      {c.email}
                    </div>
                  )}
                  {c.address && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5" />
                      <span className="truncate">{c.address}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  aria-label="Customer actions"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(c)}>
                  <Pencil className="mr-2 h-4 w-4" /> Edit customer
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onMerge(c)}>
                  <Merge className="mr-2 h-4 w-4" /> Merge duplicate
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="mt-6 grid grid-cols-4 gap-2 border-y py-4">
            <ContactAction
              href={c.phone ? `sms:${c.phone}` : null}
              icon={MessageCircle}
              label="Message"
            />
            <ContactAction href={c.phone ? `tel:${c.phone}` : null} icon={Phone} label="Call" />
            <ContactAction href={c.email ? `mailto:${c.email}` : null} icon={Mail} label="Email" />
            <button
              type="button"
              onClick={() => onEdit(c)}
              className="group grid place-items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <span className="grid h-10 w-10 place-items-center rounded-full border bg-background transition-colors group-hover:bg-secondary">
                <MoreHorizontal className="h-4 w-4" />
              </span>
              More
            </button>
          </div>

          <div className="grid border-b py-5 sm:grid-cols-2 sm:divide-x">
            <AppointmentSnapshot
              label="Next appointment"
              booking={nextBooking}
              empty="No appointment booked"
            />
            <AppointmentSnapshot
              label="Last visit"
              booking={lastBooking}
              empty="No completed visits"
              className="mt-5 border-t pt-5 sm:mt-0 sm:border-t-0 sm:pl-6 sm:pt-0"
            />
          </div>

          <div className="grid grid-cols-3 divide-x border-b py-5 text-center">
            <ProfileStat label="Total visits" value={String(stats.visits)} />
            <ProfileStat label="Total spent" value={formatMoney(stats.spent, currency)} />
            <ProfileStat label="Average visit" value={formatMoney(stats.avg, currency)} />
          </div>

          <div className="mt-5 rounded-xl border bg-secondary/15 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                Client notes
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-[color:var(--gold-deep)]"
                onClick={() => onEdit(c)}
              >
                <Pencil className="mr-1 h-3 w-3" /> Edit
              </Button>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground/80">
              {c.notes ||
                "No private notes yet. Add preferences, allergies or colour formulas here."}
            </p>
            {(stats.favService || stats.favStaff) && (
              <p className="mt-3 text-xs text-muted-foreground">
                {stats.favService && (
                  <>
                    Favourite service: <b className="text-foreground">{stats.favService}</b>
                  </>
                )}
                {stats.favService && stats.favStaff && <span> · </span>}
                {stats.favStaff && (
                  <>
                    Favourite stylist: <b className="text-foreground">{stats.favStaff}</b>
                  </>
                )}
              </p>
            )}
          </div>

          {stats.past.length > 0 && (
            <div className="mt-5">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
                Recent history
              </div>
              <BookingList items={stats.past.slice(0, 3)} currency={currency} />
            </div>
          )}

          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            <Button className="sm:col-span-2" onClick={() => onBook(c.id)}>
              <Calendar className="mr-2 h-4 w-4" /> Book appointment
            </Button>
            <Button variant="outline" onClick={() => onEdit(c)}>
              <Pencil className="mr-2 h-4 w-4" /> Edit customer
            </Button>
            <ConfirmDialog
              trigger={
                <Button variant="ghost" className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" /> Delete customer
                </Button>
              }
              title={`Delete ${c.name.length > 40 ? c.name.slice(0, 40).trim() + "…" : c.name}?`}
              description="Their booking history will also be removed. This can't be undone."
              confirmLabel="Delete customer"
              onConfirm={del}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function ContactAction({
  href,
  icon: Icon,
  label,
}: {
  href: string | null;
  icon: any;
  label: string;
}) {
  const className =
    "group grid place-items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground aria-disabled:pointer-events-none aria-disabled:opacity-35";
  return (
    <a href={href ?? undefined} aria-disabled={!href} className={className}>
      <span className="grid h-10 w-10 place-items-center rounded-full border bg-background transition-colors group-hover:bg-secondary">
        <Icon className="h-4 w-4" />
      </span>
      {label}
    </a>
  );
}

function AppointmentSnapshot({
  label,
  booking,
  empty,
  className = "",
}: {
  label: string;
  booking: any;
  empty: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-xs font-medium">{label}</div>
      {booking ? (
        <div className="mt-2 flex items-start gap-2.5">
          <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--gold-deep)]" />
          <div className="min-w-0">
            <div className="text-sm font-medium">
              {fmtDate(booking.starts_at)} at {fmtTime(booking.starts_at)}
            </div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              {booking.services?.name ?? "Service"}
              {booking.staff?.name ? ` · ${booking.staff.name}` : ""}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Clock3 className="h-4 w-4" />
          {empty}
        </div>
      )}
    </div>
  );
}

function ProfileStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-2">
      <div className="truncate font-display text-xl tabular-nums">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function BookingList({ items, currency = "GBP" }: { items: any[]; currency?: string }) {
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {items.map((b) => {
        const m = statusMeta(b.status);
        return (
          <li key={b.id} className="px-4 py-3 flex items-center gap-3">
            <div className="text-center w-14 shrink-0">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {new Date(b.starts_at).toLocaleDateString([], { month: "short" })}
              </div>
              <div className="font-display text-xl tabular-nums leading-none">
                {new Date(b.starts_at).getDate()}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{b.services?.name ?? "Service"}</div>
              <div className="text-xs text-muted-foreground truncate">
                {fmtTime(b.starts_at)} · {b.staff?.name ?? "—"}
              </div>
            </div>
            <div className="text-right shrink-0">
              <Badge
                variant="outline"
                className="capitalize text-[10px]"
                style={{ background: m.tint, color: m.color, borderColor: m.color }}
              >
                {m.label}
              </Badge>
              <div className="text-xs text-muted-foreground tabular-nums mt-1">
                {formatMoney(b.price_cents ?? 0, currency)}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function MergeDialog({
  target,
  onClose,
  onDone,
  businessId,
}: {
  target: any | null;
  onClose: () => void;
  onDone: () => void;
  businessId: string | undefined;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: results } = useQuery({
    queryKey: ["merge-search", businessId, q, target?.id],
    enabled: !!businessId && !!target && q.trim().length >= 2,
    queryFn: async () => {
      const term = q.trim();
      const { data } = await supabase
        .from("customers")
        .select("id, name, email, phone")
        .eq("business_id", businessId!)
        .neq("id", target.id)
        .or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`)
        .limit(6);
      return data ?? [];
    },
  });

  const merge = async (loserId: string) => {
    if (!target) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("merge_customers", {
        _winner: target.id,
        _loser: loserId,
      });
      if (error) throw error;
      toast.success("Customers merged");
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Could not merge");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl truncate">
            Merge into {target?.name}
          </DialogTitle>
          <DialogDescription>
            Pick a duplicate to merge. All their bookings and notes move into {target?.name}. The
            duplicate record is deleted.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            autoFocus
            placeholder="Search duplicate by name, email or phone…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="rounded-xl border bg-card divide-y max-h-72 overflow-y-auto">
            {q.trim().length < 2 && (
              <div className="p-4 text-sm text-muted-foreground text-center">Type to search.</div>
            )}
            {q.trim().length >= 2 && results?.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground text-center">No matches.</div>
            )}
            {results?.map((c: any) => (
              <button
                key={c.id}
                disabled={busy}
                onClick={() => merge(c.id)}
                className="w-full text-left px-4 py-3 hover:bg-secondary/60 flex items-center gap-3 disabled:opacity-50"
              >
                <div className="h-9 w-9 rounded-full bg-secondary grid place-items-center text-xs font-medium">
                  {c.name?.[0]?.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{c.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {c.email || c.phone || "—"}
                  </div>
                </div>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Merge className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
