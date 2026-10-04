/* eslint-disable @typescript-eslint/no-explicit-any -- Waitlist table types are generated after migration. */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  CalendarDays,
  Check,
  Clipboard,
  Mail,
  Phone,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
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
  component: BookingRequestsPage,
});

type RequestRow = AppointmentWaitlistRequest & {
  business_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  created_at: string;
};

function BookingRequestsPage() {
  const { user } = useAuth();
  const { data: business } = useMyBusiness();
  const isOwner = !!business && business.owner_id === user?.id;
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [tab, setTab] = useState<"active" | "closed">("active");
  const [search, setSearch] = useState("");
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

  const activeCount =
    query.data?.requests.filter((request) => request.status === "active")
      .length ?? 0;
  const closedCount = (query.data?.requests.length ?? 0) - activeCount;
  const term = search.trim().toLowerCase();
  const visibleRequests = (query.data?.requests ?? []).filter(
    (request) =>
      request.status === tab &&
      (!term ||
        [
          request.customer_name,
          request.customer_email,
          query.data?.services.get(request.service_id) ?? "",
        ].some((value) => value.toLowerCase().includes(term))),
  );

  async function updateStatus(id: string, status: "active" | "closed") {
    if (!business) return;
    setWorkingId(id);
    const { error } = await (supabase as any)
      .from("appointment_waitlist_requests")
      .update({ status })
      .eq("id", id)
      .eq("business_id", business.id);
    setWorkingId(null);
    if (error) {
      toast.error("Could not update this request. Please try again.");
      return;
    }
    toast.success(
      status === "closed"
        ? "Moved to Handled. No booking or message was sent."
        : "Moved back to Needs a reply.",
    );
    await qc.invalidateQueries({
      queryKey: ["appointment-waitlist", business.id],
    });
  }

  async function deleteRequest(id: string) {
    if (
      !business ||
      !window.confirm(
        "Permanently delete this request? Only do this after checking the requester's identity.",
      )
    )
      return;
    setWorkingId(id);
    const { error } = await (supabase as any)
      .from("appointment_waitlist_requests")
      .delete()
      .eq("id", id)
      .eq("business_id", business.id);
    setWorkingId(null);
    if (error) toast.error("Could not delete this request. Please try again.");
    else {
      toast.success("Request deleted.");
      await qc.invalidateQueries({
        queryKey: ["appointment-waitlist", business.id],
      });
    }
  }

  async function copyLink() {
    if (!business) return;
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/book/${business.slug}/waitlist`,
      );
      toast.success("Request link copied.");
    } catch {
      toast.error("Could not copy the link. Please try again.");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Booking requests"
        subtitle="Help clients find a time when nothing suitable is available."
      />
      {!isOwner ? (
        <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
          Only the salon owner can see booking requests.
        </div>
      ) : (
        <>
          <div className="rounded-3xl border border-[#e7dcc5] bg-gradient-to-br from-[#fbf8f1] to-card p-5 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#80683d]">
                  Follow up made simple
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight">
                  {!query.data
                    ? "Your booking requests"
                    : activeCount
                      ? `${activeCount} ${activeCount === 1 ? "client needs" : "clients need"} a reply`
                      : "You're all caught up"}
                </h2>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
                  These are requests, not bookings. Check the calendar, contact
                  the client, then mark the request handled.
                </p>
              </div>
              <button
                type="button"
                onClick={copyLink}
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#d8c9ac] bg-card px-4 text-sm font-medium hover:bg-[#f6f0e4] active:scale-[0.98]"
              >
                <Clipboard
                  className="h-4 w-4 text-[#80683d]"
                  aria-hidden="true"
                />{" "}
                Copy request link
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div
              className="flex gap-1 rounded-xl bg-muted/70 p-1"
              role="group"
              aria-label="Request status"
            >
              <button
                type="button"
                aria-pressed={tab === "active"}
                onClick={() => setTab("active")}
                className={`min-h-10 rounded-lg px-4 text-sm font-medium ${tab === "active" ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Needs a reply{" "}
                <span className="ml-1 text-xs">{activeCount}</span>
              </button>
              <button
                type="button"
                aria-pressed={tab === "closed"}
                onClick={() => setTab("closed")}
                className={`min-h-10 rounded-lg px-4 text-sm font-medium ${tab === "closed" ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Handled <span className="ml-1 text-xs">{closedCount}</span>
              </button>
            </div>
            <label className="relative block sm:w-64">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="sr-only">Search booking requests</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name or service"
                className="min-h-11 w-full rounded-xl border bg-card pl-10 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#a8874e]"
              />
            </label>
          </div>
          {query.isLoading && (
            <p className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
              Loading booking requests…
            </p>
          )}
          {query.isError && (
            <div
              role="alert"
              className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-sm"
            >
              Could not load booking requests.{" "}
              <button
                type="button"
                onClick={() => query.refetch()}
                className="font-semibold underline"
              >
                Try again
              </button>
              .
            </div>
          )}
          {query.data && visibleRequests.length === 0 && (
            <div className="rounded-3xl border border-dashed bg-card p-10 text-center">
              <CalendarDays
                className="mx-auto h-7 w-7 text-[#a8874e]"
                aria-hidden="true"
              />
              <h2 className="mt-3 font-semibold">
                {search
                  ? "No matching requests"
                  : tab === "active"
                    ? "No one is waiting for a reply"
                    : "Nothing marked handled yet"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {search
                  ? "Try a different name or service."
                  : tab === "active"
                    ? "New requests will appear here when a client asks for a time."
                    : "After you've dealt with a request, you can move it here."}
              </p>
            </div>
          )}
          <div className="grid gap-4">
            {visibleRequests.map((request) => {
              const serviceName =
                query.data!.services.get(request.service_id) ?? "Service";
              const staffName = request.preferred_staff_id
                ? (query.data!.staff.get(request.preferred_staff_id) ??
                  "Selected stylist")
                : "Any stylist";
              const matches = query.data!.cancellations.filter((slot) =>
                requestMatchesCancelledSlot(
                  request,
                  slot,
                  business!.timezone || "UTC",
                ),
              );
              const subject = encodeURIComponent(
                `Your ${serviceName} time request`,
              );
              const body = encodeURIComponent(
                `Hi ${request.customer_name},\n\nThanks for asking about a time for ${serviceName}. I'll check the diary and get back to you.\n\n${business!.name}`,
              );
              return (
                <article
                  key={request.id}
                  className="overflow-hidden rounded-3xl border bg-card shadow-sm"
                >
                  <div className="p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#80683d]">
                          {request.status === "active"
                            ? "Needs a reply"
                            : "Handled · not necessarily booked"}
                        </p>
                        <h2 className="mt-1 text-xl font-semibold tracking-tight">
                          {request.customer_name}
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Asked{" "}
                          {new Intl.DateTimeFormat("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          }).format(new Date(request.created_at))}
                        </p>
                      </div>
                      <div className="rounded-full bg-[#f4efe4] px-3 py-1.5 text-sm font-medium text-[#6c5631]">
                        {serviceName}
                      </div>
                    </div>
                    <div className="mt-5 grid gap-3 rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm sm:grid-cols-3">
                      <div>
                        <span className="block text-xs text-muted-foreground">
                          Days that work
                        </span>
                        <strong className="mt-1 block font-medium">
                          {formatRequestedSalonDates(
                            request.preferred_after,
                            request.preferred_before,
                            business!.timezone || "UTC",
                          )}
                        </strong>
                      </div>
                      <div>
                        <span className="block text-xs text-muted-foreground">
                          Time of day
                        </span>
                        <strong className="mt-1 block font-medium capitalize">
                          {request.preferred_time === "any"
                            ? "Any time"
                            : request.preferred_time}
                        </strong>
                      </div>
                      <div>
                        <span className="block text-xs text-muted-foreground">
                          Stylist
                        </span>
                        <strong className="mt-1 block font-medium">
                          {staffName}
                        </strong>
                      </div>
                    </div>
                    {request.status === "active" && matches.length > 0 && (
                      <div className="mt-4 rounded-xl border border-[#e7dcc5] bg-[#fbf8f1] px-4 py-3 text-sm text-[#665536]">
                        <p className="font-semibold">
                          A recently cancelled time might fit
                        </p>
                        <p className="mt-1">
                          {matches
                            .slice(0, 2)
                            .map((slot) =>
                              new Intl.DateTimeFormat("en-GB", {
                                timeZone: business!.timezone || "UTC",
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              }).format(new Date(slot.starts_at)),
                            )
                            .join(" · ")}
                        </p>
                        <p className="mt-1 text-xs">
                          It may already be taken. Check the calendar before
                          offering it.
                        </p>
                      </div>
                    )}
                    <div className="mt-5 flex flex-wrap gap-2">
                      <Link
                        to="/calendar"
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#78633d] px-4 text-sm font-semibold text-white hover:bg-[#665231] active:scale-[0.98]"
                      >
                        <CalendarDays className="h-4 w-4" aria-hidden="true" />{" "}
                        Check calendar
                      </Link>
                      <a
                        href={`mailto:${request.customer_email}?subject=${subject}&body=${body}`}
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-medium hover:bg-muted active:scale-[0.98]"
                      >
                        <Mail className="h-4 w-4" aria-hidden="true" /> Email
                        client
                      </a>
                      {request.customer_phone && (
                        <a
                          href={`tel:${request.customer_phone}`}
                          className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-medium hover:bg-muted active:scale-[0.98]"
                        >
                          <Phone className="h-4 w-4" aria-hidden="true" /> Call
                          client
                        </a>
                      )}
                    </div>
                    <p className="mt-3 break-all text-xs text-muted-foreground">
                      {request.customer_email}
                      {request.customer_phone
                        ? ` · ${request.customer_phone}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-5 py-3 sm:px-6">
                    <p className="text-xs text-muted-foreground">
                      Contact clients manually if needed. Automatic opening
                      alerts are sent only to clients who opted in, when enabled.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      {request.status === "active" ? (
                        <button
                          type="button"
                          disabled={workingId === request.id}
                          onClick={() => updateStatus(request.id, "closed")}
                          className="inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-[#6c5631] hover:underline disabled:opacity-50"
                        >
                          <Check className="h-4 w-4" aria-hidden="true" /> Mark
                          handled
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={workingId === request.id}
                          onClick={() => updateStatus(request.id, "active")}
                          className="inline-flex min-h-9 items-center gap-1.5 text-sm font-medium hover:underline disabled:opacity-50"
                        >
                          <RotateCcw className="h-4 w-4" aria-hidden="true" />{" "}
                          Reopen
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={workingId === request.id}
                        onClick={() => deleteRequest(request.id)}
                        className="inline-flex min-h-9 items-center gap-1.5 text-sm text-muted-foreground hover:text-destructive disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          {query.data &&
            (query.data.requests.length >= 200 ||
              query.data.cancellations.length >= 100) && (
              <p className="text-sm text-amber-700">
                Showing only the most recent requests or cancellations. Check
                the calendar for the full diary.
              </p>
            )}
        </>
      )}
    </div>
  );
}
