-- Removing the Lovable integration (PR #68) also removed its error reporting,
-- leaving production with no visibility into client-side crashes at all. This
-- is the minimal replacement: uncaught browser errors are POSTed to
-- /api/client-errors (which rate-limits and inserts via the service role) and
-- land here, readable in the Supabase dashboard. No third-party vendor.
--
-- Table is service-role only: no anon/authenticated grants, RLS on with no
-- policies, same lockdown pattern as the waitlist table.

CREATE TABLE public.client_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message TEXT NOT NULL,
  stack TEXT,
  url TEXT,
  user_agent TEXT,
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX client_errors_created_idx ON public.client_errors (created_at DESC);

ALTER TABLE public.client_errors ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.client_errors TO service_role;
