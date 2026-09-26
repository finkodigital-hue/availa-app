import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useMyBusiness } from "@/lib/business";
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
  const { data: existingBusiness } = useMyBusiness();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [createdBusiness, setCreatedBusiness] = useState<{ id: string; name: string; slug: string } | null>(null);
  const workspace = createdBusiness ?? (existingBusiness?.owner_id === user?.id ? existingBusiness : null);

  useEffect(() => {
    if (workspace) {
      setName(workspace.name);
      setSlug(workspace.slug);
    }
  }, [workspace?.id]);

  const ensureHours = async (businessId: string) => {
    const { error: repairError } = await supabase.rpc("ensure_business_hours", { _business_id: businessId });
    if (repairError) throw repairError;
    const { data: verified, error: verifyError } = await supabase.from("business_hours")
      .select("weekday").eq("business_id", businessId);
    if (verifyError) throw verifyError;
    if (new Set((verified ?? []).map((row) => row.weekday)).size !== 7) {
      throw new Error("Opening hours could not be completed. Try again.");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      let current = workspace;
      if (!current) {
        // A prior attempt may have created the workspace before the page was reloaded.
        const { data: found, error: lookupError } = await supabase.from("businesses")
          .select("id, name, slug").eq("owner_id", user.id).maybeSingle();
        if (lookupError) throw lookupError;
        current = found;
      }
      if (!current) {
        const { data, error } = await supabase
          .from("businesses")
          .insert({
            owner_id: user.id,
            name,
            slug: slugify(slug || name),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          })
          .select("id, name, slug")
          .single();
        if (error) throw error;
        current = data;
      }
      setCreatedBusiness(current);
      await ensureHours(current.id);
      await qc.invalidateQueries({ queryKey: ["my-business"] });
      toast.success("Workspace is ready");
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      if (err.code === "23505" && !workspace && !createdBusiness) {
        toast.error("That booking page URL is already taken — try another.");
      } else {
        toast.error(err.message ?? "Could not finish workspace setup. Try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="workspace-theme min-h-screen flex items-center justify-center px-6 bg-background relative overflow-hidden">
      <div className="absolute inset-0 mesh-bg pointer-events-none" />
      <div className="relative w-full max-w-md animate-rise">
        <div className="inline-flex items-center gap-2 text-xs text-muted-foreground rounded-full border bg-card/60 backdrop-blur px-3 py-1 mb-6">
          <Sparkles className="h-3 w-3 text-primary" /> Step 1 of 1
        </div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tight text-balance">
          Name your <span className="italic text-primary">workspace</span>.
        </h1>
        <p className="text-sm text-muted-foreground mt-3 text-pretty">
          {workspace
            ? "Your workspace has been created. Finish checking its opening hours to continue."
            : "This is what customers will see on your booking page. Don't sweat it — you can change everything later."}
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
              disabled={!!workspace}
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
                disabled={!!workspace}
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
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Finishing…
              </>
            ) : (
              <>
                {workspace ? "Finish setup" : "Create workspace"} <ArrowRight className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
