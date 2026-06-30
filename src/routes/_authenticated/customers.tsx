import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  Search, UserCircle, Mail, Phone, Merge, Loader2, Plus, Pencil, Trash2,
  MapPin, Upload, Image as ImageIcon, Calendar, DollarSign, Star, Sparkles,
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { compressImage, signedUrl } from "@/lib/image";
import { fmtDate, fmtMoney, fmtTime, statusMeta } from "@/lib/format";
import { toast } from "sonner";

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
  const bid = biz?.id;
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [mergeFor, setMergeFor] = useState<any | null>(null);
  const [editing, setEditing] = useState<Partial<Customer> | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: customers, isLoading } = useQuery({
    queryKey: ["customers", bid, q],
    enabled: !!bid,
    queryFn: async () => {
      let req = supabase
        .from("customers")
        .select("id, name, email, phone, address, avatar_url, notes, created_at, bookings:bookings(id, starts_at, status, price_cents)")
        .eq("business_id", bid!)
        .order("created_at", { ascending: false })
        .limit(200);
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
        action={
          <Button onClick={() => setEditing({})} className="shadow-glow">
            <Plus className="h-4 w-4 mr-1" /> Add customer
          </Button>
        }
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
              : "Customers appear here whenever someone books, or you can add one manually."
          }
          action={
            !q ? (
              <Button onClick={() => setEditing({})}><Plus className="h-4 w-4 mr-1" /> Add your first customer</Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-2xl border bg-card overflow-hidden shadow-soft">
          <table className="hidden sm:table w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-[0.12em] text-muted-foreground bg-muted/40">
              <tr>
                <th className="px-5 py-3 font-medium">Customer</th>
                <th className="px-5 py-3 font-medium">Contact</th>
                <th className="px-5 py-3 font-medium">Visits</th>
                <th className="px-5 py-3 font-medium">Joined</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {customers?.map((c: any) => {
                const visits = (c.bookings ?? []).filter((b: any) => b.status !== "cancelled").length;
                return (
                  <tr key={c.id} onClick={() => setOpenId(c.id)} className="border-t hover:bg-secondary/40 transition-colors group cursor-pointer">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <CustomerAvatar customer={c} />
                        <div>
                          <div className="font-medium">{c.name}</div>
                          {c.address && <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3" />{c.address}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {c.email && <div className="inline-flex items-center gap-1.5"><Mail className="h-3 w-3" />{c.email}</div>}
                      {c.phone && !c.email && <div className="inline-flex items-center gap-1.5"><Phone className="h-3 w-3" />{c.phone}</div>}
                      {!c.email && !c.phone && "—"}
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs tabular-nums">{visits}</span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{fmtDate(c.created_at)}</td>
                    <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="opacity-0 group-hover:opacity-100 inline-flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(c)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setMergeFor(c)}>
                          <Merge className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <ul className="sm:hidden divide-y">
            {customers?.map((c: any) => {
              const visits = (c.bookings ?? []).filter((b: any) => b.status !== "cancelled").length;
              return (
                <li key={c.id} onClick={() => setOpenId(c.id)} className="px-4 py-3 flex items-center gap-3 cursor-pointer">
                  <CustomerAvatar customer={c} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {c.email || c.phone || "—"} · {visits} visit{visits === 1 ? "" : "s"}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <CustomerEditDialog
        editing={editing}
        businessId={bid}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["customers"] }); }}
      />

      <CustomerDetailDialog
        customerId={openId}
        businessId={bid}
        onClose={() => setOpenId(null)}
        onEdit={(c) => { setOpenId(null); setEditing(c); }}
        onDelete={() => { setOpenId(null); qc.invalidateQueries({ queryKey: ["customers"] }); }}
      />

      <MergeDialog
        target={mergeFor}
        onClose={() => setMergeFor(null)}
        onDone={() => { setMergeFor(null); qc.invalidateQueries({ queryKey: ["customers"] }); }}
        businessId={bid}
      />
    </div>
  );
}

function CustomerAvatar({ customer }: { customer: any }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!customer.avatar_url) return setUrl(null);
    signedUrl(customer.avatar_url).then(setUrl).catch(() => setUrl(null));
  }, [customer.avatar_url]);
  if (url) return <img src={url} alt={customer.name} className="h-10 w-10 rounded-full object-cover shrink-0" />;
  return (
    <div className="h-10 w-10 rounded-full bg-secondary grid place-items-center text-sm font-medium shrink-0">
      {customer.name?.[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

function CustomerEditDialog({ editing, businessId, onClose, onSaved }: {
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
    if (editing?.avatar_url) signedUrl(editing.avatar_url).then(setPreview).catch(() => setPreview(null));
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
      const { error } = await supabase.storage.from("business-assets").upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (error) throw error;
      await supabase.from("customers").update({ avatar_url: path } as any).eq("id", form.id);
      setForm((f) => ({ ...f, avatar_url: path }));
      const u = await signedUrl(path).catch(() => null);
      setPreview(u);
      toast.success("Photo updated");
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed");
    } finally { setUploading(false); }
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
        const { data, error } = await supabase.from("customers").insert(payload).select("id").single();
        if (error) throw error;
        setForm((f) => ({ ...f, id: data!.id }));
        toast.success("Customer added");
      }
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Could not save");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={!!editing} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{editing?.id ? "Edit customer" : "New customer"}</DialogTitle>
          <DialogDescription>Contact details and private notes.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-secondary grid place-items-center overflow-hidden shrink-0">
              {preview ? <img src={preview} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="h-5 w-5 text-muted-foreground" />}
            </div>
            <label className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs hover:bg-secondary/40 cursor-pointer">
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
              {preview ? "Change photo" : "Upload photo"}
              <input type="file" accept="image/*" className="hidden" onChange={onPhoto} disabled={uploading || !form.id} />
            </label>
          </div>
          <div>
            <Label>Name</Label>
            <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1.5 h-10" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1.5 h-10" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1.5 h-10" />
            </div>
          </div>
          <div>
            <Label>Address</Label>
            <Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} className="mt-1.5 h-10" placeholder="Optional" />
          </div>
          <div>
            <Label>Private notes</Label>
            <p className="text-[11px] text-muted-foreground mt-0.5 mb-1.5">
              Allergies, preferences, colour formulas, medical notes. Never visible to the customer.
            </p>
            <Textarea rows={4} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {form.id ? "Save changes" : "Add customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CustomerDetailDialog({ customerId, businessId, onClose, onEdit, onDelete }: {
  customerId: string | null;
  businessId: string | undefined;
  onClose: () => void;
  onEdit: (c: any) => void;
  onDelete: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["customer-detail", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data: customer } = await supabase.from("customers").select("*").eq("id", customerId!).single();
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
    const completed = bks.filter((b) => ["completed", "checked_in", "in_progress", "confirmed", "pending"].includes(b.status));
    const past = completed.filter((b) => new Date(b.starts_at) < new Date());
    const upcoming = bks.filter((b) => b.status !== "cancelled" && new Date(b.starts_at) >= new Date());
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
    const { error } = await supabase.from("customers").delete().eq("id", customerId);
    if (error) return toast.error(error.message);
    toast.success("Customer deleted");
    onDelete();
  };

  const c = data?.customer;
  return (
    <Dialog open={!!customerId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        {isLoading || !c ? (
          <div className="py-12 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-4">
                <CustomerAvatar customer={c} />
                <div className="min-w-0">
                  <DialogTitle className="font-display text-2xl truncate">{c.name}</DialogTitle>
                  <DialogDescription className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                    {c.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>}
                    {c.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>}
                    {c.address && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{c.address}</span>}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
              <Stat icon={Calendar} label="Visits" value={String(stats.visits)} />
              <Stat icon={DollarSign} label="Spent" value={fmtMoney(stats.spent)} />
              <Stat icon={Sparkles} label="Avg" value={fmtMoney(stats.avg)} />
              <Stat icon={Star} label="Favourite" value={stats.favService ?? "—"} />
            </div>

            <Tabs defaultValue="upcoming" className="mt-2">
              <TabsList className="w-full">
                <TabsTrigger value="upcoming" className="flex-1">Upcoming ({stats.upcoming.length})</TabsTrigger>
                <TabsTrigger value="past" className="flex-1">History ({stats.past.length})</TabsTrigger>
                <TabsTrigger value="notes" className="flex-1">Private notes</TabsTrigger>
              </TabsList>
              <TabsContent value="upcoming" className="mt-3">
                {stats.upcoming.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No upcoming bookings.</p>
                ) : (
                  <BookingList items={stats.upcoming} />
                )}
              </TabsContent>
              <TabsContent value="past" className="mt-3">
                {stats.past.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No past bookings yet.</p>
                ) : (
                  <BookingList items={stats.past} />
                )}
                {stats.favStaff && (
                  <p className="text-xs text-muted-foreground mt-3">
                    Favourite stylist: <b className="text-foreground">{stats.favStaff}</b>
                  </p>
                )}
              </TabsContent>
              <TabsContent value="notes" className="mt-3">
                {c.notes ? (
                  <div className="rounded-xl bg-secondary/40 p-4 text-sm whitespace-pre-wrap">{c.notes}</div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6">No private notes yet. Click Edit to add.</p>
                )}
              </TabsContent>
            </Tabs>

            <DialogFooter className="flex-wrap gap-2 mt-4">
              <ConfirmDialog
                trigger={<Button variant="destructive"><Trash2 className="h-4 w-4 mr-1.5" /> Delete</Button>}
                title={`Delete ${c.name}?`}
                description="Their booking history will also be removed. This can't be undone."
                confirmLabel="Delete customer"
                onConfirm={del}
              />
              <Button variant="outline" onClick={() => onEdit(c)}><Pencil className="h-4 w-4 mr-1.5" /> Edit</Button>
              <Button variant="ghost" onClick={onClose}>Close</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="font-display text-lg mt-0.5 truncate">{value}</div>
    </div>
  );
}

function BookingList({ items }: { items: any[] }) {
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {items.map((b) => {
        const m = statusMeta(b.status);
        return (
          <li key={b.id} className="px-4 py-3 flex items-center gap-3">
            <div className="text-center w-14 shrink-0">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{new Date(b.starts_at).toLocaleDateString([], { month: "short" })}</div>
              <div className="font-display text-xl tabular-nums leading-none">{new Date(b.starts_at).getDate()}</div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{b.services?.name ?? "Service"}</div>
              <div className="text-xs text-muted-foreground truncate">
                {fmtTime(b.starts_at)} · {b.staff?.name ?? "—"}
              </div>
            </div>
            <div className="text-right shrink-0">
              <Badge variant="outline" className="capitalize text-[10px]" style={{ background: m.tint, color: m.color, borderColor: m.color }}>
                {m.label}
              </Badge>
              <div className="text-xs text-muted-foreground tabular-nums mt-1">{fmtMoney(b.price_cents ?? 0)}</div>
            </div>
          </li>
        );
      })}
    </ul>
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
