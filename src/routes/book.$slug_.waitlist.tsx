/* eslint-disable @typescript-eslint/no-explicit-any -- Public view types are refreshed after migration. */
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

function localDateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export const Route = createFileRoute("/book/$slug_/waitlist")({
  loader: async ({ params }) => {
    const { data: business, error } = await (supabase as any)
      .from("public_businesses")
      .select("id,name,slug")
      .eq("slug", params.slug)
      .maybeSingle();
    if (error) throw error;
    if (!business) throw notFound();
    const [{ data: services }, { data: staff }] = await Promise.all([
      (supabase as any)
        .from("services")
        .select("id,name")
        .eq("business_id", business.id)
        .eq("active", true)
        .order("name"),
      (supabase as any)
        .from("public_staff")
        .select("id,name")
        .eq("business_id", business.id)
        .order("name"),
    ]);
    return {
      business,
      services: (services ?? []) as { id: string; name: string }[],
      staff: (staff ?? []) as { id: string; name: string }[],
    };
  },
  component: AppointmentWaitlistPage,
});

function AppointmentWaitlistPage() {
  const { business, services, staff } = Route.useLoaderData();
  const [serviceId, setServiceId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [after, setAfter] = useState(() => localDateValue(new Date()));
  const [before, setBefore] = useState(() => localDateValue(new Date()));
  const [preferredTime, setPreferredTime] = useState("any");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);
  const lastAllowedDate = localDateValue(
    new Date(Date.now() + 60 * 86_400_000),
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (before < after) {
      setMessage("The last day must be on or after the first day.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/appointment-waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessId: business.id,
          serviceId,
          staffId: staffId || null,
          name,
          email,
          phone,
          from: after,
          through: before,
          preferredTime,
          consent,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message || "Could not save your request.");
      setSaved(true);
      setMessage(result.message);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not save your request.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f8f7f4] px-4 py-8 text-[#24221e] sm:py-14">
      <div className="mx-auto max-w-xl overflow-hidden rounded-3xl border border-[#e7e1d5] bg-white shadow-[0_16px_50px_-30px_rgba(72,59,35,0.3)]">
        <div className="h-1 bg-[#a8874e]" />
        <div className="p-6 sm:p-10">
          <Link
            to="/book/$slug"
            params={{ slug: business.slug }}
            className="text-sm text-[#79663e] hover:underline"
          >
            ← Back to booking
          </Link>
          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.16em] text-[#80683d]">
            {business.name}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Ask for a time
          </h1>
          <p className="mt-3 leading-relaxed text-[#68645d]">
            Can't find a time that works? Tell {business.name} what you need and
            they may contact you if a suitable time opens up.
          </p>
          <p className="mt-4 rounded-xl border border-[#e9dfcc] bg-[#fbf8f1] px-4 py-3 text-sm text-[#665536]">
            This is not a booking. No appointment is reserved until the salon
            confirms one with you.
          </p>
          {saved ? (
            <div role="status" className="mt-8 rounded-2xl bg-[#f5f0e6] p-6">
              <h2 className="text-lg font-semibold">Request sent</h2>
              <p className="mt-2 text-sm leading-relaxed text-[#68645d]">
                {message}
              </p>
              <Link
                to="/book/$slug"
                params={{ slug: business.slug }}
                className="mt-4 inline-block text-sm font-semibold text-[#79663e] underline"
              >
                Back to booking
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-8 space-y-5">
              <p className="text-sm font-semibold text-[#79663e]">
                1. What appointment would you like?
              </p>
              <Field label="Service">
                <select
                  required
                  value={serviceId}
                  onChange={(e) => setServiceId(e.target.value)}
                  className="waitlist-input"
                >
                  <option value="">Choose a service</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Team member">
                <select
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                  className="waitlist-input"
                >
                  <option value="">Anyone available</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="border-t border-[#eee9df] pt-6 text-sm font-semibold text-[#79663e]">
                2. When could you come in?
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="First day that works">
                  <input
                    required
                    type="date"
                    value={after}
                    min={localDateValue(new Date())}
                    max={lastAllowedDate}
                    onChange={(e) => {
                      setAfter(e.target.value);
                      if (before < e.target.value) setBefore(e.target.value);
                    }}
                    className="waitlist-input"
                  />
                </Field>
                <Field label="Last day that works">
                  <input
                    required
                    type="date"
                    value={before}
                    min={after}
                    max={lastAllowedDate}
                    onChange={(e) => setBefore(e.target.value)}
                    className="waitlist-input"
                  />
                </Field>
              </div>
              <Field label="Time of day">
                <select
                  value={preferredTime}
                  onChange={(e) => setPreferredTime(e.target.value)}
                  className="waitlist-input"
                >
                  <option value="any">Any time</option>
                  <option value="morning">Morning, before 12</option>
                  <option value="afternoon">Afternoon, 12–5</option>
                  <option value="evening">Evening, after 5</option>
                </select>
              </Field>
              <p className="border-t border-[#eee9df] pt-6 text-sm font-semibold text-[#79663e]">
                3. How can the salon reach you?
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Your name">
                  <input
                    required
                    maxLength={120}
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="waitlist-input"
                  />
                </Field>
                <Field label="Email">
                  <input
                    required
                    type="email"
                    maxLength={254}
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="waitlist-input"
                  />
                </Field>
              </div>
              <Field label="Phone (optional)">
                <input
                  type="tel"
                  maxLength={50}
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="waitlist-input"
                />
              </Field>
              <label className="flex items-start gap-3 rounded-xl border border-[#e7e1d5] p-4 text-sm leading-relaxed text-[#68645d]">
                <input
                  required
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>
                  The salon may contact me about this request. This is not
                  consent to marketing. Requests are removed after 90 days.
                </span>
              </label>
              {message && (
                <p role="alert" className="text-sm text-red-700">
                  {message}
                </p>
              )}
              <button
                disabled={busy || !services.length}
                className="w-full rounded-xl bg-[#24221e] px-5 py-3 font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Sending…" : "Ask the salon to contact me"}
              </button>
            </form>
          )}
        </div>
      </div>
      <style>{`.waitlist-input{width:100%;border:1px solid #ddd8cf;border-radius:12px;padding:12px;background:#fff;color:#24221e}.waitlist-input:focus{outline:2px solid #a8874e;outline-offset:2px}`}</style>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
