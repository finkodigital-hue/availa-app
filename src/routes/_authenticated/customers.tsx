import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { PageHeader } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/customers")({
  component: CustomersPage,
});

function CustomersPage() {
  const { data: biz } = useMyBusiness();
  const bid = biz?.id;
  const [q, setQ] = useState("");

  const { data: customers } = useQuery({
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
    <div className="p-6 md:p-10 max-w-6xl">
      <PageHeader title="Customers" subtitle="Everyone who's booked with you." />
      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search customers…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>
      <div className="rounded-2xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground bg-muted/40">
            <tr>
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Contact</th>
              <th className="px-5 py-3">Bookings</th>
              <th className="px-5 py-3">Joined</th>
            </tr>
          </thead>
          <tbody>
            {customers?.map((c: any) => (
              <tr key={c.id} className="border-t">
                <td className="px-5 py-3 font-medium">{c.name}</td>
                <td className="px-5 py-3 text-muted-foreground">{c.email || c.phone || "—"}</td>
                <td className="px-5 py-3">{c.bookings?.length ?? 0}</td>
                <td className="px-5 py-3 text-muted-foreground">{fmtDate(c.created_at)}</td>
              </tr>
            ))}
            {customers?.length === 0 && (
              <tr><td colSpan={4} className="px-5 py-12 text-center text-muted-foreground">No customers yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
