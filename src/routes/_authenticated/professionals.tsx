import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Copy, Trash2, Mail, Check, Armchair, Wallet, CircleDollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/professionals")({
  component: ProfessionalsPage,
});

type RentMode = "none" | "weekly" | "monthly" | "percentage" | "fixed_commission";

const AVATAR_TINTS = [
  "from-orange-200 to-rose-200 text-rose-900",
  "from-amber-200 to-yellow-100 text-amber-900",
  "from-emerald-200 to-teal-100 text-emerald-900",
  "from-sky-200 to-indigo-100 text-indigo-900",
  "from-violet-200 to-fuchsia-100 text-violet-900",
];

function ProfessionalsPage() {
  const { data: biz } = useMyBusiness();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data: links, isLoading: linksLoading } = useQuery({
    queryKey: ["salon-professionals", biz?.id],
    enabled: !!biz?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salon_professionals")
        .select("*, pro:pro_business_id(id,name,slug,email)")
        .eq("salon_business_id", biz!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: invites, isLoading: invLoading } = useQuery({
    queryKey: ["professional-invitations", biz?.id],
    enabled: !!biz?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professional_invitations")
        .select("*")
        .eq("salon_business_id", biz!.id)
        .in("status", ["pending"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const copyLink = async (token: string) => {
    const url = `${window.location.origin}/invite/${token}`;
    await navigator.clipboard.writeText(url);
    toast.success("Invite link copied");
  };

  const revoke = async (id: string) => {
    const { error } = await supabase
      .from("professional_invitations")
      .update({ status: "revoked" })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Invitation revoked");
    qc.invalidateQueries({ queryKey: ["professional-invitations", biz?.id] });
  };

  const removeLink = async (id: string) => {
    const { error } = await supabase.from("salon_professionals").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Professional unlinked");
    qc.invalidateQueries({ queryKey: ["salon-professionals", biz?.id] });
  };

  const isLoading = linksLoading || invLoading;
  const hasAny = (links?.length ?? 0) + (invites?.length ?? 0) > 0;

  return (
    <div className="p-5 sm:p-8 md:p-10 max-w-6xl">
      <PageHeader
        eyebrow="Team"
        title="Independent Professionals"
        subtitle="Rent chairs or rooms to self-employed pros. They run their own business, but appear together with your team on one calendar and one booking page."
        action={
          <Button onClick={() => setInviteOpen(true)} className="shadow-glow">
            <Plus className="h-4 w-4 mr-1" /> Invite professional
          </Button>
        }
      />

      <Tabs defaultValue="team" className="space-y-5">
        <TabsList className="bg-card border p-1">
          <TabsTrigger value="team"><Armchair className="h-3.5 w-3.5 mr-1.5" /> Team</TabsTrigger>
          <TabsTrigger value="rent"><CircleDollarSign className="h-3.5 w-3.5 mr-1.5" /> Rent</TabsTrigger>
        </TabsList>

        <TabsContent value="team">
      {isLoading ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : !hasAny ? (
        <EmptyState
          icon={Armchair}
          title="No independent professionals yet"
          description="Invite a self-employed pro by email. They'll create their own Luma account and business, then show up on your shared calendar and booking page."
          action={
            <Button onClick={() => setInviteOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Invite first professional
            </Button>
          }
        />
      ) : (
        <div className="space-y-10">
          {(links?.length ?? 0) > 0 && (
            <section>
              <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-3">
                Active · {links!.length}
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {links!.map((l: any, i: number) => {
                  const tint = AVATAR_TINTS[i % AVATAR_TINTS.length];
                  const name = l.pro?.name ?? "Professional";
                  return (
                    <div
                      key={l.id}
                      className={`group relative overflow-hidden rounded-2xl border bg-card p-5 card-hover animate-rise stagger-${(i % 6) + 1}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`h-12 w-12 shrink-0 rounded-full bg-gradient-to-br ${tint} grid place-items-center font-display text-lg`}
                          >
                            {name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <h3 className="font-medium truncate">{name}</h3>
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" title="Active" />
                            </div>
                            {l.chair_label && (
                              <p className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-1 truncate">
                                <Armchair className="h-3 w-3 shrink-0" /> {l.chair_label}
                              </p>
                            )}
                          </div>
                        </div>
                        <ConfirmDialog
                          trigger={
                            <button
                              className="p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive shrink-0"
                              aria-label="Unlink"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          }
                          title="Unlink this professional?"
                          description="Their bookings, customers and data stay with them. They will no longer appear on your calendar or booking page."
                          confirmLabel="Unlink"
                          onConfirm={async () => { await removeLink(l.id); }}
                        />
                      </div>
                      <div className="mt-4 pt-3 border-t flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Wallet className="h-3.5 w-3.5 shrink-0" />
                        {rentSummary(l)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {(invites?.length ?? 0) > 0 && (
            <section>
              <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-3">
                Pending invitations · {invites!.length}
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {invites!.map((inv: any, i: number) => (
                  <div
                    key={inv.id}
                    className={`rounded-2xl border border-dashed bg-card/50 p-5 animate-rise stagger-${(i % 6) + 1}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-12 w-12 shrink-0 rounded-full bg-secondary grid place-items-center text-muted-foreground">
                          <Mail className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <span className="font-medium truncate block">{inv.email}</span>
                          {inv.chair_label && (
                            <p className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-1 truncate">
                              <Armchair className="h-3 w-3 shrink-0" /> {inv.chair_label}
                            </p>
                          )}
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-[10px] shrink-0">Pending</Badge>
                    </div>
                    <div className="mt-4 pt-3 border-t flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Wallet className="h-3.5 w-3.5 shrink-0" />
                      {rentSummary(inv)}
                      <span className="ml-auto">Expires {new Date(inv.expires_at).toLocaleDateString()}</span>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => copyLink(inv.token)}>
                        <Copy className="h-3.5 w-3.5 mr-1" /> Copy invite link
                      </Button>
                      <ConfirmDialog
                        trigger={
                          <Button size="sm" variant="ghost" className="text-muted-foreground">
                            Revoke
                          </Button>
                        }
                        title="Revoke this invitation?"
                        confirmLabel="Revoke"
                        onConfirm={async () => { await revoke(inv.id); }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
        </TabsContent>

        <TabsContent value="rent">
          <RentLedger businessId={biz?.id} links={(links ?? []).filter((l: any) => l.status === "active")} />
        </TabsContent>
      </Tabs>

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        salonBusinessId={biz?.id}
        invitedBy={user?.id}
        onCreated={() => qc.invalidateQueries({ queryKey: ["professional-invitations", biz?.id] })}
      />
    </div>
  );
}

function rentSummary(l: {
  rent_mode: RentMode;
  rent_amount_cents: number | null;
  commission_percent: number | null;
}) {
  const money = (c: number | null) =>
    c == null ? "—" : `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  switch (l.rent_mode) {
    case "weekly":
      return `${money(l.rent_amount_cents)} / week`;
    case "monthly":
      return `${money(l.rent_amount_cents)} / month`;
    case "percentage":
      return `${l.commission_percent ?? 0}% commission`;
    case "fixed_commission":
      return `${money(l.rent_amount_cents)} per booking`;
    default:
      return "No rent agreement";
  }
}

type RentRow = {
  id: string;
  salon_professional_id: string;
  period_start: string;
  period_end: string;
  amount_cents: number;
  status: "due" | "paid" | "waived" | "overdue";
  due_date: string | null;
  paid_at: string | null;
  notes: string | null;
};

function money(c: number) {
  return `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";
}

function rentStatusBadge(row: RentRow) {
  const effective = row.status === "due" && row.due_date && new Date(row.due_date) < new Date() ? "overdue" : row.status;
  const styles: Record<string, string> = {
    due: "bg-secondary text-secondary-foreground",
    overdue: "bg-destructive/15 text-destructive",
    paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    waived: "bg-secondary text-muted-foreground",
  };
  const label: Record<string, string> = { due: "Due", overdue: "Overdue", paid: "Paid", waived: "Waived" };
  return <Badge variant="outline" className={`border-transparent text-[10px] ${styles[effective]}`}>{label[effective]}</Badge>;
}

function RentLedger({ businessId, links }: { businessId: string | undefined; links: any[] }) {
  const qc = useQueryClient();
  const [addFor, setAddFor] = useState<any | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["rent-payments", businessId, links.map((l) => l.id).join(",")],
    enabled: !!businessId && links.length > 0,
    queryFn: async () => {
      const linkIds = links.map((l) => l.id);
      const { data, error } = await supabase
        .from("rent_payments")
        .select("*")
        .in("salon_professional_id", linkIds)
        .order("period_start", { ascending: false });
      if (error) throw error;
      return data as RentRow[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["rent-payments", businessId] });

  const markStatus = async (row: RentRow, status: "paid" | "waived" | "due") => {
    const { error } = await supabase
      .from("rent_payments")
      .update({ status, paid_at: status === "paid" ? new Date().toISOString() : null })
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success(status === "paid" ? "Marked paid" : status === "waived" ? "Waived" : "Reopened");
    invalidate();
  };

  const generateNext = async (link: any) => {
    setGenerating(link.id);
    try {
      const { error } = await supabase.rpc("generate_rent_payment" as any, { _link_id: link.id });
      if (error) throw error;
      toast.success("Generated next period");
      invalidate();
    } catch (e: any) {
      if ((e.message ?? "").includes("NOTHING_DUE")) {
        toast.info("Nothing due yet — the current period hasn't ended.");
      } else {
        toast.error(e.message ?? "Could not generate");
      }
    } finally {
      setGenerating(null);
    }
  };

  if (links.length === 0) {
    return (
      <EmptyState
        icon={CircleDollarSign}
        title="No active rent agreements"
        description="Rent terms are set per professional when you invite them, or you can add one below once they've joined."
      />
    );
  }

  const outstanding = (rows ?? []).filter((r) => r.status === "due").reduce((a, r) => a + r.amount_cents, 0);

  return (
    <div className="space-y-6">
      {outstanding > 0 && (
        <div className="rounded-2xl border bg-card p-5 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400 grid place-items-center shrink-0">
            <CircleDollarSign className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Outstanding</div>
            <div className="font-display text-xl">{money(outstanding)}</div>
          </div>
        </div>
      )}

      {links.map((link) => {
        const linkRows = (rows ?? []).filter((r) => r.salon_professional_id === link.id);
        return (
          <section key={link.id} className="rounded-2xl border bg-card p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <h3 className="font-medium truncate">{link.pro?.name ?? "Professional"}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{rentSummary(link)}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                {(link.rent_mode === "weekly" || link.rent_mode === "monthly") && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={generating === link.id}
                    onClick={() => generateNext(link)}
                  >
                    {generating === link.id ? "Generating…" : "Generate next period"}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setAddFor(link)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add payment
                </Button>
              </div>
            </div>

            {linkRows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No rent history yet.</p>
            ) : (
              <div className="rounded-xl border overflow-hidden divide-y">
                {linkRows.map((row) => (
                  <div key={row.id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-3.5 py-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="truncate">{fmtDate(row.period_start)} – {fmtDate(row.period_end)}</div>
                      <div className="text-xs text-muted-foreground">Due {fmtDate(row.due_date)}</div>
                    </div>
                    <div className="tabular-nums font-medium">{money(row.amount_cents)}</div>
                    {rentStatusBadge(row)}
                    <div className="flex gap-1 justify-end">
                      {row.status !== "paid" && (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => markStatus(row, "paid")}>
                          Mark paid
                        </Button>
                      )}
                      {row.status === "due" && (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => markStatus(row, "waived")}>
                          Waive
                        </Button>
                      )}
                      {row.status !== "due" && (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => markStatus(row, "due")}>
                          Reopen
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}

      {isLoading && <Skeleton className="h-24 rounded-2xl" />}

      <AddRentPaymentDialog link={addFor} onOpenChange={(o) => !o && setAddFor(null)} onSaved={invalidate} />
    </div>
  );
}

function AddRentPaymentDialog({ link, onOpenChange, onSaved }: { link: any | null; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [periodStart, setPeriodStart] = useState(today);
  const [periodEnd, setPeriodEnd] = useState(today);
  const [dueDate, setDueDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setPeriodStart(today); setPeriodEnd(today); setDueDate(today); setAmount(""); setAlreadyPaid(false);
  };

  const submit = async () => {
    if (!link) return;
    const cents = Math.round(parseFloat(amount || "0") * 100);
    if (!(cents > 0)) return toast.error("Enter an amount greater than $0");
    setBusy(true);
    try {
      const { error } = await supabase.from("rent_payments").insert({
        salon_professional_id: link.id,
        period_start: periodStart,
        period_end: periodEnd,
        due_date: dueDate,
        amount_cents: cents,
        status: alreadyPaid ? "paid" : "due",
        paid_at: alreadyPaid ? new Date().toISOString() : null,
      });
      if (error) throw error;
      toast.success("Payment added");
      onSaved();
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Could not add payment");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!link} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Add a rent payment</DialogTitle>
          <DialogDescription>For {link?.pro?.name ?? "this professional"}. Useful for percentage/per-booking commission, or logging something outside the usual cadence.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Period start</Label>
              <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="mt-1.5 h-10" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Period end</Label>
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="mt-1.5 h-10" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Amount</Label>
              <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="mt-1.5 h-10" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1.5 h-10" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={alreadyPaid} onChange={(e) => setAlreadyPaid(e.target.checked)} className="h-4 w-4 rounded border" />
            Already paid
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Saving…" : "Add payment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InviteDialog({
  open,
  onOpenChange,
  salonBusinessId,
  invitedBy,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  salonBusinessId: string | undefined;
  invitedBy: string | undefined;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState("");
  const [chair, setChair] = useState("");
  const [mode, setMode] = useState<RentMode>("none");
  const [amount, setAmount] = useState("");
  const [percent, setPercent] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  const reset = () => {
    setEmail(""); setChair(""); setMode("none"); setAmount(""); setPercent("");
    setMessage(""); setCreatedToken(null);
  };

  const submit = async () => {
    if (!salonBusinessId || !invitedBy) return;
    if (!email.trim()) return toast.error("Email is required");
    if ((mode === "weekly" || mode === "monthly" || mode === "fixed_commission") && !(parseFloat(amount || "0") > 0)) {
      return toast.error("Enter an amount greater than $0");
    }
    if (mode === "percentage") {
      const pct = parseFloat(percent || "0");
      if (!(pct > 0) || pct > 100) return toast.error("Enter a percentage between 0 and 100");
    }
    setBusy(true);
    try {
      const payload: any = {
        salon_business_id: salonBusinessId,
        invited_by: invitedBy,
        email: email.trim().toLowerCase(),
        chair_label: chair.trim() || null,
        rent_mode: mode,
        rent_amount_cents:
          mode === "weekly" || mode === "monthly" || mode === "fixed_commission"
            ? Math.round(parseFloat(amount || "0") * 100)
            : null,
        commission_percent: mode === "percentage" ? parseFloat(percent || "0") : null,
        message: message.trim() || null,
      };
      const { data, error } = await supabase
        .from("professional_invitations")
        .insert(payload)
        .select("token")
        .single();
      if (error) throw error;
      setCreatedToken(data.token);
      onCreated();
      toast.success("Invitation created");
    } catch (e: any) {
      toast.error(e.message ?? "Could not create invitation");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!createdToken) return;
    const url = `${window.location.origin}/invite/${createdToken}`;
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {createdToken ? "Invitation ready to share" : "Invite an independent professional"}
          </DialogTitle>
          <DialogDescription>
            {createdToken
              ? "Send this link to the professional. They'll create their own Luma account and business — nothing on your side changes until they accept."
              : "They'll sign up and manage their own business. Your calendar and booking page will show them alongside your team."}
          </DialogDescription>
        </DialogHeader>

        {createdToken ? (
          <div className="space-y-4 animate-rise">
            <div className="mx-auto h-14 w-14 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 grid place-items-center">
              <Check className="h-6 w-6" />
            </div>
            <div className="rounded-xl border bg-secondary/40 p-3 text-xs break-all font-mono">
              {`${window.location.origin}/invite/${createdToken}`}
            </div>
            <div className="flex gap-2">
              <Button onClick={copy} className="flex-1">
                <Copy className="h-4 w-4 mr-2" /> Copy link
              </Button>
              <Button variant="outline" onClick={() => { reset(); }}>
                Create another
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="sarah@example.com"
                className="mt-1.5 h-10"
              />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Chair or room label (optional)</Label>
              <div className="relative mt-1.5">
                <Armchair className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={chair}
                  onChange={(e) => setChair(e.target.value)}
                  placeholder="Chair 3 · Window"
                  className="h-10 pl-8"
                />
              </div>
            </div>
            <div className="rounded-xl bg-secondary/40 p-3.5 space-y-3">
              <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                <Wallet className="h-3.5 w-3.5" /> Rent agreement
              </div>
              <Select value={mode} onValueChange={(v) => setMode(v as RentMode)}>
                <SelectTrigger className="h-10 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No agreement yet</SelectItem>
                  <SelectItem value="weekly">Weekly rent</SelectItem>
                  <SelectItem value="monthly">Monthly rent</SelectItem>
                  <SelectItem value="percentage">Percentage commission</SelectItem>
                  <SelectItem value="fixed_commission">Fixed commission per booking</SelectItem>
                </SelectContent>
              </Select>
              {(mode === "weekly" || mode === "monthly" || mode === "fixed_commission") && (
                <Input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="h-10 bg-background"
                />
              )}
              {mode === "percentage" && (
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                  placeholder="30"
                  className="h-10 bg-background"
                />
              )}
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Personal note <span className="text-muted-foreground/60 normal-case">(optional)</span></Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Looking forward to having you at the salon!"
                className="mt-1.5"
                rows={3}
              />
            </div>
            <p className="text-xs text-muted-foreground text-pretty">
              After you create the invitation you'll get a link to send them. Payments, customers,
              revenue and reports stay completely separate — you'll only see their bookings on the
              shared calendar with their permission.
            </p>
          </div>
        )}

        {!createdToken && (
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? "Creating…" : "Create invitation"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
