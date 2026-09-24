/* eslint-disable @typescript-eslint/no-explicit-any -- Waitlist table types are generated after the migration is applied. */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useMyBusiness } from "@/lib/business";
import {
  formatRequestedSalonDates,
  requestMatchesCancelledSlot,
  type AppointmentWaitlistRequest,
  type CancelledSlot,
} from "@/lib/appointment-waitlist";

export const Route = createFileRoute("/_authenticated/appointment-waitlist")({
  component: AppointmentWaitlistPage,
});

type RequestRow = AppointmentWaitlistRequest & {
  business_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  created_at: string;
};

function AppointmentWaitlistPage() {
  const { user } = useAuth();
  const { data: business } = useMyBusiness();
  const isOwner = !!business && business.owner_id === user?.id;
  const [closingId, setClosingId] = useState<string | null>(null);
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["appointment-waitlist", business?.id],
    enabled: isOwner,
    queryFn: async () => {
      const now = new Date();
      const future = new Date(now.getTime() + 61 * 86_400_000).toISOString();
      const [requests, cancellations, services, staff] = await Promise.all([
        (supabase as any)
          .from("appointment_waitlist_requests")
          .select(
            "id,business_id,service_id,preferred_staff_id,preferred_after,preferred_before,preferred_time,status,customer_name,customer_email,customer_phone,created_at",
          )
          .eq("business_id", business!.id)
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("bookings")
          .select("id,service_id,staff_id,starts_at,ends_at")
          .eq("business_id", business!.id)
          .eq("status", "cancelled")
          .gt("starts_at", now.toISOString())
          .lt("starts_at", future)
          .order("starts_at")
          .limit(100),
        supabase
          .from("services")
          .select("id,name")
          .eq("business_id", business!.id),
        supabase
          .from("staff")
          .select("id,name")
          .eq("business_id", business!.id),
      ]);
      for (const result of [requests, cancellations, services, staff])
        if (result.error) throw result.error;
      return {
        requests: (requests.data ?? []) as RequestRow[],
        cancellations: (cancellations.data ?? []) as CancelledSlot[],
        services: new Map((services.data ?? []).map((s) => [s.id, s.name])),
        staff: new Map((staff.data ?? []).map((s) => [s.id, s.name])),
      };
    },
  });

  async function closeRequest(id: string) {
    if (!business) return;
    setClosingId(id);
    const { error } = await (supabase as any)
      .from("appointment_waitlist_requests")
      .update({ status: "closed" })
      .eq("id", id)
      .eq("business_id", business.id);
    setClosingId(null);
    if (error) window.alert("Could not close this request. Please try again.");
    else
      qc.invalidateQueries({ queryKey: ["appointment-waitlist", business.id] });
  }

  async function deleteRequest(id: string) {
    if (
      !business ||
      !window.confirm(
        "Permanently delete this appointment request? Only do this after checking the requester's identity.",
      )
    )
      return;
    setClosingId(id);
    const { error } = await (supabase as any)
      .from("appointment_waitlist_requests")
      .delete()
      .eq("id", id)
      .eq("business_id", business.id);
    setClosingId(null);
    if (error) window.alert("Could not delete this request. Please try again.");
    else
      qc.invalidateQueries({ queryKey: ["appointment-waitlist", business.id] });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Appointment requests"
        subtitle="People interested in an opening. Review a potential match, check the calendar, then contact them yourself."
      />
      {!isOwner ? (
        <p>Only the salon owner can review appointment requests.</p>
      ) : (
        <>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            A match is only a suggestion. Cancelled times may already have been
            rebooked, and no request is a confirmed appointment. No messages are
            sent from this page.
          </div>
          <p className="text-sm text-muted-foreground">
            Share this request form when a client cannot find a suitable time:{" "}
            <a href={`/book/${business?.slug}/waitlist`} className="underline">
              /book/{business?.slug}/waitlist
            </a>
          </p>
          {query.isLoading && <p>Loading requests…</p>}
          {query.isError && (
            <p role="alert">
              Could not load requests. The new database migration may not be
              installed yet.
            </p>
          )}
          {query.data && !query.data.requests.length && (
            <p>No appointment requests right now.</p>
          )}
          <div className="grid gap-4">
            {query.data?.requests.map((request) => {
              const matches = query.data.cancellations.filter((slot) =>
                requestMatchesCancelledSlot(
                  request,
                  slot,
                  business!.timezone || "UTC",
                ),
              );
              return (
                <article
                  key={request.id}
                  className="rounded-2xl border bg-card p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold">
                        {request.customer_name} ·{" "}
                        {query.data.services.get(request.service_id) ??
                          "Service"}
                      </h2>
                      {request.status === "closed" && (
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Closed
                        </p>
                      )}
                      <p className="mt-1 text-sm text-muted-foreground">
                        {request.preferred_staff_id
                          ? (query.data.staff.get(request.preferred_staff_id) ??
                            "Selected stylist")
                          : "Any stylist"}{" "}
                        ·{" "}
                        {request.preferred_time === "any"
                          ? "Any time"
                          : request.preferred_time}{" "}
                        ·{" "}
                        {formatRequestedSalonDates(
                          request.preferred_after,
                          request.preferred_before,
                          business!.timezone || "UTC",
                        )}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {request.status === "active" && (
                        <button
                          type="button"
                          disabled={closingId === request.id}
                          onClick={() => closeRequest(request.id)}
                          className="rounded-lg border px-3 py-2 text-sm hover:bg-muted"
                        >
                          Close request
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={closingId === request.id}
                        onClick={() => deleteRequest(request.id)}
                        className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                      >
                        Delete request
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 rounded-xl bg-muted/50 p-4 text-sm sm:grid-cols-2">
                    <div>
                      <span className="text-muted-foreground">Contact</span>
                      <br />
                      <a
                        href={`mailto:${request.customer_email}`}
                        className="underline"
                      >
                        {request.customer_email}
                      </a>
                      {request.customer_phone && (
                        <>
                          {" "}
                          ·{" "}
                          <a
                            href={`tel:${request.customer_phone}`}
                            className="underline"
                          >
                            {request.customer_phone}
                          </a>
                        </>
                      )}
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        Possible cancelled-time matches
                      </span>
                      <br />
                      {matches.length
                        ? matches.slice(0, 3).map((slot) => (
                            <span key={slot.id} className="block">
                              {new Intl.DateTimeFormat("en-GB", {
                                timeZone: business!.timezone || "UTC",
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              }).format(new Date(slot.starts_at))}{" "}
                              ·{" "}
                              {query.data!.staff.get(slot.staff_id) ??
                                "Stylist"}
                            </span>
                          ))
                        : "None in the next 61 days"}
                    </div>
                  </div>
                  {matches.length > 0 && (
                    <p className="mt-3 text-sm">
                      <Link to="/calendar" className="font-medium underline">
                        Check availability in Calendar →
                      </Link>{" "}
                      before offering any time.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
          {query.data &&
            (query.data.requests.length >= 200 ||
              query.data.cancellations.length >= 100) && (
              <p className="text-sm text-amber-700">
                Showing only the most recent requests/openings. Check the
                calendar for a complete view.
              </p>
            )}
        </>
      )}
    </div>
  );
}
