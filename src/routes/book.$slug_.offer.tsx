import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CalendarDays, Clock3 } from "lucide-react";
import { startBookingCheckout } from "@/lib/stripe-connect.functions";

export const Route = createFileRoute("/book/$slug_/offer")({
  component: BetterTimeOfferPage,
  head: () => ({
    meta: [
      { name: "robots", content: "noindex,nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
});

type Offer = {
  businessId: string;
  businessName: string;
  businessSlug: string;
  serviceId: string;
  serviceName: string;
  staffId: string;
  staffName: string;
  startsAt: string;
  endsAt: string;
  expiresAt: string;
  timezone: string;
  priceCents: number;
  currency: string;
  paymentMode: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  cancellationWindowHours: number;
};

function BetterTimeOfferPage() {
  const { slug } = Route.useParams();
  const [token] = useState(() =>
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.search).get("token") ?? ""),
  );
  const [offer, setOffer] = useState<Offer | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setMessage("This offer link is incomplete.");
      setLoading(false);
      return;
    }
    let active = true;
    fetch(`/api/better-time-offer?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const body = (await response.json()) as Offer & { message?: string };
        if (!response.ok)
          throw new Error(body.message || "This offer is unavailable.");
        if (body.businessSlug !== slug)
          throw new Error("This offer does not belong to this salon.");
        if (active) setOffer(body);
      })
      .catch((error: unknown) => {
        if (active)
          setMessage(
            error instanceof Error
              ? error.message
              : "This offer is unavailable.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug, token]);

  async function book() {
    if (!offer || !accepted) return;
    setBusy(true);
    setMessage("");
    try {
      if (offer.paymentMode !== "none") {
        const checkout = await startBookingCheckout({
          data: {
            businessId: offer.businessId,
            serviceId: offer.serviceId,
            staffId: offer.staffId,
            customerName: offer.customerName,
            customerEmail: offer.customerEmail,
            customerPhone: offer.customerPhone,
            startsAt: offer.startsAt,
            endsAt: offer.endsAt,
            notes: "",
            returnPath: `/book/${slug}`,
            offerToken: token,
            offerPolicyAccepted: accepted,
          },
        });
        if (!checkout.checkoutUrl)
          throw new Error("Could not start secure checkout.");
        window.location.assign(checkout.checkoutUrl);
        return;
      }
      const response = await fetch("/api/better-time-offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          action: "book",
          policyAccepted: accepted,
        }),
      });
      const result = (await response.json()) as {
        bookingId?: string;
        message?: string;
      };
      if (!response.ok || !result.bookingId)
        throw new Error(result.message || "This time could not be booked.");
      setDone(true);
      fetch("/api/bookings/send-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ booking_id: result.bookingId }),
      }).catch(() => {});
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "This time could not be booked.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function stopAlerts() {
    if (!token) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/better-time-offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action: "stop" }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok)
        throw new Error(result.message || "Could not stop alerts.");
      setOffer(null);
      setDone(true);
      setMessage(result.message || "Alerts stopped.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not stop alerts.",
      );
    } finally {
      setBusy(false);
    }
  }

  const starts = offer
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: offer.timezone,
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(offer.startsAt))
    : "";
  const expires = offer
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: offer.timezone,
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(offer.expiresAt))
    : "";
  const price = offer
    ? new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: offer.currency.toUpperCase(),
      }).format(offer.priceCents / 100)
    : "";

  return (
    <main className="min-h-screen bg-[#f8f7f4] px-4 py-10 text-[#24221e] sm:py-16">
      <div className="mx-auto max-w-lg overflow-hidden rounded-3xl border border-[#e7e1d5] bg-white shadow-[0_16px_50px_-30px_rgba(72,59,35,0.3)]">
        <div className="h-1 bg-[#a8874e]" />
        <div className="p-6 sm:p-9">
          <Link
            to="/book/$slug"
            params={{ slug }}
            className="text-sm font-medium text-[#79663e] hover:underline"
          >
            ← Back to salon
          </Link>
          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.16em] text-[#80683d]">
            A time you asked for
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            A time has opened up
          </h1>
          {loading ? (
            <p className="mt-6 text-sm text-[#68645d]">Checking this offer…</p>
          ) : done ? (
            <div
              role="status"
              className="mt-6 rounded-2xl border border-[#e7dcc5] bg-[#fbf8f1] p-5"
            >
              <p className="font-semibold">
                {offer ? "Your booking is confirmed" : "Alerts stopped"}
              </p>
              <p className="mt-2 text-sm text-[#68645d]">
                {offer
                  ? "The salon will send your confirmation details by email."
                  : message}
              </p>
            </div>
          ) : offer ? (
            <div className="mt-6 space-y-6">
              <div className="rounded-2xl border border-[#e7dcc5] bg-[#fbf8f1] p-5">
                <p className="font-semibold">{offer.serviceName}</p>
                <p className="mt-2 flex items-center gap-2 text-sm">
                  <CalendarDays
                    className="h-4 w-4 text-[#80683d]"
                    aria-hidden="true"
                  />
                  {starts}
                </p>
                <p className="mt-1 text-sm text-[#68645d]">
                  With {offer.staffName} at {offer.businessName}
                </p>
                <p className="mt-3 text-sm font-semibold">
                  {price}
                  {offer.paymentMode === "deposit"
                    ? " · deposit at checkout"
                    : offer.paymentMode === "full"
                      ? " · pay at checkout"
                      : " · pay at the salon"}
                </p>
              </div>
              <p className="flex items-start gap-2 text-sm leading-relaxed text-[#68645d]">
                <Clock3
                  className="mt-0.5 h-4 w-4 shrink-0 text-[#80683d]"
                  aria-hidden="true"
                />
                Complete by {expires}. The appointment is not booked until you
                finish the next step.
              </p>
              <label className="flex items-start gap-3 rounded-xl border border-[#e7e1d5] p-4 text-sm leading-relaxed">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(event) => setAccepted(event.target.checked)}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  I understand I can cancel or reschedule online until{" "}
                  {offer.cancellationWindowHours} hours before my appointment.
                  Closer to the time, the salon can explain my options under its
                  policy.
                </span>
              </label>
              {message && (
                <p role="alert" className="text-sm text-red-700">
                  {message}
                </p>
              )}
              <button
                type="button"
                disabled={!accepted || busy}
                onClick={book}
                className="min-h-12 w-full rounded-xl bg-[#78633d] px-5 font-semibold text-white hover:bg-[#665231] disabled:opacity-50"
              >
                {busy
                  ? "Checking…"
                  : offer.paymentMode === "none"
                    ? "Book this time"
                    : "Continue to secure checkout"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={stopAlerts}
                className="min-h-11 w-full text-sm text-[#68645d] underline disabled:opacity-50"
              >
                Stop alerts for this request
              </button>
            </div>
          ) : (
            <p role="alert" className="mt-6 text-sm text-[#68645d]">
              {message || "This offer is unavailable."}{" "}
              <Link
                to="/book/$slug"
                params={{ slug }}
                className="font-semibold text-[#79663e] underline"
              >
                See available times
              </Link>
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
