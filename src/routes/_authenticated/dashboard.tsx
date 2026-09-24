import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  CreditCard,
  ClipboardList,
  Package,
  Plus,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { NewBookingDialog } from "@/components/new-booking-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtTime } from "@/lib/format";
import { getServerFnAuthHeaders } from "@/lib/server-fn-auth";
import {
  checkInDashboardBooking,
  getDashboardOverview,
  getDashboardCustomerNotes,
  type DashboardBooking,
  type DashboardAttentionItem,
} from "@/lib/dashboard.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const queryClient = useQueryClient();
  const [newBookingOpen, setNewBookingOpen] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard-overview"],
    queryFn: async () => {
      const headers = await getServerFnAuthHeaders();
      return getDashboardOverview({ headers });
    },
    refetchInterval: 60_000,
  });

  const todayLabel = new Date().toLocaleDateString("en-GB", {
    timeZone: data?.business.timezone || "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const businessHour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: data?.business.timezone || "Europe/London",
      hour: "numeric",
      hourCycle: "h23",
    }).format(new Date()),
  );
  const greeting =
    businessHour < 12
      ? "Good morning"
      : businessHour < 18
        ? "Good afternoon"
        : "Good evening";

  const checkIn = async () => {
    if (!data?.nextBooking) return;

    try {
      setCheckingIn(true);
      const headers = await getServerFnAuthHeaders();
      await checkInDashboardBooking({
        data: { bookingId: data.nextBooking.id },
        headers,
      });
      await queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
      toast.success(`${data.nextBooking.customerName} is checked in.`);
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not check in this customer.",
      );
    } finally {
      setCheckingIn(false);
    }
  };

  return (
    <div className="workspace-dashboard mx-auto w-full max-w-[1280px] p-5 sm:p-8 md:p-10">
      <header>
        <h1 className="max-w-4xl font-sans text-[clamp(1.9rem,3vw,2.4rem)] font-semibold leading-tight tracking-tight">
          {greeting}
          {data?.business.name ? `, ${data.business.name}` : ""}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground sm:text-base">
          {todayLabel}
        </p>
      </header>

      <div className="mt-8 rounded-2xl border bg-card p-5 shadow-soft sm:p-8">
        {isError ? (
          <LoadError
            onRetry={() =>
              queryClient.invalidateQueries({
                queryKey: ["dashboard-overview"],
              })
            }
          />
        ) : isLoading ? (
          <DashboardSkeleton />
        ) : (
          <DailyFocus
            booking={data?.nextBooking ?? null}
            checkingIn={checkingIn}
            onCheckIn={checkIn}
            onNewBooking={() => setNewBookingOpen(true)}
          />
        )}
      </div>

      {data && !isError && (
        <section
          aria-labelledby="preparation-heading"
          className="mt-8 rounded-2xl border bg-card p-5 shadow-soft sm:p-8"
        >
          <h2
            id="preparation-heading"
            className="text-xl font-semibold tracking-tight"
          >
            Prepare for today's clients
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Upcoming and in-progress visits, in appointment order. Private notes
            stay hidden until you open them.
          </p>
          {data.preparation?.length ? (
            <ul className="mt-5 divide-y">
              {data.preparation.map((booking) => (
                <li key={booking.id} className="py-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {new Date(booking.startsAt).toLocaleTimeString(
                          "en-GB",
                          {
                            timeZone: data.business.timezone || "Europe/London",
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        )}{" "}
                        · {booking.customerName}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {booking.serviceName} · {booking.staffName}
                      </p>
                      <p className="mt-2 text-sm">{booking.formSummary}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {booking.paymentStatus === "failed"
                          ? "Payment needs review · "
                          : ""}
                        {booking.balanceCents > 0
                          ? `${new Intl.NumberFormat("en-GB", { style: "currency", currency: data.business.currency || "GBP" }).format(booking.balanceCents / 100)} appointment balance`
                          : "No appointment balance shown"}
                      </p>
                    </div>
                    <Button
                      asChild
                      variant="outline"
                      className="self-start shrink-0"
                    >
                      <Link to="/bookings" search={{ bookingId: booking.id }}>
                        Open appointment
                        <ArrowRight
                          aria-hidden="true"
                          className="ml-2 h-4 w-4"
                        />
                      </Link>
                    </Button>
                  </div>
                  {booking.customerId && (
                    <PrivatePreparationNotes customerId={booking.customerId} />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground">
              No upcoming visits left today.
            </p>
          )}
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Showing up to 20 visits. Form counts cover only records linked to
            each appointment, not every required form or patch-test clearance.
            Open the appointment to check customer records and requirements.
            Balances are for the appointment only.
          </p>
        </section>
      )}

      {data && !isError && (
        <section
          aria-labelledby="attention-heading"
          className="mt-8 rounded-2xl border bg-card p-5 shadow-soft sm:p-8"
        >
          <h2
            id="attention-heading"
            className="text-xl font-semibold tracking-tight"
          >
            Needs your attention
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            A short list to work through. Review each item before making any
            changes.
          </p>
          {data.attention.length ? (
            <ul className="mt-5 divide-y">
              {data.attention.map((item) => (
                <AttentionRow key={item.id} item={item} />
              ))}
            </ul>
          ) : (
            <p className="mt-5 flex items-center gap-2 text-sm">
              <CheckCircle2
                aria-hidden="true"
                className="h-4 w-4 text-primary"
              />
              No flagged items in these checks.
            </p>
          )}
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Showing up to three pending bookings, three payment issues, one
            unsigned form and two low-stock items. This is not a full safety or
            forms checklist.
            {!data.consultationAttentionAvailable &&
              " Form checks are unavailable in this environment; check Consultations separately."}
          </p>
        </section>
      )}

      {data?.business.id && (
        <NewBookingDialog
          open={newBookingOpen}
          onOpenChange={setNewBookingOpen}
          businessId={data.business.id}
          onCreated={() =>
            queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] })
          }
        />
      )}
    </div>
  );
}

function PrivatePreparationNotes({ customerId }: { customerId: string }) {
  const [open, setOpen] = useState(false);
  const notes = useQuery({
    queryKey: ["dashboard-private-notes", customerId],
    enabled: open,
    gcTime: 0,
    queryFn: async () =>
      getDashboardCustomerNotes({
        data: { customerId },
        headers: await getServerFnAuthHeaders(),
      }),
  });
  return (
    <div className="mt-3">
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? "Hide private notes" : "Show private notes"}
      </Button>
      {open && (
        <div
          className="mt-2 rounded-lg border bg-muted/30 p-3 text-sm"
          role="status"
        >
          {notes.isPending ? (
            "Loading notes…"
          ) : notes.isError ? (
            <>
              <p>Notes could not be loaded.</p>
              <Button variant="link" onClick={() => notes.refetch()}>
                Try again
              </Button>
            </>
          ) : (
            <p className="whitespace-pre-wrap break-words">
              {notes.data?.notes || "No customer notes recorded."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function AttentionRow({ item }: { item: DashboardAttentionItem }) {
  const Icon =
    item.kind === "payment"
      ? CreditCard
      : item.kind === "consultation"
        ? ClipboardList
        : item.kind === "stock"
          ? Package
          : Clock3;
  const content = (
    <>
      {item.action}
      <ArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
    </>
  );
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <Icon
          aria-hidden="true"
          className="mt-1 h-5 w-5 shrink-0 text-primary"
        />
        <div>
          <p className="font-medium">{item.title}</p>
          <p className="mt-1 text-sm text-muted-foreground break-words">
            {item.description}
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        asChild
        className="shrink-0 self-start sm:self-center"
      >
        {item.bookingId ? (
          <Link to="/bookings" search={{ bookingId: item.bookingId }}>
            {content}
          </Link>
        ) : item.kind === "consultation" ? (
          <Link to="/consultations" search={{ tab: "records" }}>
            {content}
          </Link>
        ) : (
          <Link to="/stock">{content}</Link>
        )}
      </Button>
    </li>
  );
}

function DailyFocus({
  booking,
  checkingIn,
  onCheckIn,
  onNewBooking,
}: {
  booking: DashboardBooking | null;
  checkingIn: boolean;
  onCheckIn: () => void;
  onNewBooking: () => void;
}) {
  return (
    <section aria-labelledby="next-client-heading">
      <h2
        id="next-client-heading"
        className="text-2xl font-medium tracking-tight sm:text-3xl"
      >
        {booking
          ? `Your next client is ${firstName(booking.customerName)} at ${fmtTime(booking.startsAt)}.`
          : "You have no more clients booked today."}
      </h2>

      <div className="mt-8 border-t pt-8 sm:mt-9 sm:pt-9">
        {booking ? (
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-5 sm:gap-7">
              <div className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-secondary font-display text-xl sm:h-24 sm:w-24">
                {initials(booking.customerName)}
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-xl font-semibold sm:text-2xl">
                  {booking.customerName}
                </h3>
                <p className="mt-1 truncate text-sm text-muted-foreground sm:text-base">
                  {booking.serviceName}
                </p>
                <div className="mt-4 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:gap-7 sm:text-base">
                  <span className="flex items-center gap-2">
                    <Clock3 className="h-4 w-4" aria-hidden="true" />
                    {fmtTime(booking.startsAt)} – {fmtTime(booking.endsAt)}
                  </span>
                  <span className="flex items-center gap-2">
                    <Users className="h-4 w-4" aria-hidden="true" />
                    with {booking.staffName}
                  </span>
                </div>
              </div>
            </div>

            <Button
              className="h-14 w-full rounded-lg px-9 text-base shadow-glow lg:w-auto"
              disabled={checkingIn || booking.status === "checked_in"}
              onClick={onCheckIn}
            >
              <CheckCircle2 className="mr-2 h-5 w-5" aria-hidden="true" />
              {booking.status === "checked_in"
                ? "Checked in"
                : checkingIn
                  ? "Checking in…"
                  : "Check in"}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-4 text-muted-foreground">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-secondary">
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="text-base">
              Everything is clear for the rest of the day.
            </p>
          </div>
        )}
      </div>

      <div className="mt-12 grid max-w-[640px] gap-3 sm:grid-cols-2">
        <Button
          variant="outline"
          className="h-14 rounded-lg bg-background text-base"
          onClick={onNewBooking}
        >
          <Plus className="mr-2 h-5 w-5" aria-hidden="true" /> New booking
        </Button>
        <Button
          asChild
          variant="outline"
          className="h-14 rounded-lg bg-background text-base"
        >
          <Link to="/customers">
            <UserPlus className="mr-2 h-5 w-5" aria-hidden="true" /> Add
            customer
          </Link>
        </Button>
      </div>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-label="Loading dashboard" aria-busy="true">
      <Skeleton className="h-9 w-full max-w-md rounded-md" />
      <div className="mt-8 border-t pt-9">
        <div className="flex items-center gap-7">
          <Skeleton className="h-24 w-24 shrink-0 rounded-full" />
          <div className="w-full max-w-sm space-y-3">
            <Skeleton className="h-6 w-48 rounded-md" />
            <Skeleton className="h-4 w-60 rounded-md" />
            <Skeleton className="h-4 w-full rounded-md" />
          </div>
        </div>
      </div>
      <div className="mt-12 grid max-w-[640px] gap-3 sm:grid-cols-2">
        <Skeleton className="h-14 rounded-lg" />
        <Skeleton className="h-14 rounded-lg" />
      </div>
    </div>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="border-t pt-8">
      <p className="text-lg font-medium">
        We couldn&apos;t load your next appointment.
      </p>
      <button
        type="button"
        className="mt-3 text-sm text-muted-foreground underline underline-offset-4"
        onClick={onRetry}
      >
        Try again
      </button>
    </div>
  );
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "your client";
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}
