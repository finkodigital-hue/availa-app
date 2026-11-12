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
    const accept = (nextSession: Session | null) => {
      if (!active) return;
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
    };
    const { data: sub } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!active || (event === "INITIAL_SESSION" && sawLiveEvent)) return;
        sawEvent = true;
        if (event !== "INITIAL_SESSION") sawLiveEvent = true;
        // Do not await Supabase calls inside its auth callback.
        accept(nextSession);
      },
    );
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!sawEvent) accept(data.session);
      })
      .catch(() => {
        if (!sawEvent) accept(null);
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
