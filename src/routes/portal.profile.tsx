import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, User as UserIcon, Mail, Phone, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/profile")({
  component: Profile,
});

function Profile() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => { if (!loading && !user) navigate({ to: "/portal", replace: true }); }, [loading, user, navigate]);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["portal-customer-records", user?.email],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, business_id, name, email, phone, businesses(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const primary = rows?.[0];
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (primary) { setName(primary.name ?? ""); setPhone(primary.phone ?? ""); }
  }, [primary?.id]);

  const update = useMutation({
    mutationFn: async () => {
      if (!rows || rows.length === 0) return;
      // Update every customer record this email owns across businesses
      const { error } = await supabase
        .from("customers")
        .update({ name: name.trim(), phone: phone.trim() || null })
        .in("id", rows.map((r) => r.id));
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Details updated"); qc.invalidateQueries({ queryKey: ["portal-customer-records"] }); },
    onError: (e: any) => toast.error(e.message ?? "Could not update"),
  });

  if (loading || !user) return null;

  return (
    <div className="animate-rise max-w-2xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl sm:text-4xl">Your profile</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Update the name and phone number businesses see when you book.
        </p>
      </div>

      <div className="rounded-2xl border bg-card p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 rounded-full px-3 py-1.5 w-fit">
          <ShieldCheck className="h-3.5 w-3.5" />
          Email verified — {user.email}
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : !primary ? (
          <p className="text-sm text-muted-foreground">
            You don't have any saved details yet — they'll appear here after your first booking.
          </p>
        ) : (
          <form
            onSubmit={(e) => { e.preventDefault(); update.mutate(); }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="name">Full name</Label>
              <div className="relative">
                <UserIcon className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input id="name" className="pl-9" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input id="email" className="pl-9" value={user.email ?? ""} disabled />
              </div>
              <p className="text-xs text-muted-foreground">Email is locked to your verified sign-in address.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <div className="relative">
                <Phone className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input id="phone" type="tel" className="pl-9" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
              </div>
            </div>

            <div className="pt-2">
              <Button type="submit" disabled={update.isPending}>
                {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
              </Button>
            </div>

            {rows && rows.length > 1 && (
              <p className="text-xs text-muted-foreground pt-2 border-t">
                Saving updates your details across {rows.length} businesses you've booked with.
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
