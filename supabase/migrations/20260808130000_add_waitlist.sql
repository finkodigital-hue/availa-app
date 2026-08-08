-- Public self-signup is paused pre-launch (see auth.tsx: mode=signup now
-- shows a waitlist form instead of calling supabase.auth.signUp). This
-- table + RPC back that form. Existing accounts still sign in normally —
-- this only affects new account creation.
--
-- The table itself is locked down (no direct grants to anon/authenticated);
-- all writes go through the SECURITY DEFINER RPC below so we can validate
-- input and rate-limit without exposing the raw table to anonymous clients.

CREATE TABLE public.waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX waitlist_email_lower_idx ON public.waitlist (lower(email));

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
-- No policies: RLS with zero policies denies all direct access (including
-- to the table owner's default grants), forcing everything through the
-- SECURITY DEFINER function below.

GRANT ALL ON public.waitlist TO service_role;

CREATE OR REPLACE FUNCTION public.join_waitlist(p_email text, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(p_email));
  v_burst_count integer;
BEGIN
  IF v_email IS NULL OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'INVALID_EMAIL: please enter a valid email address';
  END IF;

  -- Blunt scripted/bot submissions: more than 50 signups in the last 60
  -- seconds is not a real traffic pattern for a waitlist.
  SELECT count(*) INTO v_burst_count
  FROM waitlist
  WHERE created_at > now() - interval '60 seconds';

  IF v_burst_count >= 50 THEN
    RAISE EXCEPTION 'RATE_LIMITED: too many requests right now, please try again in a minute';
  END IF;

  BEGIN
    INSERT INTO waitlist (email, note) VALUES (v_email, NULLIF(trim(p_note), ''));
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'ALREADY_ON_LIST: this email is already on the waitlist';
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_waitlist(text, text) TO anon, authenticated;
