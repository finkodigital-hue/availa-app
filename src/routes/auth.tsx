import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Loader2, Sparkles, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const search = z
  .object({ mode: z.enum(["signin", "signup", "reset", "update"]).optional() })
  .optional();

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
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user && mode !== "update") navigate({ to: "/dashboard", replace: true });
  }, [user, mode, navigate]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        navigate({ to: "/auth", search: { mode: "update" } });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

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
      } else if (mode === "update") {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        toast.success("Password updated.");
        navigate({ to: "/dashboard", replace: true });
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

  const heading =
    mode === "signup" ? "Create your workspace"
      : mode === "reset" ? "Reset password"
      : mode === "update" ? "Set new password"
      : "Welcome back";
  const sub =
    mode === "signup"
      ? "Start free. Set up in minutes."
      : mode === "reset"
        ? "We'll email you a secure link."
        : mode === "update"
          ? "Choose a new password for your account."
          : "Sign in to your dashboard.";
  const cta =
    mode === "signup" ? "Create account"
      : mode === "reset" ? "Send reset link"
      : mode === "update" ? "Update password"
      : "Sign in";

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-background">
      <div className="hidden md:flex relative overflow-hidden bg-foreground text-background">
        <div className="absolute inset-0 mesh-bg opacity-70 pointer-events-none" />
        <div className="absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-primary/30 blur-3xl animate-float" />
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <Link to="/" className="font-display text-2xl">
            Bookzenvo<span className="text-primary">.</span>
          </Link>

          <div className="max-w-md">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="font-display text-5xl mt-6 leading-tight text-balance">
              Your studio,
              <br />
              <span className="italic text-primary">at your fingertips.</span>
            </h2>
            <p className="text-sm mt-6 opacity-70 text-pretty">
              A booking platform crafted for service businesses that care
              about how things look — and how they feel.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs opacity-60">
            <div className="flex -space-x-2">
              {["bg-primary", "bg-chart-3", "bg-chart-2"].map((c, i) => (
                <div key={i} className={`h-7 w-7 rounded-full border-2 border-foreground ${c}`} />
              ))}
            </div>
            Trusted by 1,200+ studios worldwide
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-rise">
          <Link
            to="/"
            className="md:hidden font-display text-2xl mb-8 inline-block"
          >
            Bookzenvo<span className="text-primary">.</span>
          </Link>
          <h1 className="font-display text-3xl md:text-4xl tracking-tight">{heading}</h1>
          <p className="text-sm text-muted-foreground mt-2">{sub}</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            {mode === "signup" && (
              <div>
                <Label htmlFor="name" className="text-xs uppercase tracking-wide text-muted-foreground">
                  Your name
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Mia Tanaka"
                  className="mt-1.5 h-11"
                />
              </div>
            )}
            {mode !== "update" && (
              <div>
                <Label htmlFor="email" className="text-xs uppercase tracking-wide text-muted-foreground">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@studio.com"
                  className="mt-1.5 h-11"
                />
              </div>
            )}
            {(mode === "signin" || mode === "signup" || mode === "update") && (
              <div>
                <div className="flex items-baseline justify-between">
                  <Label htmlFor="password" className="text-xs uppercase tracking-wide text-muted-foreground">
                    {mode === "update" ? "New password" : "Password"}
                  </Label>
                  {mode === "signin" && (
                    <Link to="/auth" search={{ mode: "reset" }} className="text-xs text-muted-foreground hover:text-foreground">
                      Forgot?
                    </Link>
                  )}
                </div>
                <div className="relative mt-1.5">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={mode === "signup" || mode === "update" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="h-11 pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}
            <Button type="submit" className="w-full h-11 shadow-glow" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Please wait…
                </>
              ) : (
                cta
              )}
            </Button>
          </form>

          <p className="mt-6 text-xs text-muted-foreground text-center">
            {mode === "signin" && (
              <>
                New to Bookzenvo?{" "}
                <Link to="/auth" search={{ mode: "signup" }} className="text-foreground underline-offset-4 hover:underline">
                  Create an account
                </Link>
              </>
            )}
            {mode === "signup" && (
              <>
                Already have an account?{" "}
                <Link to="/auth" search={{ mode: "signin" }} className="text-foreground underline-offset-4 hover:underline">
                  Sign in
                </Link>
              </>
            )}
            {mode === "reset" && (
              <Link to="/auth" search={{ mode: "signin" }} className="hover:text-foreground">
                ← Back to sign in
              </Link>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
