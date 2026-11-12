import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { fmtMoney } from "@/lib/format";
import { rentSummary, rentToday, rentDateLabel as fmtDate, rentStatus, rentOutstanding } from "@/lib/rent";
import { Plus, Copy, Trash2, Mail, Check, Armchair, Wallet, CircleDollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { StudioUpgradePanel } from "@/components/studio-upgrade-panel";
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
import { getServerFnAuthHeaders } from "@/lib/server-fn-auth";
import {
  addRentPayment,
  generateNextRentPayment,
  getRentPayments,
  setRentPaymentStatus,
} from "@/lib/rent.functions";
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
  const isStudio = biz?.plan === "studio";

  const { data: links, isLoading: linksLoading, error: linksError } = useQuery({
    queryKey: ["salon-professionals", biz?.id],
    enabled: !!biz?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salon_professionals")
        .select("*")
        .eq("salon_business_id", biz!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = [...new Set((data ?? []).map(row => row.pro_business_id))];
      const {data: profiles, error: profileError} = ids.length ? await supabase.from("public_businesses").select("id,name,slug").in("id",ids) : {data: [], error: null};
      if (profileError) throw profileError;
      const byId = new Map((profiles ?? []).map(row => [row.id,row]));
      return (data ?? []).map(row => ({...row, pro:byId.get(row.pro_business_id)})) as any[];
    },
  });

  const { data: invites, isLoading: invLoading, error: invitesError } = useQuery({
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

  const { data: staffCount = 0 } = useQuery({
    queryKey: ["professional-team-seat-count", biz?.id],
    enabled: !!biz?.id && !isStudio,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("staff")
        .select("id", { count: "exact", head: true })
        .eq("business_id", biz!.id)
        .is("archived_at", null);
      if (error) throw error;
      return count ?? 0;
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
    if (error) return toast.error("Could not revoke the invitation. It may still be active; try again.");
    toast.success("Invitation revoked");
    qc.invalidateQueries({ queryKey: ["professional-invitations", biz?.id] });
  };

  const removeLink = async (id: string) => {
    const { data, error } = await supabase.from("salon_professionals").update({ status: "ended" }).eq("id", id).select("id").maybeSingle();
    if (error || !data) return toast.error("Could not unlink this professional. The link is still in place; try again.");
    toast.success("Professional unlinked");
    qc.invalidateQueries({ queryKey: ["salon-professionals", biz?.id] });
  };

  const isLoading = linksLoading || invLoading;
  const hasAny = (links?.length ?? 0) + (invites?.length ?? 0) > 0;
  const activeProfessionalCount = (links ?? []).filter((link: any) => link.status === "active").length;
  const pendingInviteCount = (invites ?? []).filter((invite: any) => new Date(invite.expires_at) > new Date()).length;
  const atFreeTeamLimit = !isStudio && staffCount + activeProfessionalCount + pendingInviteCount >= 1;

  return (
    <div className="p-5 sm:p-8 md:p-10 max-w-6xl">
      <PageHeader
        eyebrow="Team"
        title="Independent Professionals"
        subtitle="Invite self-employed people who rent a chair or room. They can share busy times with your calendar."
        action={
          <Button
            onClick={() => setInviteOpen(true)}
            className="shadow-glow"
            disabled={atFreeTeamLimit}
            title={atFreeTeamLimit ? "The free plan is limited to one team member" : undefined}
          >
            <Plus className="h-4 w-4 mr-1" /> Invite professional
          </Button>
        }
      />

      <Tabs defaultValue="team" className="min-w-0 space-y-5">
        <TabsList className="max-w-full bg-card border p-1">
          <TabsTrigger value="team"><Armchair className="h-3.5 w-3.5 mr-1.5" /> Team</TabsTrigger>
          <TabsTrigger value="rent"><CircleDollarSign className="h-3.5 w-3.5 mr-1.5" /> Rent</TabsTrigger>
        </TabsList>

        <TabsContent value="team">
      {linksError || invitesError ? <p role="alert" className="text-destructive">Professional links or invitations could not load. Please refresh.</p> : isLoading ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : !hasAny ? (
        <EmptyState
          icon={Armchair}
          title="No independent professionals yet"
          description="Invite someone by email. Once they join, customers can book them from your booking page."
          action={
            <Button onClick={() => setInviteOpen(true)} disabled={atFreeTeamLimit}>
              <Plus className="h-4 w-4 mr-1" /> Invite first professional
            </Button>
          }
        />
      ) : (
        <div className="space-y-10">
          {(links?.length ?? 0) > 0 && (
            <section>
              <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-3">
                Professional links · {links!.length}
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
                              <Badge variant="outline">{l.status}</Badge>
                            </div>
                            {l.chair_label && (
                              <p className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-1 truncate">
                                <Armchair className="h-3 w-3 shrink-0" /> {l.chair_label}
                              </p>
                            )}
                          </div>
                        </div>
                        {l.status !== "ended" && <ConfirmDialog
                          trigger={
                            <button
                              className="p-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary shrink-0"
                              aria-label={`Remove ${name} from your salon`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          }
                          title="Unlink this professional?"
                          description="Their bookings, customers and data stay with them. They will no longer appear on your calendar or booking page. Rent history is kept."
                          confirmLabel="Unlink"
                          onConfirm={async () => { await removeLink(l.id); }}
                        />}
                      </div>
                      {isStudio && <div className="mt-4 pt-3 border-t flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Wallet className="h-3.5 w-3.5 shrink-0" />
                        {rentSummary(l, biz?.currency)}
                      </div>}
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
                    {isStudio && <div className="mt-4 pt-3 border-t flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Wallet className="h-3.5 w-3.5 shrink-0" />
                      {rentSummary(inv, biz?.currency)}
                      <span className="ml-auto">Expires {new Date(inv.expires_at).toLocaleDateString()}</span>
                    </div>}
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
          {isStudio ? (
            <RentLedger businessId={biz?.id} links={links ?? []} currency={biz?.currency || "GBP"} timeZone={biz?.timezone || "Europe/London"} />
          ) : (
            <StudioUpgradePanel
              title="Rent and commission tracking are a Studio feature"
              description="Upgrade to record chair rent, commission agreements and payment history."
            />
          )}
        </TabsContent>
      </Tabs>

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        salonBusinessId={biz?.id}
        invitedBy={user?.id}
        isStudio={isStudio}
        currency={biz?.currency || "GBP"}
        onCreated={() => qc.invalidateQueries({ queryKey: ["professional-invitations", biz?.id] })}
      />
    </div>
  );
}

type RentRow = {
  id: string;
  salon_professional_id: string;
  period_start: string;
  period_end: string;
  amount_cents: number;
  currency?: string | null;
  status: "due" | "paid" | "waived" | "overdue";
  due_date: string | null;
  paid_at: string | null;
  notes: string | null;
};

function rentStatusBadge(row: RentRow, today: string) {
  const effective = rentStatus(row, today);
  const styles: Record<string, string> = {
    due: "bg-secondary text-secondary-foreground",
    overdue: "bg-destructive/15 text-destructive",
    paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    waived: "bg-secondary text-muted-foreground",
  };
  const label: Record<string, string> = { due: "Due", overdue: "Overdue", paid: "Paid", waived: "Waived" };
  return <Badge variant="outline" className={`border-transparent text-[10px] ${styles[effective]}`}>{label[effective]}</Badge>;
}

function RentLedger({ businessId, links, currency, timeZone }: { businessId: string | undefined; links: any[]; currency: string; timeZone: string }) {

  const today = rentToday(timeZone);
  const generationRequests = useRef<Record<string,string>>({});
  const generatingLock = useRef(false);
  const statusLock = useRef(new Set<string>());
  const qc = useQueryClient();
  const [addFor, setAddFor] = useState<any | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);

  const { data: rows, isLoading, error: rentError } = useQuery({
    queryKey: ["rent-payments", businessId, links.map((l) => l.id).join(",")],
    enabled: !!businessId && links.length > 0,
    queryFn: async () => {
      const headers = await getServerFnAuthHeaders();
      return await getRentPayments({ headers }) as RentRow[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["rent-payments", businessId] });

  const markStatus = async (row: RentRow, status: "paid" | "waived" | "due") => {
    if (statusLock.current.has(row.id)) return;
    statusLock.current.add(row.id);
    try {
      const headers = await getServerFnAuthHeaders();
      await setRentPaymentStatus({ data: { id: row.id, linkId: row.salon_professional_id, status }, headers });
    } catch (error) {
      return toast.error((error as Error).message);
    } finally { statusLock.current.delete(row.id); }
    toast.success(status === "paid" ? "Marked paid" : status === "waived" ? "Waived" : "Reopened");
    invalidate();
  };

  const generateNext = async (link: any) => {
    if (generatingLock.current) return;
    generatingLock.current = true;
    generationRequests.current[link.id] ??= crypto.randomUUID();
    setGenerating(link.id);
    try {
      const headers = await getServerFnAuthHeaders();
      await generateNextRentPayment({ data: { linkId: link.id, requestId: generationRequests.current[link.id] }, headers });
      delete generationRequests.current[link.id];
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
      generatingLock.current = false;
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

  const outstandingByCurrency = (rows ?? []).reduce<Record<string,RentRow[]>>((groups,row) => { (groups[row.currency ?? "unrecorded"] ??= []).push(row); return groups; }, {});
  const outstanding = Object.entries(outstandingByCurrency).map(([code, records]) => ({code, amount: rentOutstanding(records ?? [])})).filter(total => total.amount > 0);
  const recordMoney = (amount: number, code?: string | null) => code ? fmtMoney(amount, code) : (amount / 100).toFixed(2) + " (currency not recorded)";

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Record rent paid outside Bookzenvo. This ledger does not collect money or calculate commission automatically. Period end dates are not included in the rent period.</p>
      {outstanding.length > 0 && (
        <div className="rounded-2xl border bg-card p-5 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400 grid place-items-center shrink-0">
            <CircleDollarSign className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Outstanding</div>
            <div className="font-display text-xl">{outstanding.map(total => <div key={total.code}>{recordMoney(total.amount, total.code === "unrecorded" ? null : total.code)}</div>)}</div>
          </div>
        </div>
      )}

      {rentError && <p role="alert" className="text-sm text-destructive">Rent history could not load. Refresh before recording another payment.</p>}
      {links.map((link) => {
        const linkRows = (rows ?? []).filter((r) => r.salon_professional_id === link.id);
        return (
          <section key={link.id} className="rounded-2xl border bg-card p-5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
              <div className="min-w-0">
                <h3 className="font-medium truncate">{link.pro?.name ?? "Professional"}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{rentSummary(link, currency)} · {link.status}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {link.status === "active" && (link.rent_mode === "weekly" || link.rent_mode === "monthly") && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!generating}
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
                  <div key={row.id} className="grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 px-3.5 py-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="truncate">{fmtDate(row.period_start)} – {fmtDate(row.period_end)}</div>
                      <div className="text-xs text-muted-foreground">Due {fmtDate(row.due_date)}</div>
                    </div>
                    <div className="tabular-nums font-medium">{recordMoney(row.amount_cents, row.currency)}</div>
                    {rentStatusBadge(row, today)}
                    <div className="flex flex-wrap gap-1 justify-end">
                      {row.status !== "paid" && (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => markStatus(row, "paid")}>
                          Mark paid
                        </Button>
                      )}
                      {(row.status === "due" || row.status === "overdue") && (
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

      <AddRentPaymentDialog link={addFor} currency={currency} timeZone={timeZone} onOpenChange={(o) => !o && setAddFor(null)} onSaved={invalidate} />
    </div>
  );
}

function AddRentPaymentDialog({ link, currency, timeZone, onOpenChange, onSaved }: { link: any | null; currency: string; timeZone: string; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const today = rentToday(timeZone);
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0,10);
  const requestId = useRef<string | null>(null);
  const saveLock = useRef(false);
  const [periodStart, setPeriodStart] = useState(today);
  const [periodEnd, setPeriodEnd] = useState(tomorrow);
  const [dueDate, setDueDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setPeriodStart(today); setPeriodEnd(tomorrow); setDueDate(today); requestId.current = null; setAmount(""); setAlreadyPaid(false);
  };

  const submit = async () => {
    if (!link || saveLock.current) return;
    if (!/^\d+(?:\.\d{1,2})?$/.test(amount.trim())) return toast.error("Enter a positive amount with at most two decimal places");
    const cents = Math.round(Number(amount) * 100);
    if (!(cents > 0)) return toast.error(`Enter an amount greater than ${fmtMoney(0, currency)}`);
    if (periodEnd <= periodStart) return toast.error("Period end must be after the start; the end date is not included");
    saveLock.current = true;
    requestId.current ??= crypto.randomUUID();
    setBusy(true);
    try {
      const headers = await getServerFnAuthHeaders();
      await addRentPayment({
        data: {
          linkId: link.id,
          requestId: requestId.current,
          periodStart,
          periodEnd,
          dueDate,
          amountCents: cents,
          alreadyPaid,
        },
        headers,
      });
      toast.success("Payment added");
      onSaved();
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Could not add payment");
    } finally {
      saveLock.current = false;
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!link} onOpenChange={(o) => { if (busy) return; if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Add a rent payment</DialogTitle>
          <DialogDescription>For {link?.pro?.name ?? "this professional"}. Useful for percentage/per-booking commission, or logging something outside the usual cadence.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="rent-start" className="text-xs uppercase tracking-wide text-muted-foreground">Period start</Label>
              <Input id="rent-start" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="mt-1.5 h-10" />
            </div>
            <div>
              <Label htmlFor="rent-end" className="text-xs uppercase tracking-wide text-muted-foreground">Period end (not included)</Label>
              <Input id="rent-end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="mt-1.5 h-10" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="rent-amount" className="text-xs uppercase tracking-wide text-muted-foreground">Amount</Label>
              <Input id="rent-amount" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="mt-1.5 h-10" />
            </div>
            <div>
              <Label htmlFor="rent-due" className="text-xs uppercase tracking-wide text-muted-foreground">Due date</Label>
              <Input id="rent-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1.5 h-10" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={alreadyPaid} onChange={(e) => setAlreadyPaid(e.target.checked)} className="h-4 w-4 rounded border" />
            Already paid
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => { reset(); onOpenChange(false); }} disabled={busy}>Cancel</Button>
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
  isStudio,
  currency,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  salonBusinessId: string | undefined;
  invitedBy: string | undefined;
  isStudio: boolean;
  currency: string;
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
    if (isStudio && (mode === "weekly" || mode === "monthly" || mode === "fixed_commission") && (!/^\d+(?:\.\d{1,2})?$/.test(amount.trim()) || !(Number(amount) > 0))) {
      return toast.error(`Enter an amount greater than ${fmtMoney(0, currency)}`);
    }
    if (isStudio && mode === "percentage") {
      const pct = Number(percent);
      if (!/^\d+(?:\.\d{1,2})?$/.test(percent.trim()) || pct < 0 || pct > 100) return toast.error("Enter a percentage between 0 and 100");
    }
    setBusy(true);
    try {
      const payload: any = {
        salon_business_id: salonBusinessId,
        invited_by: invitedBy,
        email: email.trim().toLowerCase(),
        chair_label: chair.trim() || null,
        rent_mode: isStudio ? mode : "none",
        rent_amount_cents:
          isStudio && (mode === "weekly" || mode === "monthly" || mode === "fixed_commission")
            ? Math.round(parseFloat(amount || "0") * 100)
            : null,
        commission_percent: isStudio && mode === "percentage" ? parseFloat(percent || "0") : null,
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
              ? "Send this link to the professional. They'll create their own Bookzenvo account and business — nothing on your side changes until they accept."
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
            {isStudio && <div className="rounded-xl bg-secondary/40 p-3.5 space-y-3">
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
            </div>}
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
