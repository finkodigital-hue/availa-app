import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Search, UserCircle, Mail, Phone, Merge, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/customers")({
  component: CustomersPage,
});

function CustomersPage() {
  const { data: biz } = useMyBusiness();
  const bid = biz?.id;
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [mergeFor, setMergeFor] = useState<any | null>(null);

  const { data: customers, isLoading } = useQuery({
    queryKey: ["customers", bid, q],
    enabled: !!bid,
    queryFn: async () => {
      let req = supabase
        .from("customers")
        .select("id, name, email, phone, notes, created_at, bookings:bookings(id, starts_at, status)")
        .eq("business_id", bid!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (q) {
        const term = q.trim();
        req = req.or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
      }
      const { data, error } = await req;
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="p-5 sm:p-8 md:p-10 max-w-6xl">
      <PageHeader
        eyebrow="People"
        title="Customers"
        subtitle="Everyone who's ever booked with you, with their full history."
      />
      <div className="relative mb-5 max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, email or phone…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-10 h-11 bg-card"
        />
      </div>

      {isLoading ? (
        <div className="rounded-2xl border bg-card overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-5 py-4 border-t first:border-t-0 flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-2.5 w-48" />
              </div>
            </div>
          ))}
        </div>
      ) : customers?.length === 0 ? (
        <EmptyState
          icon={UserCircle}
          title={q ? "No matches" : "No customers yet"}
          description={
            q
              ? "Try a different name, email or phone."
              : "Customers are automatically created the first time someone books with you. Share your booking page to get started."
          }
        />
      ) : (
        <div className="rounded-2xl border bg-card overflow-hidden shadow-soft">
          <table className="hidden sm:table w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-[0.12em] text-muted-foreground bg-muted/40">
              <tr>
                <th className="px-5 py-3 font-medium">Customer</th>
                <th className="px-5 py-3 font-medium">Contact</th>
                <th className="px-5 py-3 font-medium">Bookings</th>
                <th className="px-5 py-3 font-medium">Joined</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {customers?.map((c: any) => (
                <tr key={c.id} className="border-t hover:bg-secondary/40 transition-colors group">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-secondary grid place-items-center text-xs font-medium">
                        {c.name?.[0]?.toUpperCase() ?? "?"}
                      </div>
                      <span className="font-medium">{c.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {c.email && <div className="inline-flex items-center gap-1.5"><Mail className="h-3 w-3" />{c.email}</div>}
                    {c.phone && !c.email && <div className="inline-flex items-center gap-1.5"><Phone className="h-3 w-3" />{c.phone}</div>}
                    {!c.email && !c.phone && "—"}
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs tabular-nums">{c.bookings?.length ?? 0}</span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{fmtDate(c.created_at)}</td>
                  <td className="px-5 py-3 text-right">
                    <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100" onClick={() => setMergeFor(c)}>
                      <Merge className="h-3.5 w-3.5 mr-1" /> Merge
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="sm:hidden divide-y">
            {customers?.map((c: any) => (
              <li key={c.id} className="px-4 py-3 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-secondary grid place-items-center text-sm font-medium">
                  {c.name?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{c.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {c.email || c.phone || "—"} · {c.bookings?.length ?? 0} booking{(c.bookings?.length ?? 0) === 1 ? "" : "s"}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setMergeFor(c)}>
                  <Merge className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <MergeDialog
        target={mergeFor}
        onClose={() => setMergeFor(null)}
        onDone={() => { setMergeFor(null); qc.invalidateQueries({ queryKey: ["customers"] }); }}
        businessId={bid}
      />
    </div>
  );
}

function MergeDialog({ target, onClose, onDone, businessId }: {
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
      const { data } = await supabase.from("customers")
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
      const { error } = await supabase.rpc("merge_customers", { _winner: target.id, _loser: loserId });
      if (error) throw error;
      toast.success("Customers merged");
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Could not merge");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Merge into {target?.name}</DialogTitle>
          <DialogDescription>
            Pick a duplicate to merge. All their bookings and notes move into {target?.name}. The duplicate record is deleted.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input autoFocus placeholder="Search duplicate by name, email or phone…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="rounded-xl border bg-card divide-y max-h-72 overflow-y-auto">
            {q.trim().length < 2 && <div className="p-4 text-sm text-muted-foreground text-center">Type to search.</div>}
            {q.trim().length >= 2 && results?.length === 0 && <div className="p-4 text-sm text-muted-foreground text-center">No matches.</div>}
            {results?.map((c: any) => (
              <button key={c.id} disabled={busy} onClick={() => merge(c.id)}
                className="w-full text-left px-4 py-3 hover:bg-secondary/60 flex items-center gap-3 disabled:opacity-50">
                <div className="h-9 w-9 rounded-full bg-secondary grid place-items-center text-xs font-medium">{c.name?.[0]?.toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{c.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{c.email || c.phone || "—"}</div>
                </div>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Merge className="h-4 w-4 text-muted-foreground" />}
              </button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
