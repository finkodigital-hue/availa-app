import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Sparkles, Building2, Armchair, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { slugify } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/invite/$token")({
  component: InviteAcceptPage,
});

function InviteAcceptPage() {
  const { token } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: invite, isLoading, error } = useQuery({
    queryKey: ["invite", token],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_invitation_by_token", { _token: token });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      return {
        ...row,
        salon: {
          id: row.salon_business_id,
          name: row.salon_name,
          logo_url: row.salon_logo_url,
        },
      } as any;
    },
  });

  // Auth form state (used when the pro is not yet signed in)
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [busy, setBusy] = useState(false);

  if (isLoading || authLoading) {
    return <Centered><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></Centered>;
  }

  if (error || !invite) {
    return (
      <Centered>
        <div className="max-w-md text-center space-y-3">
          <h1 className="font-display text-3xl">This invitation is no longer valid.</h1>
          <p className="text-sm text-muted-foreground">
            The link may have expired or been revoked. Ask the salon owner to send a new one.
          </p>
          <Button asChild variant="outline"><Link to="/">Back home</Link></Button>
        </div>
      </Centered>
    );
  }

  const signInAndAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        if (!name.trim() || !businessName.trim()) {
          throw new Error("Fill in your name and business name");
        }
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            data: { full_name: name },
            emailRedirectTo: `${window.location.origin}/invite/${token}`,
          },
        });
        if (error) throw error;
        // If email confirmation is required, `data.user` may exist but session is null.
        // If session exists we proceed immediately; otherwise we still create the business
        // when they sign back in (they'll be redirected to /invite/:token again).
        if (data.session) {
          await createProAndLink(data.user!.id, businessName);
        } else {
          toast.success("Check your inbox to confirm your email, then return here.");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (error) throw error;
        // Existing user signing in — ask for a business name if they don't have one yet
        if (!businessName.trim()) {
          throw new Error("Enter a name for your business");
        }
        await createProAndLink(data.user!.id, businessName);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Could not accept invitation");
    } finally {
      setBusy(false);
    }
  };

  const acceptForExistingUser = async () => {
    if (!user) return;
    if (!businessName.trim()) return toast.error("Enter a name for your business");
    setBusy(true);
    try {
      await createProAndLink(user.id, businessName);
    } catch (e: any) {
      toast.error(e.message ?? "Could not accept invitation");
    } finally {
      setBusy(false);
    }
  };

  async function createProAndLink(userId: string, bizName: string) {
    // Check if this user already owns a business
    const { data: existing } = await supabase
      .from("businesses")
      .select("id")
      .eq("owner_id", userId)
      .maybeSingle();

    let proBusinessId = existing?.id as string | undefined;

    if (proBusinessId && proBusinessId === invite.salon?.id) {
      throw new Error("You already own this salon — it can't rent a chair from itself.");
    }

    if (!proBusinessId) {
      const finalSlug = `${slugify(bizName)}-${Math.random().toString(36).slice(2, 6)}`;
      const { data: newBiz, error: bizErr } = await supabase
        .from("businesses")
        .insert({
          owner_id: userId,
          name: bizName,
          slug: finalSlug,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        })
        .select("id")
        .single();
      if (bizErr) throw bizErr;
      proBusinessId = newBiz.id;

      // Default hours
      const hours = Array.from({ length: 7 }, (_, w) => ({
        business_id: proBusinessId!,
        weekday: w,
        open_time: w === 0 || w === 6 ? null : "09:00",
        close_time: w === 0 || w === 6 ? null : "17:00",
        closed: w === 0 || w === 6,
      }));
      await supabase.from("business_hours").insert(hours);
    }

    // Accept the invite via security-definer RPC (verifies token + ownership,
    // creates the salon<->pro link and marks the invitation accepted).
    const { error: acceptErr } = await (supabase as any).rpc("accept_professional_invitation", {
      _token: token,
      _pro_business_id: proBusinessId!,
    });
    if (acceptErr) throw acceptErr;

    toast.success("You're in! Welcome to Bookzenvo.");
    await qc.invalidateQueries();
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-background relative overflow-hidden py-10">
      <div className="absolute inset-0 mesh-bg pointer-events-none" />
      <div className="relative w-full max-w-md animate-rise">
        <div className="inline-flex items-center gap-2 text-xs text-muted-foreground rounded-full border bg-card/60 backdrop-blur px-3 py-1 mb-6">
          <Sparkles className="h-3 w-3 text-primary" /> You're invited
        </div>
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-xl bg-primary/10 grid place-items-center shrink-0">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-[0.18em]">
              {invite.salon?.name}
            </p>
          </div>
        </div>
        <h1 className="font-display text-3xl md:text-4xl tracking-tight text-balance">
          Join <span className="italic text-primary">{invite.salon?.name}</span> as an independent professional.
        </h1>
        <p className="text-sm text-muted-foreground mt-3 text-pretty">
          You'll run your own business inside Bookzenvo — your services, prices, customers and payments
          stay yours. You'll simply appear on the shared calendar and booking page.
        </p>
        {invite.message && (
          <div className="mt-4 rounded-xl border bg-card/60 p-3 text-sm text-pretty">
            "{invite.message}"
          </div>
        )}
        {(invite.chair_label || invite.rent_mode !== "none") && (
          <div className="mt-4 rounded-xl border bg-card/60 p-3.5 space-y-2">
            {invite.chair_label && (
              <div className="text-sm flex items-center gap-2">
                <Armchair className="h-3.5 w-3.5 text-primary shrink-0" />
                <span>{invite.chair_label}</span>
              </div>
            )}
            {invite.rent_mode !== "none" && (
              <div className="text-sm flex items-center gap-2">
                <Wallet className="h-3.5 w-3.5 text-primary shrink-0" />
                <span>{rentSummary(invite)}</span>
              </div>
            )}
          </div>
        )}

        {user ? (
          <div className="mt-8 space-y-4">
            <div className="rounded-xl border bg-card/60 p-3.5 text-sm flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 text-primary grid place-items-center font-display text-sm shrink-0">
                {(user.email ?? "?").charAt(0).toUpperCase()}
              </div>
              <span className="text-pretty">
                Signed in as <b>{user.email}</b>. Give your business a name to finish accepting.
              </span>
            </div>
            <div>
              <Label>Your business name</Label>
              <Input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Sarah Hair Studio"
                className="mt-1.5 h-11"
              />
            </div>
            <Button onClick={acceptForExistingUser} disabled={busy} className="w-full h-11">
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Accept invitation
            </Button>
          </div>
        ) : (
          <form onSubmit={signInAndAccept} className="mt-8 space-y-4">
            <div className="inline-flex w-full p-1 rounded-full bg-secondary text-xs">
              <button
                type="button"
                onClick={() => setMode("signup")}
                className={`flex-1 px-3 py-1.5 rounded-full transition-colors ${mode === "signup" ? "bg-foreground text-background shadow-soft" : "text-muted-foreground hover:text-foreground"}`}
              >
                Create account
              </button>
              <button
                type="button"
                onClick={() => setMode("signin")}
                className={`flex-1 px-3 py-1.5 rounded-full transition-colors ${mode === "signin" ? "bg-foreground text-background shadow-soft" : "text-muted-foreground hover:text-foreground"}`}
              >
                Already have a Bookzenvo account
              </button>
            </div>
            {mode === "signup" && (
              <div>
                <Label>Your name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 h-11" required />
              </div>
            )}
            <div>
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5 h-11" required />
            </div>
            <div>
              <Label>Password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5 h-11" required minLength={6} />
            </div>
            <div>
              <Label>Your business name</Label>
              <Input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Sarah Hair Studio"
                className="mt-1.5 h-11"
                required
              />
            </div>
            <Button type="submit" disabled={busy} className="w-full h-11">
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {mode === "signup" ? "Create account & accept" : "Sign in & accept"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

function rentSummary(l: { rent_mode: string; rent_amount_cents: number | null; commission_percent: number | null }) {
  const money = (c: number | null) => (c == null ? "—" : `$${(c / 100).toFixed(2)}`);
  switch (l.rent_mode) {
    case "weekly": return `${money(l.rent_amount_cents)} / week`;
    case "monthly": return `${money(l.rent_amount_cents)} / month`;
    case "percentage": return `${l.commission_percent ?? 0}% commission`;
    case "fixed_commission": return `${money(l.rent_amount_cents)} per booking`;
    default: return "None";
  }
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen grid place-items-center px-6">{children}</div>;
}
