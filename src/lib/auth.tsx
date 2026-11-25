import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isCurrentBrowserAuthSession } from "@/lib/auth-session-storage";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  session: null,
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const rootQueryClient = useQueryClient();
  const [initialClient] = useState(
    () =>
      new QueryClient({ defaultOptions: rootQueryClient.getDefaultOptions() }),
  );
  const [{ session, loading, queryClient, identityEpoch }, setAuth] = useState({
    session: null as Session | null,
    loading: true,
    queryClient: initialClient,
    identityEpoch: 0,
  });

  useEffect(() => {
    let active = true;
    let sawEvent = false;
    let sawLiveEvent = false;
    let identity: string | null | undefined;
    let currentClient = initialClient;
    let epoch = 0;
    const retire = (client: QueryClient) => {
      void client.cancelQueries().catch(() => {});
      client.clear();
    };
    const accept = (nextSession: Session | null, failedInitialRead = false) => {
      // SDK notifications can arrive after another tab/native commit. Neither
      // stale sign-in nor stale sign-out may replace the committed identity.
      if (
        !active ||
        (!isCurrentBrowserAuthSession(nextSession) &&
          !(failedInitialRead && nextSession === null))
      )
        return false;
      const nextIdentity = nextSession?.user.id ?? null;
      if (identity !== nextIdentity) {
        retire(currentClient);
        // Late mutation callbacks retain their old client. They must never be
        // able to populate the next person's cache, even after clear().
        currentClient = new QueryClient({
          defaultOptions: rootQueryClient.getDefaultOptions(),
        });
        identity = nextIdentity;
        epoch += 1;
      }
      setAuth({
        session: nextSession,
        loading: false,
        queryClient: currentClient,
        identityEpoch: epoch,
      });
      return true;
    };
    const { data: sub } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!active || (event === "INITIAL_SESSION" && sawLiveEvent)) return;
        // Do not await Supabase calls inside its auth callback.
        if (accept(nextSession)) {
          sawEvent = true;
          if (event !== "INITIAL_SESSION") sawLiveEvent = true;
        }
      },
    );
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!sawEvent && !accept(data.session)) accept(null, true);
      })
      .catch(() => {
        // Block private content but finish loading when storage/provider is
        // unavailable. Only initial failure can bypass equality, only to null.
        if (!sawEvent) accept(null, true);
      });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
      retire(currentClient);
    };
  }, [initialClient, rootQueryClient]);

  return (
    <Ctx.Provider value={{ user: session?.user ?? null, session, loading }}>
      {/* All application queries use this identity-scoped client; the router's
          outer client supplies defaults only. Remount drafts/local state too. */}
      <QueryClientProvider client={queryClient}>
        <Fragment key={identityEpoch}>{children}</Fragment>
      </QueryClientProvider>
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
