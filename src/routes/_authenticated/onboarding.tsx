import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { slugify } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: Onboarding,
});

function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      const finalSlug = slugify(slug || name);
      const { data, error } = await supabase
        .from("businesses")
        .insert({
          owner_id: user.id,
          name,
          slug: finalSlug,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        })
        .select()
        .single();
      if (error) throw error;
      // Seed default business hours Mon–Fri 9-5
      const hours = Array.from({ length: 7 }, (_, w) => ({
        business_id: data.id,
        weekday: w,
        open_time: w === 0 || w === 6 ? null : "09:00",
        close_time: w === 0 || w === 6 ? null : "17:00",
        closed: w === 0 || w === 6,
      }));
      await supabase.from("business_hours").insert(hours);
      await qc.invalidateQueries({ queryKey: ["my-business"] });
      toast.success("Workspace created");
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err.message ?? "Could not create workspace");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-background">
      <div className="w-full max-w-md">
        <h1 className="font-display text-4xl">Name your workspace</h1>
        <p className="text-sm text-muted-foreground mt-2">This is the name customers will see on your booking page.</p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <Label htmlFor="name">Business name</Label>
            <Input id="name" value={name} onChange={(e) => { setName(e.target.value); if (!slug) setSlug(slugify(e.target.value)); }} required className="mt-1.5" placeholder="Maison Coiffure" />
          </div>
          <div>
            <Label htmlFor="slug">Booking page URL</Label>
            <div className="mt-1.5 flex items-center rounded-xl border bg-card overflow-hidden">
              <span className="px-3 text-sm text-muted-foreground border-r">/book/</span>
              <Input id="slug" value={slug} onChange={(e) => setSlug(slugify(e.target.value))} required className="border-0 focus-visible:ring-0" />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={busy || !name}>
            {busy ? "Creating…" : "Create workspace"}
          </Button>
        </form>
      </div>
    </div>
  );
}
