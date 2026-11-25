import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { getServerFnAuthHeaders } from "@/lib/server-fn-auth";
import {
  cancelMyAccountDeletionRequest,
  getMyAccountDeletionRequest,
  requestMyAccountDeletion,
} from "@/lib/account-deletion.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MfaChallengeGate } from "@/components/mfa-challenge-gate";

function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "We couldn't confirm that change. Please try again.";
}
function date(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function AccountDataPage() {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <main className="p-6" role="status">
        Loading your account…
      </main>
    );
  if (!user)
    return (
      <main className="mx-auto max-w-xl space-y-4 p-6">
        <h1 className="font-display text-2xl">Account &amp; data</h1>
        <p>Sign in to view or request deletion of your account.</p>
        <Button asChild>
          <a href="/auth">Sign in</a>
        </Button>
      </main>
    );
  return (
    <SignedInAccountData
      key={user.id}
      userId={user.id}
      email={user.email ?? ""}
    />
  );
}

function SignedInAccountData({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  const qc = useQueryClient();
  const queryKey = ["account-deletion-request", userId];
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const actionLock = useRef(false);
  const requestKey = useRef<string | null>(null);
  const query = useQuery({
    queryKey,
    queryFn: async () =>
      getMyAccountDeletionRequest({ headers: await getServerFnAuthHeaders() }),
    retry: false,
    staleTime: 30_000,
  });
  const request = query.data;
  const active =
    request?.status === "requested" || request?.status === "in_review";

  const act = async (kind: "request" | "cancel") => {
    if (actionLock.current) return;
    if (kind === "request" && confirmation !== "DELETE") return;
    if (kind === "cancel" && request?.status !== "requested") return;
    actionLock.current = true;
    setBusy(true);
    setActionError(null);
    try {
      const headers = await getServerFnAuthHeaders();
      if (kind === "request") requestKey.current ??= crypto.randomUUID();
      const result =
        kind === "request"
          ? await requestMyAccountDeletion({
              headers,
              data: { confirmation: "DELETE", requestKey: requestKey.current! },
            })
          : await cancelMyAccountDeletionRequest({
              headers,
              data: { requestId: request!.id },
            });
      qc.setQueryData(queryKey, result);
      setConfirmation("");
      requestKey.current = null;
      await qc.invalidateQueries({ queryKey });
    } catch (error) {
      setActionError(message(error));
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };
  const signOut = async () => {
    if (actionLock.current) return;
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      setActionError(message(error));
    }
  };

  if (
    /two-factor verification required/i.test(
      actionError ?? query.error?.message ?? "",
    )
  ) {
    return (
      <MfaChallengeGate
        onVerified={() => {
          setActionError(null);
          void query.refetch();
        }}
      />
    );
  }
  return (
    <main className="workspace-theme mx-auto min-h-screen max-w-2xl space-y-6 px-5 py-8 sm:px-8">
      <nav
        aria-label="Account navigation"
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <a href="/dashboard" className="text-sm underline">
          Back to workspace
        </a>
        <Button variant="outline" onClick={signOut} disabled={busy}>
          Sign out
        </Button>
      </nav>
      <header>
        <h1 className="font-display text-3xl">Account &amp; data</h1>
        <p className="mt-2 break-words text-sm text-muted-foreground">
          {email}
        </p>
      </header>
      <section
        className="space-y-4 rounded-2xl border p-5"
        aria-labelledby="deletion-title"
      >
        <h2 id="deletion-title" className="font-display text-xl">
          Delete your Bookzenvo account
        </h2>
        <p className="text-sm">
          Request deletion of your sign-in account, profile and associated
          personal data. This is available whether you own a workspace, work for
          a business or have not finished setup.
        </p>
        <p className="text-sm text-muted-foreground">
          We review requests manually and aim to complete them within 27 days.
          We will confirm completion by email. If required records or other
          retention obligations affect the timing, we will explain what must be
          kept and why.
        </p>
        <p className="text-sm text-muted-foreground">
          Submitting a request does not immediately close a workspace or stop a
          subscription. We will review any workspaces and subscriptions you own
          as part of the request. Business payment records and records belonging
          to other people may need to be retained. You can continue using your
          account while the request is awaiting review.
        </p>
        {query.isPending && <p role="status">Loading request status…</p>}
        {query.isError && (
          <div role="alert" className="space-y-3">
            <p>We couldn't load your account request. {message(query.error)}</p>
            <Button
              variant="outline"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
            >
              Try again
            </Button>
          </div>
        )}
        {query.isSuccess && request && (
          <div className="space-y-2 rounded-xl bg-secondary p-4" role="status">
            <p className="font-medium">
              {
                {
                  requested: "Deletion requested",
                  in_review: "Deletion request under review",
                  cancelled: "Deletion request cancelled",
                  completed: "Deletion completed",
                }[request.status]
              }
            </p>
            <p className="text-sm">Requested {date(request.requested_at)}.</p>
            {active && (
              <p className="text-sm">
                Target completion: {date(request.completion_target_at)}. This is
                our operational target, not an automatic deletion date or the
                legal response deadline.
              </p>
            )}
            {request.status_message && (
              <p className="text-sm whitespace-pre-wrap">
                {request.status_message}
              </p>
            )}
            {request.retained_data_summary && (
              <p className="text-sm whitespace-pre-wrap">
                Records retained: {request.retained_data_summary}
              </p>
            )}
            {request.status === "requested" && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void act("cancel")}
              >
                Cancel deletion request
              </Button>
            )}
            {request.status === "in_review" && (
              <p className="text-sm">
                Processing has started. If you need to change your request,{" "}
                <a
                  className="underline"
                  href="mailto:help@bookzenvo.com?subject=Account%20deletion%20request"
                >
                  contact support
                </a>
                .
              </p>
            )}
          </div>
        )}
        {query.isSuccess && !active && request?.status !== "completed" && (
          <form
            className="space-y-3 border-t pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              void act("request");
            }}
          >
            <p className="text-sm">
              Sign in again before submitting if your last sign-in was more than
              10 minutes ago. Your existing two-factor protection still applies.
            </p>
            <Label htmlFor="delete-confirmation">
              Type DELETE to confirm your request
            </Label>
            <Input
              id="delete-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              disabled={busy}
            />
            <Button
              type="submit"
              variant="destructive"
              disabled={busy || confirmation !== "DELETE"}
            >
              {busy ? "Submitting…" : "Request account deletion"}
            </Button>
          </form>
        )}
        {actionError && (
          <p role="alert" className="text-sm text-destructive">
            {actionError}
          </p>
        )}
      </section>
    </main>
  );
}
