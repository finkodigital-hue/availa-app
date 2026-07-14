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
        <PageHeader eyebrow="Import" title="Import from Fresha" subtitle="Loading your business…" />
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
        eyebrow="Import"
        title="Import from Fresha"
        subtitle="Bring over your team, clients, services and appointment history. Nothing is written until you confirm each step, and every import can be undone."
      />

      <div className="space-y-5">
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
        />
      </div>

      <ImportHistoryPanel businessId={biz.id} />
    </div>
  );
}
