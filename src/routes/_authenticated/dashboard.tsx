import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type ComponentType } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock3,
  CreditCard,
  Eye,
  FileSignature,
  Package,
  Palette,
  Plus,
  ShieldCheck,
  Store,
  TimerOff,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { NewBookingDialog } from "@/components/new-booking-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtMoney, fmtTime } from "@/lib/format";
import { getServerFnAuthHeaders } from "@/lib/server-fn-auth";
import {
  checkInDashboardBooking,
  getDashboardOverview,
  type DashboardAttentionItem,
  type DashboardBooking,
} from "@/lib/dashboard.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

const attentionIcons: Record<DashboardAttentionItem["kind"], ComponentType<{ className?: string }>> = {
  consultation: FileSignature,
  booking: CalendarDays,
  stock: Package,
  payment: CreditCard,
};

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

  const currency = data?.business.currency ?? "GBP";
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
      await checkInDashboardBooking({ data: { bookingId: data.nextBooking.id }, headers });
      await queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
      toast.success(`${data.nextBooking.customerName} is checked in.`);
    } catch (error: any) {
      toast.error(error?.message ?? "Could not check in this customer.");
    } finally {
      setCheckingIn(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1320px] p-5 sm:p-8 md:p-10">
      <header className="mb-8 flex flex-col gap-5 sm:mb-10 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-4xl tracking-tight sm:text-5xl">
            Good morning{data?.business.name ? `, ${data.business.name}` : ""}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">{todayLabel}</p>
        </div>
        <Button className="h-12 self-start rounded-lg px-8 shadow-glow" onClick={() => setNewBookingOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> New booking
        </Button>
      </header>

      {isError ? (
        <div className="rounded-2xl border bg-card px-6 py-12 text-center">
          <p className="font-medium">We couldn't load your dashboard.</p>
          <button
            type="button"
            className="mt-2 text-sm text-muted-foreground underline underline-offset-4"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] })}
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)]">
          {data?.setup && <SetupChecklist setup={data.setup} />}
          <div className="space-y-5">
            <NextBookingCard
              booking={data?.nextBooking ?? null}
              loading={isLoading}
              checkingIn={checkingIn}
              onCheckIn={checkIn}
            />
            <TodaySnapshot
              loading={isLoading}
              bookings={data?.today.bookings ?? 0}
              takings={fmtMoney(data?.today.expectedTakingsCents ?? 0, currency)}
              upcoming={data?.today.upcoming ?? 0}
              staff={data?.today.staffWorking ?? 0}
            />
          </div>

          <AttentionList loading={isLoading} items={data?.attention ?? []} />

          <section className="overflow-hidden rounded-2xl border bg-card lg:col-span-2">
            <div className="flex items-center gap-3 border-b px-5 py-4 sm:px-6">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-secondary">
                <ArrowRight className="h-4 w-4" />
              </div>
              <h2 className="font-display text-2xl">Quick actions</h2>
            </div>
            <div className="grid sm:grid-cols-2 xl:grid-cols-4">
              <QuickAction icon={UserPlus} label="Add customer" to="/customers" />
              <QuickAction icon={FileSignature} label="Get customer signature" to="/consultations" />
              <QuickAction icon={Package} label="Add stock" to="/stock" />
              <QuickAction icon={TimerOff} label="Block time" to="/calendar" />
            </div>
          </section>
        </div>
      )}

      {data?.business.id && (
        <NewBookingDialog
          open={newBookingOpen}
          onOpenChange={setNewBookingOpen}
          businessId={data.business.id}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] })}
        />
      )}
    </div>
  );
}

type SetupState = NonNullable<Awaited<ReturnType<typeof getDashboardOverview>>>["setup"];

const setupItems = [
  { key: "profile", title: "Business profile", description: "Add your location and contact details.", to: "/settings", icon: Store },
  { key: "openingHours", title: "Opening hours", description: "Set at least one day clients can book.", to: "/settings", icon: Clock3 },
  { key: "staff", title: "Staff", description: "Add the people clients can book with.", to: "/staff", icon: Users },
  { key: "services", title: "Services", description: "Add at least one active treatment or service.", to: "/services", icon: FileSignature },
  { key: "appearance", title: "Booking-page appearance", description: "Save the look and content of your public page.", to: "/page-builder", icon: Palette },
] as const;

function SetupChecklist({ setup }: { setup: SetupState }) {
  const completed = setupItems.filter((item) => setup[item.key]).length;
  const percent = Math.round((completed / setupItems.length) * 100);

  return (
    <section className="overflow-hidden rounded-2xl border bg-card lg:col-span-2" aria-labelledby="setup-title">
      <div className="grid gap-6 border-b p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--gold-deep)]">
            <ShieldCheck className="h-4 w-4" /> Guided setup
          </div>
          <h2 id="setup-title" className="mt-3 font-display text-3xl">Get ready for your first booking</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Your progress updates only after each change is saved. Finish the essentials, then check your booking page before sharing it.
          </p>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium">{completed} of {setupItems.length} essentials saved</span>
            <span className="tabular-nums text-muted-foreground">{percent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-3">
        {setupItems.map(({ key, title, description, to, icon: Icon }) => {
          const done = setup[key];
          return (
            <Link key={key} to={to as any} className="group flex min-h-32 gap-4 border-b p-5 transition-colors hover:bg-secondary/35 sm:border-r">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${done ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                {done ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-semibold">{title}<ArrowRight className="h-3.5 w-3.5 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" /></span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">{done ? "Saved and complete" : description}</span>
              </span>
            </Link>
          );
        })}
        <Link to="/import" className="group flex min-h-32 gap-4 border-b p-5 transition-colors hover:bg-secondary/35 sm:border-r">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${setup.imported ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
            {setup.imported ? <CheckCircle2 className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
          </span>
          <span>
            <span className="flex items-center gap-2 text-sm font-semibold">Import existing data <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Optional</span></span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">{setup.imported ? "A completed import is saved" : "Move records from another booking system."}</span>
          </span>
        </Link>
        <Link to="/preview" className="group flex min-h-32 gap-4 p-5 transition-colors hover:bg-secondary/35 sm:border-r">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${setup.ready ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
            {setup.ready ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
          </span>
          <span>
            <span className="flex items-center gap-2 text-sm font-semibold">Readiness check <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" /></span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">{setup.ready ? "Essentials saved — preview the customer journey before sharing." : "Completes automatically when every essential above is saved."}</span>
          </span>
        </Link>
      </div>
    </section>
  );
}

function NextBookingCard({
  booking,
  loading,
  checkingIn,
  onCheckIn,
}: {
  booking: DashboardBooking | null;
  loading: boolean;
  checkingIn: boolean;
  onCheckIn: () => void;
}) {
  if (loading) {
    return <Skeleton className="h-[385px] rounded-2xl" />;
  }

  return (
    <section className="flex min-h-[385px] flex-col rounded-2xl border bg-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Clock3 className="h-5 w-5" />
            <h2 className="font-display text-2xl">Next up</h2>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">Your next appointment</p>
        </div>
        {booking && (
          <span className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium">
            {formatTimeUntil(booking.startsAt)}
          </span>
        )}
      </div>

      {booking ? (
        <div className="flex flex-1 flex-col">
          <div className="flex flex-1 items-center gap-5 py-7">
            <div className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-secondary font-display text-xl">
              {initials(booking.customerName)}
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-xl font-semibold">{booking.customerName}</h3>
              <p className="mt-1 truncate text-sm text-muted-foreground">{booking.serviceName}</p>
              <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Clock3 className="h-4 w-4" /> {fmtTime(booking.startsAt)} – {fmtTime(booking.endsAt)}
              </p>
              <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" /> with {booking.staffName}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 border-t pt-5">
            <Button asChild variant="outline" className="h-12 rounded-lg bg-card">
              <Link to="/bookings"><Eye className="mr-2 h-4 w-4" /> View booking</Link>
            </Button>
            <Button
              className="h-12 rounded-lg"
              disabled={checkingIn || booking.status === "checked_in"}
              onClick={onCheckIn}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {booking.status === "checked_in" ? "Checked in" : checkingIn ? "Checking in…" : "Check in"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid flex-1 place-items-center py-10 text-center">
          <div>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-secondary">
              <CheckCircle2 className="h-6 w-6 text-[color:var(--gold-deep)]" />
            </div>
            <h3 className="mt-4 font-display text-xl">Nothing else booked today</h3>
            <p className="mt-1 text-sm text-muted-foreground">Your day is clear from here.</p>
          </div>
        </div>
      )}
    </section>
  );
}

function TodaySnapshot({
  loading,
  bookings,
  takings,
  upcoming,
  staff,
}: {
  loading: boolean;
  bookings: number;
  takings: string;
  upcoming: number;
  staff: number;
}) {
  const stats = [
    { icon: CalendarDays, value: bookings, label: "Bookings today" },
    { icon: CreditCard, value: takings, label: "Expected takings" },
    { icon: Clock3, value: upcoming, label: "Still to come" },
    { icon: Users, value: staff, label: "Staff working" },
  ];
  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6">
      <h2 className="font-display text-2xl">Today at a glance</h2>
      <div className="mt-5 grid grid-cols-2 divide-x divide-y sm:grid-cols-4 sm:divide-y-0">
        {stats.map(({ icon: Icon, value, label }, index) => (
          <div key={label} className={`px-3 py-4 text-center first:pl-0 sm:py-1 ${index === 2 ? "border-l-0 sm:border-l" : ""}`}>
            {loading ? (
              <Skeleton className="mx-auto h-12 w-20 rounded-lg" />
            ) : (
              <>
                <Icon className="mx-auto h-5 w-5 text-muted-foreground" />
                <div className="mt-3 text-xl font-semibold tabular-nums">{value}</div>
                <div className="mt-1 text-[11px] leading-4 text-muted-foreground">{label}</div>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function AttentionList({ loading, items }: { loading: boolean; items: DashboardAttentionItem[] }) {
  return (
    <section className="min-h-[568px] rounded-2xl border bg-card p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <Bell className="h-5 w-5" />
        <h2 className="font-display text-2xl">Needs your attention</h2>
      </div>
      <div className="mt-5 divide-y">
        {loading && Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 py-5">
            <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-56" /></div>
            <Skeleton className="h-10 w-20 rounded-lg" />
          </div>
        ))}
        {!loading && items.map((item) => {
          const Icon = attentionIcons[item.kind];
          return (
            <div key={item.id} className="flex items-center gap-4 py-6 first:pt-1">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-secondary">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">{item.description}</p>
              </div>
              <Button asChild variant="outline" size="sm" className="h-10 shrink-0 rounded-lg bg-card px-4">
                <Link to={item.href as any}>{item.action}</Link>
              </Button>
            </div>
          );
        })}
        {!loading && items.length === 0 && (
          <div className="grid min-h-[400px] place-items-center text-center">
            <div>
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-secondary">
                <CheckCircle2 className="h-6 w-6 text-[color:var(--gold-deep)]" />
              </div>
              <h3 className="mt-4 font-display text-xl">Everything is sorted</h3>
              <p className="mt-1 text-sm text-muted-foreground">Nothing needs your attention right now.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function QuickAction({ icon: Icon, label, to }: { icon: ComponentType<{ className?: string }>; label: string; to: string }) {
  return (
    <Link
      to={to as any}
      className="group flex min-h-24 items-center gap-4 border-b px-5 py-5 transition-colors hover:bg-secondary/35 sm:border-r xl:border-b-0"
    >
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-secondary">
        <Icon className="h-5 w-5" />
      </div>
      <span className="text-sm font-semibold">{label}</span>
      <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
}

function formatTimeUntil(value: string) {
  const minutes = Math.max(0, Math.round((new Date(value).getTime() - Date.now()) / 60_000));
  if (minutes < 60) return `In ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `In ${hours}h${remainder ? ` ${remainder}m` : ""}`;
}
