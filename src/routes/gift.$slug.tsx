import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Gift, Loader2, Copy, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { startGiftCardCheckout, getGiftCardPurchaseResult } from "@/lib/gift-card.functions";
import { fmtMoney } from "@/lib/format";

export const Route = createFileRoute("/gift/$slug")({
  loader: async ({ params }) => {
    const { data, error } = await (supabase as any)
      .from("public_businesses")
      .select("id, name, slug, description, currency")
      .eq("slug", params.slug)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound();
    return data as { id: string; name: string; slug: string; description: string | null; currency: string };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `Gift cards · ${loaderData.name}` : "Gift cards" },
      { name: "description", content: loaderData ? `Buy a gift card for ${loaderData.name}.` : "Buy a salon gift card." },
    ],
  }),
  component: GiftCardPage,
});

function GiftCardPage() {
  const business = Route.useLoaderData();
  const search = Route.useSearch() as { gift?: string; order_id?: string; claim?: string };
  const [amount, setAmount] = useState("25");
  const [purchaserName, setPurchaserName] = useState("");
  const [purchaserEmail, setPurchaserEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const receipt = useQuery({
    queryKey: ["gift-card-receipt", search.order_id, search.claim],
    enabled: search.gift === "success" && !!search.order_id && !!search.claim,
    queryFn: () => getGiftCardPurchaseResult({ data: { orderId: search.order_id!, claimToken: search.claim! } }),
    refetchInterval: (query) => query.state.data?.status === "pending" ? 1500 : false,
    retry: 2,
  });

  if (search.gift === "success") {
    return (
      <main className="min-h-screen bg-background px-5 py-14 grid place-items-center">
        <section className="w-full max-w-lg rounded-3xl border bg-card p-7 sm:p-10 shadow-sm text-center">
          {receipt.isLoading || receipt.data?.status === "pending" ? (
            <>
              <Loader2 className="mx-auto h-9 w-9 animate-spin text-muted-foreground" />
              <h1 className="font-display text-3xl mt-5">Preparing your gift card</h1>
              <p className="text-muted-foreground mt-2">Payment is complete. This normally takes only a few seconds.</p>
            </>
          ) : receipt.data?.status === "paid" && receipt.data.code ? (
            <>
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
              <div className="mt-5 text-xs uppercase tracking-[0.18em] text-muted-foreground">{business.name}</div>
              <h1 className="font-display text-3xl mt-2">Your gift card is ready</h1>
              <p className="text-muted-foreground mt-2">
                {fmtMoney(receipt.data.amountCents ?? 0, receipt.data.currency ?? business.currency)} for {receipt.data.recipientName}
              </p>
              <button
                type="button"
                onClick={async () => { await navigator.clipboard.writeText(receipt.data!.code!); toast.success("Gift card code copied."); }}
                className="mt-7 w-full rounded-2xl border bg-background px-4 py-5 font-mono text-xl font-semibold tracking-wider hover:bg-secondary/50"
              >
                {receipt.data.code}<Copy className="inline ml-3 h-4 w-4" />
              </button>
              <p className="text-xs text-muted-foreground mt-4">Save this code. The salon can apply it to a booking.</p>
            </>
          ) : (
            <>
              <Gift className="mx-auto h-9 w-9 text-muted-foreground" />
              <h1 className="font-display text-3xl mt-5">We’re still checking the payment</h1>
              <p className="text-muted-foreground mt-2">Refresh this page shortly. If it continues, contact {business.name}.</p>
            </>
          )}
        </section>
      </main>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const amountCents = Math.round(Number(amount) * 100);
    setSubmitting(true);
    try {
      const result = await startGiftCardCheckout({ data: {
        businessId: business.id,
        amountCents,
        purchaserName,
        purchaserEmail,
        recipientName,
        recipientEmail,
        message,
        returnPath: `/gift/${business.slug}`,
      } });
      window.location.assign(result.checkoutUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start checkout.");
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-background px-5 py-10 sm:py-16">
      <div className="mx-auto max-w-2xl">
        <a href={`/book/${business.slug}`} className="text-sm text-muted-foreground hover:text-foreground">← Back to {business.name}</a>
        <div className="mt-8 grid gap-7 md:grid-cols-[0.8fr_1.2fr]">
          <section className="rounded-3xl bg-foreground text-background p-7 h-fit">
            <Gift className="h-7 w-7" />
            <div className="mt-12 text-xs uppercase tracking-[0.18em] opacity-65">A gift for them</div>
            <h1 className="font-display text-4xl mt-2">{business.name}</h1>
            <p className="mt-4 text-sm opacity-70">Choose an amount and pay securely with Stripe. You’ll receive a unique code to share.</p>
          </section>

          <form onSubmit={submit} className="rounded-3xl border bg-card p-6 sm:p-8 shadow-sm space-y-5">
            <div>
              <Label htmlFor="gift-amount">Gift card amount</Label>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {[25, 50, 75, 100].map((value) => (
                  <Button key={value} type="button" variant={amount === String(value) ? "default" : "outline"} onClick={() => setAmount(String(value))}>£{value}</Button>
                ))}
              </div>
              <Input id="gift-amount" className="mt-2" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Custom amount in pounds" />
              <p className="text-xs text-muted-foreground mt-1">Between £10 and £500</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label htmlFor="purchaser-name">Your name</Label><Input id="purchaser-name" className="mt-1.5" value={purchaserName} onChange={(e) => setPurchaserName(e.target.value)} required maxLength={120} /></div>
              <div><Label htmlFor="purchaser-email">Your email</Label><Input id="purchaser-email" className="mt-1.5" type="email" value={purchaserEmail} onChange={(e) => setPurchaserEmail(e.target.value)} required maxLength={254} /></div>
              <div><Label htmlFor="recipient-name">Recipient name</Label><Input id="recipient-name" className="mt-1.5" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} required maxLength={120} /></div>
              <div><Label htmlFor="recipient-email">Recipient email <span className="text-muted-foreground">(optional)</span></Label><Input id="recipient-email" className="mt-1.5" type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} maxLength={254} /></div>
            </div>
            <div><Label htmlFor="gift-message">Message <span className="text-muted-foreground">(optional)</span></Label><Textarea id="gift-message" className="mt-1.5" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} rows={3} /></div>
            <Button className="w-full h-12" disabled={submitting} type="submit">
              {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Opening checkout…</> : `Buy ${Number(amount) > 0 ? fmtMoney(Math.round(Number(amount) * 100), business.currency) : "gift card"}`}
            </Button>
            <p className="text-center text-xs text-muted-foreground">Secure payment through Stripe. Card details are never stored by Bookzenvo.</p>
          </form>
        </div>
      </div>
    </main>
  );
}
