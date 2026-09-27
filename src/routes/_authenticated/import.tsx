import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/app-shell";
import { useMyBusiness } from "@/lib/business";
import { useAuth } from "@/lib/auth";
import { StaffStep } from "@/components/import/staff-step";
import { CustomersStep } from "@/components/import/customers-step";
import { ServicesStep } from "@/components/import/services-step";
import { AppointmentsStep } from "@/components/import/appointments-step";
import { ImportHistoryPanel } from "@/components/import/history-panel";
import { useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  CalendarCheck2,
  CheckCircle2,
  FileSpreadsheet,
  ShieldCheck,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/import")({
  component: ImportPage,
});

function ImportPage() {
  const { data: biz } = useMyBusiness();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [sessionId] = useState(() => crypto.randomUUID());

  if (!biz?.id) {
    return (
      <div className="p-5 sm:p-8 md:p-10 max-w-3xl">
        <PageHeader
          eyebrow="Import data"
          title="Import from any booking system"
          subtitle="Loading your business…"
        />
      </div>
    );
  }

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["staff"] });
    qc.invalidateQueries({ queryKey: ["customers"] });
    qc.invalidateQueries({ queryKey: ["services"] });
    qc.invalidateQueries({ queryKey: ["import-batches", biz.id] });
  };

  return (
    <div className="p-5 sm:p-8 md:p-10 max-w-3xl">
      <PageHeader
        eyebrow="Import data"
        title="Move your salon to Bookzenvo"
        subtitle="Bring over the essentials, compare your future diary, then switch when you're ready."
      />

      <div className="space-y-5">
        <ImportGuide />
        <CutoverGuide />
        <StaffStep
          businessId={biz.id}
          sessionId={sessionId}
          userId={user?.id ?? null}
          onCommitted={invalidateAll}
        />
        <CustomersStep
          businessId={biz.id}
          sessionId={sessionId}
          userId={user?.id ?? null}
          onCommitted={invalidateAll}
        />
        <ServicesStep
          businessId={biz.id}
          sessionId={sessionId}
          userId={user?.id ?? null}
          currency={biz.currency ?? "GBP"}
          onCommitted={invalidateAll}
        />
        <AppointmentsStep
          businessId={biz.id}
          sessionId={sessionId}
          userId={user?.id ?? null}
          currency={biz.currency ?? "GBP"}
          onCommitted={invalidateAll}
        />
      </div>

      <ImportHistoryPanel businessId={biz.id} />
    </div>
  );
}

function ImportGuide() {
  return (
    <section className="rounded-2xl border bg-card p-5 sm:p-6 shadow-soft">
      <div className="flex items-start gap-3">
        <span className="h-9 w-9 shrink-0 rounded-xl grid place-items-center bg-secondary text-foreground">
          <BookOpen className="h-4.5 w-4.5" />
        </span>
        <div>
          <h2 className="font-display text-lg leading-tight">
            Before you start
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            A quick guide to moving your booking data safely.
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3 mt-5">
        <GuideStep icon={FileSpreadsheet} title="1. Export your data">
          In your previous system, export separate CSV files for staff, clients,
          services and appointments — look for "Export" or "Download" in its
          settings or reports area. Keep the original column headings.
        </GuideStep>
        <GuideStep icon={CheckCircle2} title="2. Import in order">
          Start with staff, then clients and services. Import appointments last
          so Bookzenvo can match each booking to the right records.
        </GuideStep>
        <GuideStep icon={ShieldCheck} title="3. Review, then confirm">
          We show a preview before saving. Check how each column was matched and
          correct anything that looks wrong. Imported batches can be reviewed in
          the history section below; removal may be restricted if records are
          already in use.
        </GuideStep>
      </div>
      <p className="mt-5 rounded-xl bg-secondary/60 px-3 py-2.5 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">CSV imports:</span> Fresha
        columns are recognised automatically. Other systems' CSV exports may
        need manual column matching. Check the preview carefully; not every
        system includes the same fields in its export.
      </p>
    </section>
  );
}

function CutoverGuide() {
  return (
    <section
      className="rounded-2xl border bg-card p-5 sm:p-6 shadow-soft"
      aria-labelledby="cutover-title"
    >
      <div className="flex items-start gap-3">
        <span className="h-9 w-9 shrink-0 rounded-xl grid place-items-center bg-secondary text-foreground">
          <CalendarCheck2 className="h-4.5 w-4.5" />
        </span>
        <div>
          <h2 id="cutover-title" className="font-display text-lg leading-tight">
            Before you go live
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Keep your old diary available until these checks are done.
          </p>
        </div>
      </div>
      <ol className="mt-4 space-y-3 text-sm text-foreground">
        <li>
          <span className="font-medium">1. Compare future bookings.</span> Your
          appointment file must include upcoming visits. After import, compare
          the next few weeks in both calendars, including team member and
          service.
        </li>
        <li>
          <span className="font-medium">2. Check what stayed behind.</span>{" "}
          Saved cards, gift balances, memberships, outstanding payment balances,
          consultation answers, photos and reviews are not moved by these CSV
          steps. Plan to handle any of those separately.
        </li>
        <li>
          <span className="font-medium">3. Choose a switch date.</span> Only
          share your new booking link once the diary and services look right.
          Then update links on your website and social pages, and deal with any
          bookings still arriving in the old system.
        </li>
      </ol>
      <p className="mt-4 text-xs text-muted-foreground">
        Bookzenvo does not close your old account, cancel its reminders or
        notify clients that you've switched.
      </p>
    </section>
  );
}

function GuideStep({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof BookOpen;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <h3 className="text-sm font-medium mt-2">{title}</h3>
      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
        {children}
      </p>
    </div>
  );
}
