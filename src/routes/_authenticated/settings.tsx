import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Building2,
  Clock,
  Loader2,
  Crown,
  Armchair,
  Eye,
  CalendarCheck,
  Move,
  Globe2,
  UserRound,
  KeyRound,
  ShieldCheck,
  Sparkles,
  CreditCard,
  Trash2,
  AlertTriangle,
  ChevronRight,
  ArrowLeft,
  ExternalLink,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/app-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { WEEKDAYS } from "@/lib/format";
import { toast } from "sonner";
import { WhiteLabelEditor } from "@/components/white-label-editor";
import { TwoFactorSettings } from "@/components/two-factor-settings";
import { PlanSettings } from "@/components/plan-settings";
import { StripeSettings } from "@/components/stripe-settings";
import { deleteMyAccount } from "@/lib/account.functions";
import { saveBusinessProfile } from "@/lib/business-settings.functions";
import { getServerFnAuthHeaders } from "@/lib/server-fn-auth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const SETTINGS_TABS = [
  "account",
  "security",
  "plan",
  "profile",
  "payments",
  "hours",
  "whitelabel",
  "chairs",
] as const;

export const Route = createFileRoute("/_authenticated/settings")({
  validateSearch: (search: Record<string, unknown>): { tab?: (typeof SETTINGS_TABS)[number] } => ({
    tab: SETTINGS_TABS.includes(search.tab as any)
      ? (search.tab as (typeof SETTINGS_TABS)[number])
      : undefined,
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { data: biz } = useMyBusiness();
  const { user } = useAuth();
  const { tab } = Route.useSearch();
  const navigate = useNavigate();

  // A business is an "independent pro" if it's linked to at least one salon
  // as the pro side — that's what unlocks the chair-rentals tab below.
  const { data: salonLinks } = useQuery({
    queryKey: ["my-salon-links", biz?.id],
    enabled: !!biz?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salon_professionals")
        .select(
          "id, salon_business_id, status, chair_label, permissions, rent_mode, rent_amount_cents, commission_percent, rent_due_day",
        )
        .eq("pro_business_id", biz!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const salonIds = Array.from(new Set(data.map((d) => d.salon_business_id)));
      let salons: Record<string, { name: string }> = {};
      if (salonIds.length > 0) {
        const { data: bizRows } = await (supabase as any)
          .from("public_businesses")
          .select("id, name")
          .in("id", salonIds);
        salons = Object.fromEntries((bizRows ?? []).map((b: any) => [b.id, b]));
      }
      return data.map((d) => ({ ...d, salon: salons[d.salon_business_id] }));
    },
  });

  const {
    data: hourPeriods,
    isLoading: hoursSummaryLoading,
    isError: hoursSummaryError,
  } = useQuery({
    queryKey: ["settings-hours-summary", biz?.id],
    enabled: !!biz?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_hour_periods")
        .select("weekday, open_time, close_time")
        .eq("business_id", biz!.id)
        .order("weekday")
        .order("open_time");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: mfaEnabled, isError: mfaSummaryError } = useQuery({
    queryKey: ["settings-mfa-summary", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      return (data?.totp ?? []).some((factor) => factor.status === "verified");
    },
  });

  if (!biz)
    return (
      <div className="p-8">
        <Skeleton className="h-[400px]" />
      </div>
    );

  const isIndependentPro = (salonLinks?.length ?? 0) > 0;

  const openSetting = (nextTab: (typeof SETTINGS_TABS)[number]) =>
    navigate({ to: "/settings", search: { tab: nextTab } });

  if (!tab) {
    const profileFields = [
      biz.name,
      biz.timezone,
      biz.currency,
      biz.email,
      biz.phone,
      biz.website,
      biz.address,
      biz.description,
      biz.instagram,
      biz.logo_url,
    ];
    const completedProfileFields = profileFields.filter(
      (value) => typeof value === "string" && value.trim().length > 0,
    ).length;
    const todayLabel = new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      timeZone: biz.timezone || "Europe/London",
    }).format(new Date());
    const todayIndex = WEEKDAYS.findIndex((day) => day === todayLabel);
    const todayPeriods = (hourPeriods ?? []).filter((period) => period.weekday === todayIndex);
    const hoursSummary = hoursSummaryLoading
      ? "Checking today’s hours…"
      : hoursSummaryError
        ? "Manage opening hours"
        : todayPeriods.length === 0
          ? "Closed today"
          : `Open today · ${todayPeriods
              .map(
                (period) =>
                  `${String(period.open_time).slice(0, 5)}–${String(period.close_time).slice(0, 5)}`,
              )
              .join(", ")}`;
    const activeRentals = (salonLinks ?? []).filter((link) => link.status === "active").length;
    const planSummary = (biz.plan ?? "free") === "free" ? "Solo · Free" : "Studio · £22/month";
    const paymentSummary = biz.stripe_charges_enabled
      ? "Stripe connected"
      : biz.stripe_account_id
        ? "Stripe setup needed"
        : "Stripe not connected";

    return (
      <div className="w-full max-w-[1180px] p-5 sm:p-8 md:p-10">
        <PageHeader
          eyebrow="Workspace"
          title="Settings"
          subtitle="Manage your account, business details and operational preferences."
          action={
            biz.slug ? (
              <Button variant="outline" asChild className="h-11 bg-background px-3 xl:px-5">
                <a href={`/book/${biz.slug}`} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4 xl:mr-2" />
                  <span className="hidden xl:inline">View booking page</span>
                </a>
              </Button>
            ) : undefined
          }
        />

        <section className="mb-8 flex flex-col gap-5 rounded-2xl border border-[color:var(--gold)]/25 bg-[color:var(--cream)]/45 px-5 py-5 sm:px-6 lg:flex-row lg:items-center">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[color:var(--gold)]/15 text-[color:var(--gold-deep)]">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold">
              {completedProfileFields === profileFields.length
                ? "Your business profile is complete"
                : "Finish your business profile"}
            </p>
            <div className="mt-1.5 flex flex-col gap-2 lg:flex-row lg:items-center">
              <span className="whitespace-nowrap text-sm text-muted-foreground">
                {completedProfileFields} of {profileFields.length} details complete
              </span>
              <div
                className="h-1.5 w-full max-w-[300px] overflow-hidden rounded-full bg-border"
                role="progressbar"
                aria-valuenow={completedProfileFields}
                aria-valuemin={0}
                aria-valuemax={profileFields.length}
                aria-label="Business profile completion"
              >
                <div
                  className="h-full rounded-full bg-[color:var(--gold-deep)] transition-[width]"
                  style={{ width: `${(completedProfileFields / profileFields.length) * 100}%` }}
                />
              </div>
            </div>
          </div>
          <Button className="shrink-0 px-6" onClick={() => openSetting("profile")}>
            {completedProfileFields === profileFields.length ? "Review" : "Continue"}
          </Button>
        </section>

        <SettingsGroup label="Your business">
          <SettingsRow
            icon={Building2}
            title="Business profile"
            description="Manage your salon name, location and contact details."
            summary={`${biz.name} · ${biz.timezone || "Timezone not set"}`}
            onClick={() => openSetting("profile")}
          />
          <SettingsRow
            icon={Clock}
            title="Opening hours"
            description="Set your working hours and holiday closures."
            summary={hoursSummary}
            onClick={() => openSetting("hours")}
          />
          <SettingsRow
            icon={Crown}
            title="White-label"
            description="Manage how Bookzenvo appears to your clients."
            summary={biz.hide_powered_by ? "Bookzenvo branding hidden" : "Bookzenvo branding shown"}
            onClick={() => openSetting("whitelabel")}
          />
          {isIndependentPro && (
            <SettingsRow
              icon={Armchair}
              title="Chair rentals"
              description="View and manage your active chair rentals."
              summary={activeRentals === 0 ? "No active rentals" : `${activeRentals} active`}
              onClick={() => openSetting("chairs")}
            />
          )}
          <SettingsRow
            icon={CreditCard}
            title="Payments"
            description="Manage payment collection, deposits and Stripe."
            summary={paymentSummary}
            onClick={() => openSetting("payments")}
          />
        </SettingsGroup>

        <SettingsGroup label="Money & plan">
          <SettingsRow
            icon={Sparkles}
            title="Plan & billing"
            description="View your plan, billing options and included features."
            summary={planSummary}
            onClick={() => openSetting("plan")}
          />
        </SettingsGroup>

        <SettingsGroup label="Account">
          <SettingsRow
            icon={UserRound}
            title="Your account"
            description="Update your account details and password."
            summary={user?.email || "Account details"}
            onClick={() => openSetting("account")}
          />
          <SettingsRow
            icon={ShieldCheck}
            title="Security"
            description="Manage two-factor authentication."
            summary={
              mfaSummaryError
                ? "Manage sign-in protection"
                : mfaEnabled === undefined
                  ? "Checking protection…"
                  : mfaEnabled
                    ? "2-step verification on"
                    : "2-step verification off"
            }
            onClick={() => openSetting("security")}
          />
        </SettingsGroup>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl p-5 sm:p-8 md:p-10">
      <button
        type="button"
        onClick={() => navigate({ to: "/settings", search: {} })}
        className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <ArrowLeft className="h-4 w-4" /> Back to settings
      </button>

      {tab === "account" && (
        <div className="space-y-5">
          <Section
            icon={UserRound}
            title="Your account"
            description="Manage the details associated with your Bookzenvo sign-in."
          >
            {user && <AccountEditor user={user} />}
          </Section>
          <Section
            icon={AlertTriangle}
            title="Danger zone"
            description="Permanently delete this workspace and everything in it."
          >
            <DeleteAccountSection biz={biz} />
          </Section>
        </div>
      )}
      {tab === "security" && (
        <Section
          icon={ShieldCheck}
          title="Security"
          description="Add extra protection to your Bookzenvo sign-in."
        >
          <TwoFactorSettings />
        </Section>
      )}
      {tab === "plan" && (
        <Section
          icon={Sparkles}
          title="Plan"
          description="Free for one staff member — upgrade to Studio for unlimited staff and AI features."
        >
          <PlanSettings business={biz} />
        </Section>
      )}
      {tab === "profile" && (
        <Section
          icon={Building2}
          title="Business profile"
          description="The core details customers and staff see across the app."
        >
          <ProfileEditor biz={biz} />
        </Section>
      )}
      {tab === "payments" && (
        <Section
          icon={CreditCard}
          title="Payments"
          description="Connect Stripe, then choose whether bookings take a deposit or payment in full."
        >
          <StripeSettings business={biz} />
        </Section>
      )}
      {tab === "hours" && (
        <Section
          icon={Clock}
          title="Opening hours"
          description="Your weekly schedule, split shifts and holiday closures."
        >
          <HoursEditor biz={biz} />
        </Section>
      )}
      {tab === "whitelabel" && (
        <Section
          icon={Crown}
          title="White-label"
          description="Remove Bookzenvo branding for your customers."
        >
          <WhiteLabelEditor business={biz} />
        </Section>
      )}
      {tab === "chairs" && isIndependentPro && (
        <ChairRentalsEditor businessId={biz.id} links={salonLinks ?? []} />
      )}
    </div>
  );
}

function AccountEditor({ user }: { user: { id: string; email?: string } }) {
  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-profile", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const qc = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  useEffect(() => {
    setFullName(profile?.full_name ?? "");
    setAvatarUrl(profile?.avatar_url ?? "");
  }, [profile]);

  const initials = (fullName || user.email || "U")
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const save = async () => {
    if (!fullName.trim()) return toast.error("Your name is required");
    setSaving(true);
    try {
      const [profileResult, authResult] = await Promise.all([
        supabase.from("profiles").upsert({
          id: user.id,
          full_name: fullName.trim(),
          avatar_url: avatarUrl.trim() || null,
        }),
        supabase.auth.updateUser({ data: { full_name: fullName.trim() } }),
      ]);
      if (profileResult.error) throw profileResult.error;
      if (authResult.error) throw authResult.error;
      qc.invalidateQueries({ queryKey: ["my-profile", user.id] });
      toast.success("Account details saved");
    } catch (error: any) {
      toast.error(error.message ?? "Could not save account details");
    } finally {
      setSaving(false);
    }
  };

  const sendPasswordReset = async () => {
    if (!user.email) return toast.error("This account has no email address");
    setSendingReset(true);
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/auth?mode=update`,
    });
    setSendingReset(false);
    if (error) return toast.error(error.message);
    toast.success("Password reset email sent");
  };

  if (isLoading) return <Skeleton className="h-56 w-full" />;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 rounded-xl border bg-background p-4">
        <Avatar className="h-14 w-14 border">
          {avatarUrl && <AvatarImage src={avatarUrl} alt="Your avatar" />}
          <AvatarFallback className="bg-secondary text-sm font-semibold">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="font-medium truncate">{fullName || "Your account"}</p>
          <p className="text-sm text-muted-foreground truncate">{user.email}</p>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Full name">
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="h-10"
            autoComplete="name"
          />
        </Field>
        <Field label="Sign-in email">
          <Input value={user.email ?? ""} className="h-10" readOnly />
        </Field>
      </div>
      <Field label="Avatar image URL">
        <Input
          type="url"
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          className="h-10"
          placeholder="https://"
        />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
        <div>
          <p className="text-sm font-medium">Password</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            We’ll send a secure reset link to your sign-in email.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={sendPasswordReset} disabled={sendingReset}>
          {sendingReset ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <KeyRound className="h-4 w-4 mr-2" />
          )}
          Reset password
        </Button>
      </div>
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save account
        </Button>
      </div>
    </div>
  );
}

function DeleteAccountSection({ biz }: { biz: { id: string; name: string } }) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const canConfirm = confirmText.trim().length > 0 && confirmText.trim() === biz.name.trim();

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const headers = await getServerFnAuthHeaders();
      await deleteMyAccount({ data: { confirmName: confirmText.trim() }, headers });
      toast.success("Your account and all its data have been deleted.");
      try {
        await supabase.auth.signOut();
      } catch {
        // The account is already gone server-side either way — don't let a
        // sign-out hiccup stop the redirect below.
      }
      setTimeout(() => window.location.assign("/"), 1200);
    } catch (error: any) {
      toast.error(error.message ?? "Could not delete the account");
      setDeleting(false);
    }
  };

  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      <p className="text-sm font-medium">Delete {biz.name}</p>
      <p className="text-xs text-muted-foreground mt-1 mb-4 text-pretty">
        Permanently deletes this business, every booking, customer, staff member and setting,
        cancels your Studio subscription if you have one, and removes your sign-in. This cannot be
        undone.
      </p>
      <AlertDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setConfirmText("");
        }}
      >
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground"
          >
            <Trash2 className="h-4 w-4 mr-2" /> Delete account
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl">
              Delete {biz.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This immediately and permanently deletes the business, all bookings, customers, staff,
              hours and page content, cancels any active subscription, and signs you out for good.
              There's no undo — type the business name below to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={biz.name}
            className="h-10"
            autoComplete="off"
            autoFocus
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!canConfirm || deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async (e) => {
                // Same reasoning as ConfirmDialog: take over closing
                // ourselves since onConfirm is async and we redirect the
                // whole page afterwards rather than just closing the dialog.
                e.preventDefault();
                await handleDelete();
              }}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Permanently delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SettingsGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </h2>
      <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">{children}</div>
    </section>
  );
}

function SettingsRow({
  icon: Icon,
  title,
  description,
  summary,
  onClick,
}: {
  icon: typeof Building2;
  title: string;
  description: string;
  summary: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b px-4 py-4 text-left transition-colors last:border-b-0 hover:bg-secondary/35 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring lg:grid-cols-[auto_minmax(180px,0.85fr)_minmax(220px,1.35fr)_minmax(160px,0.8fr)_auto] lg:gap-5 lg:px-6"
      aria-label={`Open ${title} settings`}
    >
      <Icon className="h-5 w-5 shrink-0 text-foreground" />
      <span className="min-w-0 text-sm font-semibold lg:text-[15px]">{title}</span>
      <span className="col-span-2 row-start-2 min-w-0 text-xs leading-5 text-muted-foreground lg:col-span-1 lg:row-start-auto lg:text-sm">
        {description}
      </span>
      <span className="hidden min-w-0 truncate text-right text-sm text-muted-foreground lg:block">
        {summary}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
    </button>
  );
}

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon?: typeof Building2;
  title?: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6 shadow-soft animate-rise">
      {(title || description) && (
        <div className="flex items-start gap-3 mb-5 pb-5 border-b">
          {Icon && (
            <span className="h-9 w-9 shrink-0 rounded-xl grid place-items-center bg-secondary text-foreground">
              <Icon className="h-4.5 w-4.5" />
            </span>
          )}
          <div className="min-w-0">
            {title && <h2 className="font-display text-lg leading-tight">{title}</h2>}
            {description && (
              <p className="text-sm text-muted-foreground mt-0.5 text-pretty">{description}</p>
            )}
          </div>
        </div>
      )}
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

type SalonLink = {
  id: string;
  salon_business_id: string;
  status: string;
  chair_label: string | null;
  permissions: any;
  rent_mode: string;
  rent_amount_cents: number | null;
  commission_percent: number | null;
  rent_due_day: number | null;
  salon?: { name: string };
};

const PRO_PERMISSIONS: {
  key: string;
  label: string;
  description: string;
  icon: typeof Eye;
}[] = [
  {
    key: "salon_can_view_calendar",
    label: "Show me on their calendar",
    description: "The salon sees your bookings and staff column on their internal calendar.",
    icon: Eye,
  },
  {
    key: "public_bookable",
    label: "List me on their booking page",
    description: "Customers can book you directly through the salon's public booking page.",
    icon: Globe2,
  },
  {
    key: "salon_can_book",
    label: "Let them create bookings for me",
    description: "The salon can add new bookings on your calendar, e.g. for walk-ins.",
    icon: CalendarCheck,
  },
  {
    key: "salon_can_move",
    label: "Let them reschedule my bookings",
    description: "The salon can drag/move or resize your existing bookings.",
    icon: Move,
  },
];

function rentSummaryFor(l: {
  rent_mode: string;
  rent_amount_cents: number | null;
  commission_percent: number | null;
}) {
  const money = (c: number | null) => (c == null ? "—" : `$${(c / 100).toFixed(2)}`);
  switch (l.rent_mode) {
    case "weekly":
      return `${money(l.rent_amount_cents)} / week`;
    case "monthly":
      return `${money(l.rent_amount_cents)} / month`;
    case "percentage":
      return `${l.commission_percent ?? 0}% commission`;
    case "fixed_commission":
      return `${money(l.rent_amount_cents)} per booking`;
    default:
      return "No rent agreement";
  }
}

function ChairRentalsEditor({ businessId, links }: { businessId: string; links: SalonLink[] }) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);

  const togglePermission = async (link: SalonLink, key: string, value: boolean) => {
    const next = { ...link.permissions, [key]: value };
    setPending(`${link.id}:${key}`);
    // Optimistic update so the switch responds instantly.
    qc.setQueryData<SalonLink[]>(["my-salon-links", businessId], (old) =>
      old?.map((l) => (l.id === link.id ? { ...l, permissions: next } : l)),
    );
    const { error } = await supabase
      .from("salon_professionals")
      .update({ permissions: next })
      .eq("id", link.id);
    setPending(null);
    if (error) {
      toast.error(error.message);
      qc.invalidateQueries({ queryKey: ["my-salon-links", businessId] });
      return;
    }
    toast.success("Saved");
  };

  if (links.length === 0) return null;

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground text-pretty px-1">
        You're renting a chair at {links.length} salon{links.length === 1 ? "" : "s"}. Control
        exactly what each one can see and do — your revenue, customers and reports are never shared,
        no matter what's toggled here.
      </p>
      {links.map((l) => (
        <Section key={l.id}>
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="font-display text-lg truncate">{l.salon?.name ?? "Salon"}</h3>
                {l.status === "active" ? (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"
                    title="Active"
                  />
                ) : (
                  <Badge variant="secondary" className="text-[10px] capitalize shrink-0">
                    {l.status}
                  </Badge>
                )}
              </div>
              {l.chair_label && (
                <p className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-1">
                  <Armchair className="h-3 w-3 shrink-0" /> {l.chair_label}
                </p>
              )}
            </div>
            <div className="text-xs text-muted-foreground text-right shrink-0">
              <div className="uppercase tracking-wide text-[10px]">You pay</div>
              <div className="font-medium text-foreground">{rentSummaryFor(l)}</div>
            </div>
          </div>
          <div className="space-y-1 -mx-1">
            {PRO_PERMISSIONS.map(({ key, label, description, icon: Icon }) => (
              <div
                key={key}
                className="flex items-center justify-between gap-4 rounded-xl px-3 py-2.5 hover:bg-secondary/40"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{label}</div>
                    <p className="text-xs text-muted-foreground text-pretty">{description}</p>
                  </div>
                </div>
                <Switch
                  checked={l.permissions?.[key] ?? true}
                  disabled={pending === `${l.id}:${key}`}
                  onCheckedChange={(v) => togglePermission(l, key, v)}
                  className="shrink-0"
                />
              </div>
            ))}
          </div>
        </Section>
      ))}
    </div>
  );
}

function ProfileEditor({ biz }: { biz: any }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>(biz);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const saveProfileSettings = useServerFn(saveBusinessProfile);
  useEffect(() => {
    setForm(biz);
  }, [biz?.id]);

  const premium = (form.plan ?? "free") !== "free";

  const save = async () => {
    if (!form.name?.trim()) return toast.error("Business name is required");
    setSaving(true);
    try {
      const headers = await getServerFnAuthHeaders();
      await saveProfileSettings({
        data: {
          name: form.name.trim(),
          description: form.description,
          address: form.address,
          phone: form.phone,
          email: form.email,
          website: form.website,
          timezone: form.timezone,
          currency: form.currency || "GBP",
          instagram: form.instagram,
          facebook: form.facebook,
          tiktok: form.tiktok,
          twitter: form.twitter,
          reminderHoursBefore: premium
            ? Number(form.reminder_hours_before) || 24
            : (biz.reminder_hours_before ?? 24),
        },
        headers,
      });
      toast.success("Profile saved");
      qc.invalidateQueries({ queryKey: ["my-business"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save business profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Name">
          <Input
            value={form.name ?? ""}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="h-10"
          />
        </Field>
        <Field label="Timezone">
          <Input
            value={form.timezone ?? ""}
            onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            className="h-10"
          />
        </Field>
        <Field label="Currency">
          <select
            value={form.currency ?? "GBP"}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
            className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="GBP">British pound (GBP £)</option>
            <option value="USD">US dollar (USD $)</option>
            <option value="EUR">Euro (EUR €)</option>
            <option value="AUD">Australian dollar (AUD A$)</option>
            <option value="CAD">Canadian dollar (CAD C$)</option>
            <option value="NZD">New Zealand dollar (NZD NZ$)</option>
          </select>
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={form.email ?? ""}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="h-10"
          />
        </Field>
        <Field label="Phone">
          <Input
            value={form.phone ?? ""}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="h-10"
          />
        </Field>
        <Field label="Website">
          <Input
            value={form.website ?? ""}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
            className="h-10"
            placeholder="https://"
          />
        </Field>
        <Field label="Address">
          <Input
            value={form.address ?? ""}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            className="h-10"
          />
        </Field>
      </div>
      <Field label="Description">
        <Textarea
          value={form.description ?? ""}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="A short pitch for your booking page"
        />
      </Field>

      <div className={`rounded-xl border p-4 ${premium ? "" : "opacity-70"}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium">Reminder emails</span>
          {!premium && (
            <Badge variant="secondary" className="text-[10px]">
              Studio
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Send clients an email reminder before their appointment, with one-tap confirm, cancel and
          reschedule.
        </p>
        {premium ? (
          <Field label="Hours before appointment">
            <Input
              type="number"
              min={1}
              max={168}
              value={form.reminder_hours_before ?? 24}
              onChange={(e) => setForm({ ...form, reminder_hours_before: e.target.value })}
              className="h-10 max-w-[140px]"
            />
          </Field>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate({ to: "/settings", search: { tab: "plan" } as any })}
          >
            Upgrade to Studio
          </Button>
        )}
      </div>
      <div className="grid sm:grid-cols-4 gap-3">
        <Field label="Instagram">
          <Input
            value={form.instagram ?? ""}
            onChange={(e) => setForm({ ...form, instagram: e.target.value })}
            className="h-10"
            placeholder="@handle"
          />
        </Field>
        <Field label="Facebook">
          <Input
            value={form.facebook ?? ""}
            onChange={(e) => setForm({ ...form, facebook: e.target.value })}
            className="h-10"
          />
        </Field>
        <Field label="TikTok">
          <Input
            value={form.tiktok ?? ""}
            onChange={(e) => setForm({ ...form, tiktok: e.target.value })}
            className="h-10"
            placeholder="@handle"
          />
        </Field>
        <Field label="X">
          <Input
            value={form.twitter ?? ""}
            onChange={(e) => setForm({ ...form, twitter: e.target.value })}
            className="h-10"
          />
        </Field>
      </div>
      <div className="pt-1 flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save profile
        </Button>
      </div>
    </div>
  );
}

type Period = { id?: string; open_time: string; close_time: string };

function HoursEditor({ biz }: { biz: any }) {
  const qc = useQueryClient();
  const { data: periods, isLoading } = useQuery({
    queryKey: ["business-hour-periods", biz.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_hour_periods")
        .select("*")
        .eq("business_id", biz.id)
        .order("weekday")
        .order("open_time");
      if (error) throw error;
      return data ?? [];
    },
  });

  // 7 buckets — array of periods per weekday. Empty array = closed.
  const [days, setDays] = useState<Period[][]>(() => Array.from({ length: 7 }, () => []));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const buckets: Period[][] = Array.from({ length: 7 }, () => []);
    for (const p of periods ?? []) {
      buckets[(p as any).weekday]?.push({
        id: (p as any).id,
        open_time: String((p as any).open_time).slice(0, 5),
        close_time: String((p as any).close_time).slice(0, 5),
      });
    }
    setDays(buckets);
  }, [periods]);

  const updatePeriod = (w: number, i: number, patch: Partial<Period>) => {
    setDays((prev) => {
      const next = prev.map((arr) => arr.slice());
      next[w][i] = { ...next[w][i], ...patch };
      return next;
    });
  };
  const addPeriod = (w: number) => {
    setDays((prev) => {
      const next = prev.map((arr) => arr.slice());
      const last = next[w][next[w].length - 1];
      next[w].push(
        last
          ? { open_time: last.close_time, close_time: "18:00" }
          : { open_time: "09:00", close_time: "18:00" },
      );
      return next;
    });
  };
  const removePeriod = (w: number, i: number) => {
    setDays((prev) => {
      const next = prev.map((arr) => arr.slice());
      next[w].splice(i, 1);
      return next;
    });
  };
  const toggleClosed = (w: number, closed: boolean) => {
    setDays((prev) => {
      const next = prev.map((arr) => arr.slice());
      next[w] = closed ? [] : [{ open_time: "09:00", close_time: "18:00" }];
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      // Validate: each period open < close; no overlap within a day.
      for (let w = 0; w < 7; w++) {
        const sorted = [...days[w]].sort((a, b) => a.open_time.localeCompare(b.open_time));
        for (let i = 0; i < sorted.length; i++) {
          if (sorted[i].open_time >= sorted[i].close_time)
            throw new Error(`${WEEKDAYS[w]}: opening time must be before closing time.`);
          if (i > 0 && sorted[i].open_time < sorted[i - 1].close_time)
            throw new Error(`${WEEKDAYS[w]}: periods overlap.`);
        }
      }

      // Wipe & reinsert — simplest correct behaviour.
      const { error: delErr } = await supabase
        .from("business_hour_periods")
        .delete()
        .eq("business_id", biz.id);
      if (delErr) throw delErr;
      const rows = days.flatMap((arr, w) =>
        arr.map((p) => ({
          business_id: biz.id,
          weekday: w,
          open_time: p.open_time,
          close_time: p.close_time,
        })),
      );
      if (rows.length) {
        const { error } = await supabase.from("business_hour_periods").insert(rows);
        if (error) throw error;
      }

      // Mirror primary period back into legacy business_hours for compatibility.
      const legacy = Array.from({ length: 7 }, (_, w) => {
        const first = [...days[w]].sort((a, b) => a.open_time.localeCompare(b.open_time))[0];
        return {
          business_id: biz.id,
          weekday: w,
          open_time: first?.open_time ?? null,
          close_time: first?.close_time ?? null,
          closed: !first,
        };
      });
      await supabase.from("business_hours").upsert(legacy, { onConflict: "business_id,weekday" });

      toast.success("Hours saved");
      qc.invalidateQueries({ queryKey: ["business-hour-periods"] });
      qc.invalidateQueries({ queryKey: ["business-hours"] });
      qc.invalidateQueries({ queryKey: ["slots-day"] });
    } catch (e: any) {
      toast.error(e.message ?? "Could not save");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading)
    return (
      <div className="space-y-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Add multiple periods per day for split shifts (e.g. 9:00–13:00 and 14:00–18:00).
      </p>
      <div className="space-y-2">
        {days.map((periods, w) => {
          const closed = periods.length === 0;
          return (
            <div
              key={w}
              className={`rounded-xl border bg-background p-3 transition-colors ${closed ? "opacity-70" : ""}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold">{WEEKDAYS[w]}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {closed ? "Closed" : "Open"}
                  </span>
                  <Switch checked={!closed} onCheckedChange={(v) => toggleClosed(w, !v)} />
                </div>
              </div>
              {!closed && (
                <div className="space-y-1.5">
                  {periods.map((p, i) => (
                    <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
                      <Input
                        type="time"
                        value={p.open_time}
                        onChange={(e) => updatePeriod(w, i, { open_time: e.target.value })}
                        className="h-9 tabular-nums"
                      />
                      <span className="text-xs text-muted-foreground">to</span>
                      <Input
                        type="time"
                        value={p.close_time}
                        onChange={(e) => updatePeriod(w, i, { close_time: e.target.value })}
                        className="h-9 tabular-nums"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removePeriod(w, i)}
                        disabled={periods.length === 1}
                        className="h-9 text-xs text-muted-foreground hover:text-destructive"
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => addPeriod(w)}
                    className="h-8 text-xs"
                  >
                    + Add period
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <HolidayClosures businessId={biz.id} />
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save hours
        </Button>
      </div>
    </div>
  );
}

function HolidayClosures({ businessId }: { businessId: string }) {
  const qc = useQueryClient();
  const { data: rows } = useQuery({
    queryKey: ["holiday-closures", businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("holiday_closures")
        .select("*")
        .eq("business_id", businessId)
        .order("starts_on");
      if (error) throw error;
      return data ?? [];
    },
  });
  const [draft, setDraft] = useState({ label: "", starts_on: "", ends_on: "" });

  const add = async () => {
    if (!draft.label || !draft.starts_on || !draft.ends_on) return toast.error("Fill all fields");
    if (draft.starts_on > draft.ends_on)
      return toast.error("End date must be on or after the start date");
    const { error } = await supabase
      .from("holiday_closures")
      .insert({ business_id: businessId, ...draft });
    if (error) return toast.error(error.message);
    setDraft({ label: "", starts_on: "", ends_on: "" });
    qc.invalidateQueries({ queryKey: ["holiday-closures"] });
  };
  const remove = async (id: string) => {
    await supabase.from("holiday_closures").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["holiday-closures"] });
  };

  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-3">
        Holiday closures
      </div>
      <div className="space-y-1.5 mb-3">
        {(rows ?? []).length === 0 && (
          <p className="text-xs text-muted-foreground">No closures scheduled.</p>
        )}
        {(rows ?? []).map((r: any) => (
          <div
            key={r.id}
            className="flex items-center justify-between text-sm rounded-lg px-3 py-2 hover:bg-secondary/40"
          >
            <span className="font-medium">{r.label}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {r.starts_on} → {r.ends_on}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => remove(r.id)}
              className="h-7 text-xs text-muted-foreground hover:text-destructive"
            >
              Remove
            </Button>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[1fr_140px_140px_auto] gap-2">
        <Input
          placeholder="Reason (e.g. Christmas)"
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          className="h-9"
        />
        <Input
          type="date"
          value={draft.starts_on}
          onChange={(e) => setDraft({ ...draft, starts_on: e.target.value })}
          className="h-9 tabular-nums"
        />
        <Input
          type="date"
          value={draft.ends_on}
          onChange={(e) => setDraft({ ...draft, ends_on: e.target.value })}
          className="h-9 tabular-nums"
        />
        <Button variant="outline" size="sm" onClick={add}>
          Add
        </Button>
      </div>
    </div>
  );
}
