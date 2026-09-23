import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export type ConsultationCustomer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

export function ConsultationCustomerPicker({
  onSelect,
}: {
  onSelect: (customer: ConsultationCustomer) => void;
}) {
  const { data: business } = useMyBusiness();
  const [search, setSearch] = useState("");
  const term = search
    .trim()
    .replace(/[%_\\]/g, "")
    .slice(0, 80);
  const query = useQuery({
    queryKey: ["consultation-customer-search", business?.id, term],
    enabled: !!business?.id && term.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id,name,email,phone")
        .eq("business_id", business!.id)
        .ilike("name", `%${term}%`)
        .order("name")
        .limit(8);
      if (error) throw error;
      return data as ConsultationCustomer[];
    },
  });
  return (
    <div className="space-y-2">
      <Label htmlFor="consultation-customer-search">
        Use an existing customer (optional)
      </Label>
      <Input
        id="consultation-customer-search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search by name"
        autoComplete="off"
      />
      {term.length >= 2 && (
        <div
          className="max-h-36 overflow-y-auto rounded-lg border"
          aria-live="polite"
        >
          {query.isLoading ? (
            <p className="p-3 text-sm text-muted-foreground">
              Looking for customers…
            </p>
          ) : query.isError ? (
            <p className="p-3 text-sm text-destructive">
              Search unavailable. You can enter details below.
            </p>
          ) : query.data?.length ? (
            query.data.map((customer) => (
              <Button
                key={customer.id}
                type="button"
                variant="ghost"
                className="h-auto w-full justify-start whitespace-normal p-3 text-left"
                onClick={() => {
                  onSelect(customer);
                  setSearch("");
                }}
              >
                <span>
                  <span className="block">{customer.name}</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {customer.email ||
                      customer.phone ||
                      "No contact details saved"}
                  </span>
                </span>
              </Button>
            ))
          ) : (
            <p className="p-3 text-sm text-muted-foreground">
              No matches. Enter a new customer's details below.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
