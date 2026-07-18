import { useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Calendar, LayoutDashboard, Scissors, Search, UserCircle, Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/lib/business";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";

const QUICK_LINKS = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "Calendar", to: "/calendar", icon: Calendar },
  { label: "Bookings", to: "/bookings", icon: Calendar },
  { label: "Customers", to: "/customers", icon: UserCircle },
  { label: "Staff", to: "/staff", icon: Users },
  { label: "Services", to: "/services", icon: Scissors },
] as const;

type SearchResults = {
  customers: { id: string; name: string; email: string | null; phone: string | null }[];
  services: { id: string; name: string; duration_minutes: number; price_cents: number }[];
};

export function GlobalSearch() {
  const router = useRouter();
  const { data: business } = useMyBusiness();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>({ customers: [], services: [] });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (!business?.id || term.length < 2) {
      setResults({ customers: [], services: [] });
      return;
    }
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      const [{ data: customers }, { data: services }] = await Promise.all([
        supabase
          .from("customers")
          .select("id, name, email, phone")
          .eq("business_id", business.id)
          .or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`)
          .order("name")
          .limit(6),
        supabase
          .from("services")
          .select("id, name, duration_minutes, price_cents")
          .eq("business_id", business.id)
          .eq("active", true)
          .ilike("name", `%${term}%`)
          .order("name")
          .limit(6),
      ]);
      if (!cancelled) setResults({ customers: customers ?? [], services: services ?? [] });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [business?.id, query]);

  const go = (to: string) => {
    setOpen(false);
    router.navigate({ to: to as any });
  };

  return (
    <>
      <Button variant="outline" className="w-full justify-start gap-2 h-9 text-xs" onClick={() => setOpen(true)}>
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">Search</span>
        <CommandShortcut>⌘K</CommandShortcut>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search customers, services or pages…" value={query} onValueChange={setQuery} />
        <CommandList>
          <CommandEmpty>No matches found.</CommandEmpty>
          {query.trim().length < 2 && (
            <CommandGroup heading="Quick links">
              {QUICK_LINKS.map(({ label, to, icon: Icon }) => (
                <CommandItem key={to} value={label} onSelect={() => go(to)}>
                  <Icon /> {label}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {results.customers.length > 0 && (
            <CommandGroup heading="Customers">
              {results.customers.map((customer) => (
                <CommandItem key={customer.id} value={`${customer.name} ${customer.email ?? ""} ${customer.phone ?? ""}`} onSelect={() => go("/customers")}>
                  <UserCircle />
                  <span className="min-w-0"><span className="block">{customer.name}</span><span className="block text-xs text-muted-foreground truncate">{customer.email ?? customer.phone ?? "Customer"}</span></span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {results.customers.length > 0 && results.services.length > 0 && <CommandSeparator />}
          {results.services.length > 0 && (
            <CommandGroup heading="Services">
              {results.services.map((service) => (
                <CommandItem key={service.id} value={service.name} onSelect={() => go("/services")}>
                  <Scissors />
                  <span className="min-w-0"><span className="block">{service.name}</span><span className="block text-xs text-muted-foreground">{service.duration_minutes} min</span></span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
