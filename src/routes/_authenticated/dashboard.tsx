import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, Plus, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { NewBookingDialog } from "@/components/new-booking-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtTime } from "@/lib/format";
import { getServerFnAuthHeaders } from "@/lib/server-fn-auth";
import {
  checkInDashboardBooking,
  getDashboardOverview,
  type DashboardBooking,
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
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

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
    <div className="mx-auto w-full max-w-[1160px] px-5 py-10 sm:px-8 sm:py-14 lg:px-12 lg:py-20 xl:py-24">
      <header>
        <h1 className="max-w-4xl font-display text-4xl tracking-tight sm:text-5xl lg:text-6xl">
          Good morning{data?.business.name ? `, ${data.business.name}` : ""}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground sm:text-base">
          {todayLabel}
        </p>
      </header>

      <main className="mt-12 sm:mt-16">
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
      </main>

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
