import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

// Full-screen takeover for the 4-step setup wizard. `fixed inset-0` covers
// the AppShell sidebar/nav without needing a separate route — visually a
// takeover, no routing changes.
export function WizardShell({
  step,
  totalSteps,
  onBack,
  children,
}: {
  step: number;
  totalSteps: number;
  onBack?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
      <div className="absolute inset-0 mesh-bg pointer-events-none" />
      <div className="relative min-h-full flex items-start sm:items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg animate-rise">
          <div className="flex items-center gap-3 mb-8">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                aria-label="Back"
                className="h-8 w-8 shrink-0 grid place-items-center rounded-full border text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            ) : (
              <div className="w-8" />
            )}
            <div className="flex gap-1.5">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 w-8 rounded-full transition-colors ${
                    i < step ? "bg-primary" : "bg-secondary"
                  }`}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground ml-auto">
              Step {step} of {totalSteps}
            </span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
