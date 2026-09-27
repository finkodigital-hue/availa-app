import { useQuery } from "@tanstack/react-query";
import { Copy, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getRebookingOpportunities } from "@/lib/rebooking-opportunities.functions";
import { getServerFnAuthHeaders } from "@/lib/server-fn-auth";

/** Read-only, owner-approved follow-up ideas; this component never sends. */
export function AssistantRebookingCard() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["assistant-rebooking-opportunities"],
    queryFn: async () =>
      getRebookingOpportunities({
        headers: await getServerFnAuthHeaders(),
      }),
    staleTime: 60_000,
  });

  return (
    <section
      className="rounded-2xl border bg-card p-5"
      aria-labelledby="assistant-rebooking-heading"
    >
      <div className="flex items-center gap-2">
        <RotateCcw
          className="h-4 w-4 text-[color:var(--gold-deep)]"
          aria-hidden="true"
        />
        <h2
          id="assistant-rebooking-heading"
          className="text-base font-semibold"
        >
          Ready for a return visit
        </h2>
      </div>
      {query.isPending ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Checking eligible clients…
        </p>
      ) : query.isError ? (
        <div className="mt-3 space-y-2 text-xs">
          <p>Could not check return-visit opportunities.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void query.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : !query.data.available ? (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Rebooking suggestions are unavailable. They require Studio, enabled
          rebooking emails and recorded customer permission.
        </p>
      ) : query.data.opportunities.length === 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          No consent-eligible clients are due to rebook in this checked set.
        </p>
      ) : (
        <div className="mt-3 divide-y">
          {query.data.opportunities.slice(0, 3).map((item) => (
            <div
              key={`${item.customerId}:${item.serviceName}`}
              className="py-3 first:pt-0"
            >
              <p className="text-sm font-medium">{item.customerName}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.serviceName} · due{" "}
                {new Intl.DateTimeFormat("en-GB", {
                  day: "numeric",
                  month: "short",
                }).format(new Date(item.dueAt))}
              </p>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(item.draft);
                    setCopiedId(item.customerId);
                  } catch {
                    setCopiedId(null);
                  }
                }}
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--gold-deep)] hover:underline"
              >
                <Copy className="h-3 w-3" aria-hidden="true" />
                {copiedId === item.customerId ? "Copied" : "Copy draft"}
              </button>
            </div>
          ))}
        </div>
      )}
      {query.data?.partial && (
        <p className="mt-2 text-xs text-muted-foreground">
          This is a partial shortlist, not every eligible customer.
        </p>
      )}
      <p className="mt-3 border-t pt-3 text-[11px] leading-relaxed text-muted-foreground">
        Drafts are not sent. Check each booking and permission before you
        contact anyone. Imported contacts are excluded unless they opted in
        here.
      </p>
    </section>
  );
}
