import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Copy, Gift, Loader2, Plus, TicketCheck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { fmtMoney } from "@/lib/format";
import { getServerFnAuthHeaders } from "@/lib/server-fn-auth";
import { issueGiftCard, redeemGiftCard } from "@/lib/gift-card.functions";

export const Route = createFileRoute("/_authenticated/gift-cards")({ component: GiftCardsPage });

type GiftCardRow = {
  id: string;
  code_hint: string;
  initial_balance_cents: number;
  balance_cents: number;
  currency: string;
  recipient_name: string | null;
  recipient_email: string | null;
  status: string;
  source: string;
  created_at: string;
};

function GiftCardsPage() {
  const { data: business } = useMyBusiness();
  const businessId = business?.id;
  const currency = business?.currency ?? "GBP";
  const qc = useQueryClient();
  const [showIssue, setShowIssue] = useState(false);
  const [amount, setAmount] = useState("25");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [message, setMessage] = useState("");
  const [newCode, setNewCode] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [bookingId, setBookingId] = useState("");
  const [redeemCode, setRedeemCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);

  const cards = useQuery({
    queryKey: ["gift-cards", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("gift_cards")
        .select("id, code_hint, initial_balance_cents, balance_cents, currency, recipient_name, recipient_email, status, source, created_at")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as GiftCardRow[];
    },
  });

  const transactions = useQuery({
    queryKey: ["gift-card-transactions", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("gift_card_transactions")
        .select("id, gift_card_id, booking_id, type, amount_cents, balance_after_cents, created_at")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return data ?? [];
    },
  });

  const bookings = useQuery({
    queryKey: ["gift-card-payable-bookings", businessId],
    enabled: !!businessId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, customer_name, starts_at, price_cents, amount_paid_cents")
        .eq("business_id", businessId!)
        .neq("status", "cancelled")
        .order("starts_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []).filter((row) => (row.price_cents ?? 0) > (row.amount_paid_cents ?? 0));
    },
  });

  const activeValue = (cards.data ?? []).filter((card) => card.status === "active").reduce((sum, card) => sum + card.balance_cents, 0);

  const submitIssue = async (event: React.FormEvent) => {
    event.preventDefault();
    setIssuing(true);
    try {
      const headers = await getServerFnAuthHeaders();
      const result = await issueGiftCard({ data: {
        amountCents: Math.round(Number(amount) * 100), recipientName, recipientEmail, message,
      }, headers });
      setNewCode(result.code);
      qc.invalidateQueries({ queryKey: ["gift-cards", businessId] });
      qc.invalidateQueries({ queryKey: ["gift-card-transactions", businessId] });
      toast.success("Gift card issued.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not issue gift card.");
    } finally { setIssuing(false); }
  };

  const submitRedemption = async (event: React.FormEvent) => {
    event.preventDefault();
    setRedeeming(true);
    try {
      const headers = await getServerFnAuthHeaders();
      const result = await redeemGiftCard({ data: {
        bookingId, code: redeemCode, requestId: crypto.randomUUID(),
      }, headers });
      toast.success(`${fmtMoney(result.amountCents, currency)} applied. ${fmtMoney(result.balanceCents, currency)} remains.`);
      setRedeemCode("");
      setBookingId("");
      qc.invalidateQueries({ queryKey: ["gift-cards", businessId] });
      qc.invalidateQueries({ queryKey: ["gift-card-transactions", businessId] });
      qc.invalidateQueries({ queryKey: ["gift-card-payable-bookings", businessId] });
      qc.invalidateQueries({ queryKey: ["payments", businessId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not redeem gift card.");
    } finally { setRedeeming(false); }
  };

  return (
    <div className="p-5 sm:p-8 md:p-10 max-w-6xl">
      <PageHeader eyebrow="Revenue" title="Gift cards" subtitle="Sell experiences now and let customers book later." />

      <div className="grid gap-4 sm:grid-cols-3 mb-7">
        <div className="rounded-2xl border bg-card p-5"><div className="text-sm text-muted-foreground">Active cards</div><div className="font-display text-3xl mt-1">{(cards.data ?? []).filter((c) => c.status === "active").length}</div></div>
        <div className="rounded-2xl border bg-card p-5"><div className="text-sm text-muted-foreground">Value remaining</div><div className="font-display text-3xl mt-1">{fmtMoney(activeValue, currency)}</div></div>
        <div className="rounded-2xl border bg-card p-5 flex flex-col justify-between gap-4">
          <div><div className="text-sm text-muted-foreground">Public purchase page</div><div className="text-sm font-medium truncate mt-1">/gift/{business?.slug}</div></div>
          <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/gift/${business?.slug}`); toast.success("Gift card link copied."); }} disabled={!business?.slug}><Copy className="h-4 w-4 mr-2" />Copy link</Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <section>
          <div className="flex items-center justify-between gap-3 mb-3"><h2 className="font-display text-2xl">Issued cards</h2><Button size="sm" onClick={() => { setShowIssue((value) => !value); setNewCode(null); }}><Plus className="h-4 w-4 mr-1.5" />Issue card</Button></div>
          {showIssue && (
            <form onSubmit={submitIssue} className="rounded-2xl border bg-card p-5 mb-4 space-y-4">
              {newCode ? (
                <div className="text-center py-3">
                  <div className="text-sm text-muted-foreground">Copy this code now and send it to the customer</div>
                  <button type="button" onClick={() => { navigator.clipboard.writeText(newCode); toast.success("Code copied."); }} className="mt-3 rounded-xl border bg-background px-5 py-3 font-mono text-lg font-semibold tracking-wider">{newCode}<Copy className="inline h-4 w-4 ml-2" /></button>
                  <div className="mt-4"><Button type="button" variant="ghost" onClick={() => { setShowIssue(false); setNewCode(null); setRecipientName(""); setRecipientEmail(""); setMessage(""); }}>Done</Button></div>
                </div>
              ) : (
                <>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div><Label htmlFor="issue-amount">Value in pounds</Label><Input id="issue-amount" className="mt-1.5" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required /></div>
                    <div><Label htmlFor="issue-name">Recipient</Label><Input id="issue-name" className="mt-1.5" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} required maxLength={120} /></div>
                    <div className="sm:col-span-2"><Label htmlFor="issue-email">Email <span className="text-muted-foreground">(optional)</span></Label><Input id="issue-email" className="mt-1.5" type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} maxLength={254} /></div>
                  </div>
                  <div><Label htmlFor="issue-message">Message <span className="text-muted-foreground">(optional)</span></Label><Textarea id="issue-message" className="mt-1.5" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} rows={2} /></div>
                  <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setShowIssue(false)}>Cancel</Button><Button type="submit" disabled={issuing}>{issuing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Issue gift card</Button></div>
                </>
              )}
            </form>
          )}

          {cards.isLoading ? <div className="h-36 rounded-2xl border bg-card animate-pulse" /> : (cards.data?.length ?? 0) === 0 ? (
            <EmptyState icon={Gift} title="No gift cards yet" description="Share your purchase link or issue a complimentary card for a customer." />
          ) : (
            <div className="rounded-2xl border bg-card overflow-hidden divide-y">
              {cards.data!.map((card) => (
                <div key={card.id} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-3.5">
                  <div className="min-w-0"><div className="font-medium truncate">{card.recipient_name || "Gift card"}</div><div className="text-xs text-muted-foreground">Code ending {card.code_hint} · {card.source === "stripe_purchase" ? "Purchased online" : "Issued by salon"}</div></div>
                  <Badge variant={card.status === "active" ? "default" : "secondary"}>{card.status}</Badge>
                  <div className="hidden sm:block text-right tabular-nums"><div className="font-medium">{fmtMoney(card.balance_cents, card.currency)}</div><div className="text-xs text-muted-foreground">of {fmtMoney(card.initial_balance_cents, card.currency)}</div></div>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <form onSubmit={submitRedemption} className="rounded-2xl border bg-card p-5 space-y-4">
            <div className="flex gap-3"><div className="h-10 w-10 rounded-xl bg-secondary grid place-items-center"><TicketCheck className="h-5 w-5" /></div><div><h2 className="font-medium">Redeem a gift card</h2><p className="text-xs text-muted-foreground mt-0.5">The correct amount is calculated automatically.</p></div></div>
            <div><Label htmlFor="redeem-code">Gift card code</Label><Input id="redeem-code" className="mt-1.5 font-mono uppercase" placeholder="BZV-XXXX-XXXX-XXXX" value={redeemCode} onChange={(e) => setRedeemCode(e.target.value.toUpperCase())} maxLength={18} required /></div>
            <div><Label>Booking</Label><Select value={bookingId} onValueChange={setBookingId} required><SelectTrigger className="mt-1.5"><SelectValue placeholder="Choose an unpaid booking" /></SelectTrigger><SelectContent>{bookings.data?.map((booking) => <SelectItem key={booking.id} value={booking.id}>{booking.customer_name} · {new Date(booking.starts_at).toLocaleDateString()} · {fmtMoney((booking.price_cents ?? 0) - (booking.amount_paid_cents ?? 0), currency)}</SelectItem>)}</SelectContent></Select></div>
            <Button type="submit" className="w-full" disabled={redeeming || !bookingId || !redeemCode}>{redeeming && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Apply to booking</Button>
          </form>

          <section>
            <h2 className="font-display text-xl mb-3">Recent activity</h2>
            <div className="rounded-2xl border bg-card divide-y">
              {(transactions.data?.length ?? 0) === 0 ? <p className="p-5 text-sm text-muted-foreground">No activity yet.</p> : transactions.data!.map((item: any) => (
                <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><div><div className="font-medium capitalize">{item.type}</div><div className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString()}</div></div><div className={`font-medium tabular-nums ${item.amount_cents < 0 ? "text-muted-foreground" : ""}`}>{item.amount_cents > 0 ? "+" : ""}{fmtMoney(item.amount_cents, currency)}</div></div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
