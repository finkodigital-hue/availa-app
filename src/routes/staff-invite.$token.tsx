import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/staff-invite/$token")({ component: StaffInvitePage });

function StaffInvitePage() {
  const { token } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [busy, setBusy] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const { data: invite, isLoading } = useQuery({
    queryKey: ["staff-invite", token],
    queryFn: async () => { const { data, error } = await (supabase.rpc as any)("get_staff_account_invitation", { _token: token }); if (error) throw error; return data?.[0] ?? null; },
  });
  const accept = async () => {
    setBusy(true);
    try {
      if (!user) {
        const result = mode === "signup"
          ? await supabase.auth.signUp({ email: email.trim().toLowerCase(), password, options: { emailRedirectTo: window.location.href } })
          : await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
        if (result.error) throw result.error;
        if (!result.data.session) { toast.success("Check your email to confirm your account, then return to this link"); return; }
      }
      const { error } = await (supabase.rpc as any)("accept_staff_account_invitation_with_terms", { p_token: token, p_terms_version: "2026-09-26" });
      if (error) throw error;
      await Promise.all([qc.invalidateQueries({ queryKey: ["my-business"] }), qc.invalidateQueries({ queryKey: ["workspace-access"] })]);
      toast.success("Welcome to the team");
      navigate({ to: "/dashboard", replace: true });
    } catch (e: any) { toast.error(e.message ?? "Could not accept invitation"); } finally { setBusy(false); }
  };
  if (isLoading) return <div className="min-h-screen grid place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!invite) return <div className="min-h-screen grid place-items-center p-6"><div className="max-w-sm text-center"><h1 className="font-display text-3xl">Invitation unavailable</h1><p className="mt-2 text-sm text-muted-foreground">This link has expired, was revoked, or has already been used. Ask the salon owner for a new one.</p></div></div>;
  return <div className="min-h-screen grid place-items-center bg-secondary/30 p-5"><div className="w-full max-w-md rounded-2xl border bg-background p-6 shadow-soft">
    <div className="mb-5 grid h-11 w-11 place-items-center rounded-xl bg-primary/10"><ShieldCheck className="h-5 w-5 text-primary" /></div>
    <p className="text-xs uppercase tracking-widest text-primary">Team invitation</p><h1 className="mt-2 font-display text-3xl">Join {invite.business_name}</h1>
    <p className="mt-2 text-sm text-muted-foreground">You’ve been invited as {invite.staff_name} with <b>{String(invite.access_role).replace("_", " ")}</b> access.</p>
    {!user ? <div className="mt-6 space-y-4"><div><Label>Email</Label><Input className="mt-1.5" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div><div><Label>Password</Label><Input className="mt-1.5" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></div><button className="text-xs text-primary hover:underline" onClick={() => setMode(mode === "signup" ? "signin" : "signup")}>{mode === "signup" ? "Already have an account? Sign in" : "New to Bookzenvo? Create an account"}</button></div> : <p className="mt-5 text-sm text-muted-foreground">Signed in as <b>{user.email}</b>. The invitation will only be accepted if this is the invited address.</p>}
    <label className="mt-5 flex items-start gap-2 text-sm"><input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} className="mt-1" /><span>I agree to the <Link to="/terms" target="_blank" className="underline">Bookzenvo Terms</Link> and acknowledge the <Link to="/privacy" target="_blank" className="underline">Privacy Policy</Link> (version 26 September 2026).</span></label>
    <Button className="mt-6 w-full" onClick={accept} disabled={busy || !termsAccepted || (!user && (password.length < 8 || !email.trim()))}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{user ? "Accept invitation" : mode === "signup" ? "Create account and join" : "Sign in and join"}</Button>
  </div></div>;
}
