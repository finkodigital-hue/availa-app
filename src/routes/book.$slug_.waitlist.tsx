/* eslint-disable @typescript-eslint/no-explicit-any -- Public view types are refreshed after migration. */
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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
  const [after, setAfter] = useState("");
  const [before, setBefore] = useState("");
  const [preferredTime, setPreferredTime] = useState("any");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    <main className="min-h-screen bg-[#f8f7f4] px-4 py-12 text-[#24221e]">
      <div className="mx-auto max-w-xl rounded-3xl border border-[#e7e1d5] bg-white p-6 shadow-sm sm:p-10">
        <Link
          to="/book/$slug"
          params={{ slug: business.slug }}
          className="text-sm text-[#79663e] hover:underline"
        >
          ← Back to booking
        </Link>
        <p className="mt-8 text-sm font-semibold uppercase tracking-widest text-[#9c8050]">
          {business.name}
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Ask about an opening</h1>
        <p className="mt-3 text-[#68645d]">
          Tell the salon which appointment you would like. This does not reserve
          a time, and they may not have a matching opening. Requests are removed
          after 90 days.
        </p>
        {saved ? (
          <div role="status" className="mt-8 rounded-2xl bg-[#f5f0e6] p-5">
            {message}
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-5">
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="From">
                <input
                  required
                  type="date"
                  value={after}
                  onChange={(e) => setAfter(e.target.value)}
                  className="waitlist-input"
                />
              </Field>
              <Field label="Until">
                <input
                  required
                  type="date"
                  value={before}
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Your name">
                <input
                  required
                  maxLength={120}
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
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="waitlist-input"
              />
            </Field>
            <label className="flex gap-3 text-sm text-[#68645d]">
              <input
                required
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              The salon may contact me about this appointment request. This is
              not consent to marketing.
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
              {busy ? "Saving…" : "Send request"}
            </button>
          </form>
        )}
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
