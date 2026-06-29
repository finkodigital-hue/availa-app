import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search, UserCircle, Mail, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/customers")({
  component: CustomersPage,
});

function CustomersPage() {
  const { data: biz } = useMyBusiness();
  const bid = biz?.id;
  const [q, setQ] = useState("");

  const { data: customers, isLoading } = useQuery({
    queryKey: ["customers", bid, q],
    enabled: !!bid,
    queryFn: async () => {
      let req = supabase
        .from("customers")
        .select("id, name, email, phone, notes, created_at, bookings:bookings(id, starts_at, status)")
        .eq("business_id", bid!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (q) req = req.ilike("name", `%${q}%`);
      const { data, error } = await req;
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="p-5 sm:p-8 md:p-10 max-w-6xl">
      <PageHeader
        eyebrow="People"
        title="Customers"
        subtitle="Everyone who's ever booked with you, with their full history."
      />
      <div className="relative mb-5 max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-10 h-11 bg-card"
        />
      </div>

      {isLoading ? (
        <div className="rounded-2xl border bg-card overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-5 py-4 border-t first:border-t-0 flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-2.5 w-48" />
              </div>
            </div>
          ))}
        </div>
      ) : customers?.length === 0 ? (
        <EmptyState
          icon={UserCircle}
          title={q ? "No matches" : "No customers yet"}
          description={
            q
              ? "Try a different name."
              : "Customers are automatically created the first time someone books with you. Share your booking page to get started."
          }
        />
      ) : (
        <div className="rounded-2xl border bg-card overflow-hidden shadow-soft">
          {/* Desktop table */}
          <table className="hidden sm:table w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-[0.12em] text-muted-foreground bg-muted/40">
              <tr>
                <th className="px-5 py-3 font-medium">Customer</th>
                <th className="px-5 py-3 font-medium">Contact</th>
                <th className="px-5 py-3 font-medium">Bookings</th>
                <th className="px-5 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {customers?.map((c: any) => (
                <tr key={c.id} className="border-t hover:bg-secondary/40 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-secondary grid place-items-center text-xs font-medium">
                        {c.name?.[0]?.toUpperCase() ?? "?"}
                      </div>
                      <span className="font-medium">{c.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {c.email && (
                      <div className="inline-flex items-center gap-1.5">
                        <Mail className="h-3 w-3" />
                        {c.email}
                      </div>
                    )}
                    {c.phone && !c.email && (
                      <div className="inline-flex items-center gap-1.5">
                        <Phone className="h-3 w-3" />
                        {c.phone}
                      </div>
                    )}
                    {!c.email && !c.phone && "—"}
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs tabular-nums">
                      {c.bookings?.length ?? 0}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{fmtDate(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile cards */}
          <ul className="sm:hidden divide-y">
            {customers?.map((c: any) => (
              <li key={c.id} className="px-4 py-3 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-secondary grid place-items-center text-sm font-medium">
                  {c.name?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{c.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {c.email || c.phone || "—"} · {c.bookings?.length ?? 0} booking
                    {(c.bookings?.length ?? 0) === 1 ? "" : "s"}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
