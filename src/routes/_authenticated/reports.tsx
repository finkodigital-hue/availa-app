import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  return (
    <div className="p-5 sm:p-8 md:p-10 max-w-5xl">
      <PageHeader
        eyebrow="Analytics"
        title="Reports"
        subtitle="Deep dive into revenue, staff, services and customers."
      />
      <div className="rounded-2xl border bg-card p-8 text-center shadow-soft">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-secondary grid place-items-center text-primary">
          <BarChart3 className="h-6 w-6" />
        </div>
        <h3 className="font-display text-2xl mt-5">Powered by your Dashboard</h3>
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
          Your most important business metrics — revenue trends, staff performance, service analytics and customer
          insights — live on the Dashboard with switchable Today / Week / Month / Year ranges.
        </p>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 mt-6 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm shadow-glow"
        >
          Open dashboard <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
