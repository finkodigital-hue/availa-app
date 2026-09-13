import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { AlertCircle, Loader2, Sparkles, Eye, EyeOff, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const search = z
  .object({ mode: z.enum(["signin", "signup", "reset", "update"]).optional() })
  .optional();

type AuthMode = "signin" | "signup" | "reset" | "update";

function friendlyAuthError(error: unknown, mode: AuthMode) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String(error.message)
        : "";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("invalid login credentials") ||
    normalized.includes("invalid credentials")
  ) {
    return "We couldn't sign you in. Check your email and password, then try again.";
  }
  if (normalized.includes("email not confirmed")) {
    return "Please verify your email before signing in. Check your inbox for the confirmation link.";
  }
  if (
    normalized.includes("rate limit") ||
    normalized.includes("too many requests") ||
    normalized.includes("over_email_send_rate_limit")
  ) {
    return "You've tried a few times in a row. Please wait a minute before trying again.";
  }
  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("fetch failed") ||
    normalized.includes("network") ||
    normalized.includes("econnrefused")
  ) {
    return "We can't reach Bookzenvo's sign-in service right now. Please wait a moment and try again.";
  }
  if (
    normalized.includes("invalid email") ||
    normalized.includes("invalid_email")
  ) {
    return "Enter a valid email address, such as name@example.com.";
  }
  if (
    normalized.includes("password") &&
    (normalized.includes("weak") || normalized.includes("least"))
  ) {
    return "Choose a password with at least 6 characters.";
  }

  if (mode === "reset") {
    return "We couldn't send the reset link. Check your email address and try again.";
  }
  if (mode === "update") {
    return "We couldn't update your password. Please try again.";
  }
  if (mode === "signup") {
    return "We couldn't add you to the waitlist. Please try again.";
  }
  return "We couldn't sign you in right now. Please try again.";
}

export const Route = createFileRoute("/auth")({
  validateSearch: (s) => search.parse(s) ?? {},
  head: () => ({
    meta: [
      { title: "Sign in — Bookzenvo" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
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
  const [formError, setFormError] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  // Public self-signup is paused pre-launch — mode=signup shows a waitlist
  // form instead of creating a real account (see submit() below). Existing
  // accounts are unaffected; signin/reset/update all still work as normal.
  const [waitlistDone, setWaitlistDone] = useState(false);

  useEffect(() => {
    setWaitlistDone(false);
    setFormError("");
  }, [mode]);

  useEffect(() => {
    if (user && mode !== "update")
      navigate({ to: "/dashboard", replace: true });
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
    setFormError("");
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.rpc("join_waitlist", {
          p_email: email,
          p_note: name || null,
        });
        if (error) {
          if (error.message?.includes("ALREADY_ON_LIST")) {
            toast.success(
              "You're already on the waitlist — we'll be in touch.",
            );
            setWaitlistDone(true);
            return;
          }
          throw error;
        }
        toast.success("You're on the list!");
        setWaitlistDone(true);
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          // The recovery session can already be active when the page opens. Include
          // the mode in the redirect itself so we always show the new-password form.
          redirectTo: `${window.location.origin}/auth?mode=update`,
        });
        if (error) throw error;
        toast.success("Password reset email sent.");
      } else if (mode === "update") {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        toast.success("Password updated.");
        navigate({ to: "/dashboard", replace: true });
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        if (!data.session)
          throw new Error(
            "Your sign-in could not be completed. Please try again.",
          );

        // Do not rely solely on the AuthProvider listener to move the user
        // away from this page. The session is already persisted by
        // supabase-js at this point, so navigating explicitly makes a
        // successful sign-in deterministic even if the auth-state event is
        // delivered after the form handler finishes.
        navigate({ to: "/dashboard", replace: true });
      }
    } catch (err: unknown) {
      setFormError(friendlyAuthError(err, mode));
    } finally {
      setBusy(false);
    }
  };

  const heading =
    mode === "signup"
      ? "Join the waitlist"
      : mode === "reset"
        ? "Reset password"
        : mode === "update"
          ? "Set new password"
          : "Welcome back";
  const sub =
    mode === "signup"
      ? "We're onboarding studios one at a time — pop your email in and we'll be in touch."
      : mode === "reset"
        ? "We'll email you a secure link."
        : mode === "update"
          ? "Choose a new password for your account."
          : "Sign in to your dashboard.";
  const cta =
    mode === "signup"
      ? "Join waitlist"
      : mode === "reset"
        ? "Send reset link"
        : mode === "update"
          ? "Update password"
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
              A booking platform crafted for service businesses that care about
              how things look — and how they feel.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs opacity-60">
            <Sparkles className="h-4 w-4" />
            Now onboarding the first studios
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
          <h1 className="font-display text-3xl md:text-4xl tracking-tight">
            {heading}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">{sub}</p>

          {mode === "signup" && waitlistDone ? (
            <div className="mt-8 rounded-xl border bg-card p-5 animate-rise">
              <p className="text-sm">
                You're on the list — we'll email you as soon as it's your turn.
              </p>
              <Link
                to="/auth"
                search={{ mode: "signin" }}
                className="text-sm font-medium text-foreground underline-offset-4 hover:underline mt-3 inline-block"
              >
                Already have an account? Sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-8 space-y-4">
              {mode === "signup" && (
                <div>
                  <Label
                    htmlFor="name"
                    className="text-xs uppercase tracking-wide text-muted-foreground"
                  >
                    Your business (optional)
                  </Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Maison Coiffure"
                    className="mt-1.5 h-11"
                  />
                </div>
              )}
              {mode !== "update" && (
                <div>
                  <Label
                    htmlFor="email"
                    className="text-xs uppercase tracking-wide text-muted-foreground"
                  >
                    Email
                  </Label>
                  <div className="relative mt-1.5">
                    <Input
                      ref={emailRef}
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setFormError("");
                      }}
                      required
                      placeholder="you@studio.com"
                      className="h-11 pr-10"
                    />
                    {email && (
                      <button
                        type="button"
                        onClick={() => {
                          setEmail("");
                          setFormError("");
                          emailRef.current?.focus();
                        }}
                        aria-label="Clear email address"
                        className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              )}
              {(mode === "signin" || mode === "update") && (
                <div>
                  <div className="flex items-baseline justify-between">
                    <Label
                      htmlFor="password"
                      className="text-xs uppercase tracking-wide text-muted-foreground"
                    >
                      {mode === "update" ? "New password" : "Password"}
                    </Label>
                    {mode === "signin" && (
                      <Link
                        to="/auth"
                        search={{ mode: "reset" }}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Forgot?
                      </Link>
                    )}
                  </div>
                  <div className="relative mt-1.5">
                    <Input
                      ref={passwordRef}
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={
                        mode === "update" ? "new-password" : "current-password"
                      }
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setFormError("");
                      }}
                      required
                      minLength={6}
                      className="h-11 pr-20"
                    />
                    {password && (
                      <button
                        type="button"
                        onClick={() => {
                          setPassword("");
                          setShowPassword(false);
                          setFormError("");
                          passwordRef.current?.focus();
                        }}
                        aria-label="Clear password"
                        className="absolute right-10 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              )}
              {formError && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="flex items-start gap-3 rounded-lg border border-destructive/25 bg-destructive/5 px-3.5 py-3 text-sm leading-5 text-foreground"
                >
                  <AlertCircle
                    className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                    aria-hidden="true"
                  />
                  <p>{formError}</p>
                </div>
              )}
              <Button
                type="submit"
                className="w-full h-11 shadow-glow"
                disabled={busy}
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Please
                    wait…
                  </>
                ) : (
                  cta
                )}
              </Button>
              {mode === "signup" && (
                <p className="text-xs leading-5 text-muted-foreground text-center">
                  By joining, you ask us to contact you about Bookzenvo and
                  acknowledge our{" "}
                  <Link
                    to="/privacy"
                    className="text-foreground underline underline-offset-4"
                  >
                    Privacy Policy
                  </Link>
                  . This is not consent to unrelated marketing.
                </p>
              )}
            </form>
          )}

          {!(mode === "signup" && waitlistDone) && (
            <p className="mt-6 text-xs text-muted-foreground text-center">
              {mode === "signin" && (
                <>
                  New to Bookzenvo?{" "}
                  <Link
                    to="/auth"
                    search={{ mode: "signup" }}
                    className="text-foreground underline-offset-4 hover:underline"
                  >
                    Join the waitlist
                  </Link>
                </>
              )}
              {mode === "signup" && (
                <>
                  Already have an account?{" "}
                  <Link
                    to="/auth"
                    search={{ mode: "signin" }}
                    className="text-foreground underline-offset-4 hover:underline"
                  >
                    Sign in
                  </Link>
                </>
              )}
              {mode === "reset" && (
                <Link
                  to="/auth"
                  search={{ mode: "signin" }}
                  className="hover:text-foreground"
                >
                  ← Back to sign in
                </Link>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
