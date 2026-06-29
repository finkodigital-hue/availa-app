import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const search = z.object({
  mode: z.enum(["signin", "signup", "reset"]).optional(),
}).optional();

export const Route = createFileRoute("/auth")({
  validateSearch: (s) => search.parse(s) ?? {},
  component: AuthPage,
});

function AuthPage() {
  const { mode = "signin" } = Route.useSearch();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) navigate({ to: "/dashboard", replace: true });
  }, [user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        toast.success("Account created. Welcome!");
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth`,
        });
        if (error) throw error;
        toast.success("Password reset email sent.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      toast.error(err.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-background">
      <div className="hidden md:flex items-end p-12 bg-secondary text-secondary-foreground">
        <div>
          <Link to="/" className="font-display text-2xl">Atelier<span className="text-primary">.</span></Link>
          <h2 className="font-display text-5xl mt-12 leading-tight">
            Your studio,<br /><span className="italic text-primary">at your fingertips.</span>
          </h2>
          <p className="text-sm mt-6 opacity-80 max-w-sm">
            A booking platform crafted for premium service businesses.
          </p>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Link to="/" className="md:hidden font-display text-2xl mb-8 inline-block">Atelier<span className="text-primary">.</span></Link>
          <h1 className="font-display text-3xl">
            {mode === "signup" ? "Create your workspace" : mode === "reset" ? "Reset password" : "Welcome back"}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            {mode === "signup" ? "Start free, set up in minutes." : mode === "reset" ? "We'll email you a link." : "Sign in to your dashboard."}
          </p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            {mode === "signup" && (
              <div>
                <Label htmlFor="name">Your name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required className="mt-1.5" />
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1.5" />
            </div>
            {mode !== "reset" && (
              <div>
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="mt-1.5" />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Please wait…" : mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}
            </Button>
          </form>
          <div className="mt-6 text-sm text-muted-foreground flex flex-col gap-2">
            {mode === "signin" && (
              <>
                <Link to="/auth" search={{ mode: "signup" }} className="hover:text-foreground">No account? <span className="text-foreground underline-offset-4 hover:underline">Sign up</span></Link>
                <Link to="/auth" search={{ mode: "reset" }} className="hover:text-foreground">Forgot password?</Link>
              </>
            )}
            {mode === "signup" && (
              <Link to="/auth" search={{ mode: "signin" }} className="hover:text-foreground">Have an account? <span className="text-foreground underline-offset-4 hover:underline">Sign in</span></Link>
            )}
            {mode === "reset" && (
              <Link to="/auth" search={{ mode: "signin" }} className="hover:text-foreground">Back to sign in</Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
