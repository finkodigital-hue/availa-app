import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Copy, Trash2, Mail, Check, UserPlus, Users } from "lucide-react";
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
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/professionals")({
  component: ProfessionalsPage,
});

type RentMode = "none" | "weekly" | "monthly" | "percentage" | "fixed_commission";

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

      {isLoading ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : !hasAny ? (
        <EmptyState
          icon={UserPlus}
          title="No independent professionals yet"
          description="Invite a self-employed pro by email. They'll create their own Luma account and business, then show up on your shared calendar."
          action={
            <Button onClick={() => setInviteOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Invite first professional
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          {(links?.length ?? 0) > 0 && (
            <section>
              <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-3">
                Active
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {links!.map((l: any) => (
                  <div key={l.id} className="rounded-2xl border bg-card p-5 card-hover">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium truncate">{l.pro?.name ?? "Professional"}</h3>
                          <Badge variant="secondary" className="text-[10px]">Independent</Badge>
                        </div>
                        {l.chair_label && (
                          <p className="text-xs text-muted-foreground mt-1">{l.chair_label}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {rentSummary(l)}
                        </p>
                      </div>
                      <ConfirmDialog
                        trigger={
                          <button className="p-2 rounded-lg hover:bg-destructive/10 hover:text-destructive" aria-label="Unlink">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        }
                        title="Unlink this professional?"
                        description="Their bookings, customers and data stay with them. They will no longer appear on your calendar."
                        confirmLabel="Unlink"
                        onConfirm={async () => { await removeLink(l.id); }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {(invites?.length ?? 0) > 0 && (
            <section>
              <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-3">
                Pending invitations
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {invites!.map((inv: any) => (
                  <div key={inv.id} className="rounded-2xl border bg-card p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="font-medium truncate">{inv.email}</span>
                        </div>
                        {inv.chair_label && (
                          <p className="text-xs text-muted-foreground mt-1">{inv.chair_label}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {rentSummary(inv)} · expires {new Date(inv.expires_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" variant="outline" onClick={() => copyLink(inv.token)}>
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
          <div className="space-y-3">
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
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="sarah@example.com"
                className="mt-1.5 h-10"
              />
            </div>
            <div>
              <Label>Chair or room label (optional)</Label>
              <Input
                value={chair}
                onChange={(e) => setChair(e.target.value)}
                placeholder="Chair 3 · Window"
                className="mt-1.5 h-10"
              />
            </div>
            <div>
              <Label>Rent agreement</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as RentMode)}>
                <SelectTrigger className="mt-1.5 h-10">
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
            </div>
            {(mode === "weekly" || mode === "monthly" || mode === "fixed_commission") && (
              <div>
                <Label>Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="mt-1.5 h-10"
                />
              </div>
            )}
            {mode === "percentage" && (
              <div>
                <Label>Percentage of revenue</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                  placeholder="30"
                  className="mt-1.5 h-10"
                />
              </div>
            )}
            <div>
              <Label>Personal note (optional)</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Looking forward to having you at the salon!"
                className="mt-1.5"
                rows={3}
              />
            </div>
            <p className="text-xs text-muted-foreground">
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
