import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = "",
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-3xl border border-dashed bg-card/40 px-6 py-16 text-center animate-rise ${className}`}
    >
      <div className="mx-auto h-14 w-14 rounded-2xl bg-secondary grid place-items-center text-primary shadow-soft">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="font-display text-xl mt-5">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto text-pretty">
          {description}
        </p>
      )}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}
