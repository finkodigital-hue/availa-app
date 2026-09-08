import { Link } from "@tanstack/react-router";
import { Crown } from "lucide-react";

export function StudioUpgradePanel({
  title,
  description,
  className = "",
}: {
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-dashed bg-card/40 p-8 text-center sm:p-12 ${className}`}>
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10">
        <Crown className="h-5 w-5 text-[color:var(--gold-deep)]" />
      </div>
      <h2 className="font-display text-xl">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      <Link
        to="/settings"
        search={{ tab: "plan" } as any}
        className="mt-5 inline-flex items-center gap-1.5 rounded-[6px] bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:-translate-y-px"
      >
        Upgrade to Studio
      </Link>
    </div>
  );
}
