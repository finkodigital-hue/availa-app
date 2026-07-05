import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Loader2, Sparkles, Eye, EyeOff, MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const search = z
  .object({ mode: z.enum(["signin", "signup", "reset"]).optional() })
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
  const [signupEmail, setSignupEmail] = useState<string | null>(null);

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
        setSignupEmail(email);
        setPassword("");
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
      const isUnconfirmed =
        err?.code === "email_not_confirmed" || /email not confirmed/i.test(err?.message ?? "");
      if (isUnconfirmed) {
        toast.error("Please verify your email first. Check your inbox for the link.");
      } else {
        toast.error(err.message ?? "Something went wrong");
      }
    } finally {
      setBusy(false);
    }
  };

  const heading =
    mode === "signup" ? "Create your workspace" : mode === "reset" ? "Reset password" : "Welcome back";
  const sub =
    mode === "signup"
      ? "Start free. Set up in minutes."
      : mode === "reset"
        ? "We'll email you a secure link."
        : "Sign in to your dashboard.";
  const cta =
    mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in";

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-background">
      {/* Editorial panel */}
      <div className="hidden md:flex relative overflow-hidden bg-foreground text-background">
        <div className="absolute inset-0 mesh-bg opacity-70 pointer-events-none" />
        <div className="absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-primary/30 blur-3xl animate-float" />
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <Link to="/" className="font-display text-2xl">
            Chairly<span className="text-primary">.</span>
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

      {/* Form */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-rise">
          <Link
            to="/"
            className="md:hidden font-display text-2xl mb-8 inline-block"
          >
            Chairly<span className="text-primary">.</span>
          </Link>

          {signupEmail ? (
            <div className="animate-rise">
              <div className="h-14 w-14 rounded-full bg-primary/10 text-primary grid place-items-center mb-6">
                <MailCheck className="h-7 w-7" />
              </div>
              <h1 className="font-display text-3xl md:text-4xl tracking-tight">Check your email</h1>
              <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
                Your account is set up. We've sent a verification link to:
              </p>
              <div className="mt-3 rounded-xl border border-border bg-muted px-4 py-3 text-sm font-semibold text-foreground break-all">
                {signupEmail}
              </div>
              <p className="text-sm text-muted-foreground mt-4 leading-relaxed">
                Click the link in that email to verify your account, then come back here to sign in.
                Didn't get it? Check your spam folder.
              </p>
              <Button asChild className="w-full h-11 shadow-glow mt-8">
                <Link to="/auth" search={{ mode: "signin" }} onClick={() => setSignupEmail(null)}>
                  Back to sign in
                </Link>
              </Button>
            </div>
          ) : (
          <>
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
            {mode !== "reset" && (
              <div>
                <div className="flex items-baseline justify-between">
                  <Label htmlFor="password" className="text-xs uppercase tracking-wide text-muted-foreground">
                    Password
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
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
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
                New to Chairly?{" "}
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
          </>
          )}
        </div>
      </div>
    </div>
  );
}
