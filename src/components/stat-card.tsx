import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  trend,
  loading,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: string;
  trend?: number; // percent change
  loading?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className={`group relative rounded-2xl border bg-card p-5 card-hover overflow-hidden ${
        accent ? "shadow-elegant" : "shadow-soft"
      }`}
    >
      {accent && (
        <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-primary/10 blur-2xl pointer-events-none" />
      )}
      <div className="flex items-center justify-between">
        <span className="text-[11px] tracking-[0.12em] uppercase text-muted-foreground font-medium">
          {label}
        </span>
        <div className="h-8 w-8 rounded-lg bg-secondary grid place-items-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-4 flex items-baseline justify-between gap-2">
        {loading ? (
          <Skeleton className="h-9 w-24" />
        ) : (
          <div className="font-display text-3xl tabular-nums tracking-tight">
            {value}
          </div>
        )}
        {typeof trend === "number" && !loading && (
          <span
            className={`inline-flex items-center gap-0.5 text-xs font-medium rounded-full px-1.5 py-0.5 ${
              trend >= 0
                ? "text-success bg-success/10"
                : "text-destructive bg-destructive/10"
            }`}
          >
            {trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(trend).toFixed(0)}%
          </span>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground mt-1.5">{hint}</p>}
    </div>
  );
}
