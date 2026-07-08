import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
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
      if (err.code === "23505") {
        toast.error("That booking page URL is already taken — try another.");
      } else {
        toast.error(err.message ?? "Could not create workspace");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-background relative overflow-hidden">
      <div className="absolute inset-0 mesh-bg pointer-events-none" />
      <div className="relative w-full max-w-md animate-rise">
        <div className="inline-flex items-center gap-2 text-xs text-muted-foreground rounded-full border bg-card/60 backdrop-blur px-3 py-1 mb-6">
          <Sparkles className="h-3 w-3 text-primary" /> Step 1 of 1
        </div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tight text-balance">
          Name your <span className="italic text-primary">workspace</span>.
        </h1>
        <p className="text-sm text-muted-foreground mt-3 text-pretty">
          This is what customers will see on your booking page. Don't sweat
          it — you can change everything later.
        </p>
        <form onSubmit={submit} className="mt-8 space-y-5">
          <div>
            <Label htmlFor="name" className="text-xs uppercase tracking-wide text-muted-foreground">
              Business name
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slug) setSlug(slugify(e.target.value));
              }}
              required
              autoFocus
              className="mt-1.5 h-11"
              placeholder="Maison Coiffure"
            />
          </div>
          <div>
            <Label htmlFor="slug" className="text-xs uppercase tracking-wide text-muted-foreground">
              Booking page URL
            </Label>
            <div className="mt-1.5 flex items-center rounded-xl border bg-card overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background transition-shadow">
              <span className="px-3 text-sm text-muted-foreground border-r select-none">
                /book/
              </span>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(slugify(e.target.value))}
                required
                className="border-0 focus-visible:ring-0 h-11"
                placeholder="maison-coiffure"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Lowercase letters, numbers and hyphens only.
            </p>
          </div>
          <Button type="submit" className="w-full h-11 shadow-glow" disabled={busy || !name}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating…
              </>
            ) : (
              <>
                Create workspace <ArrowRight className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
