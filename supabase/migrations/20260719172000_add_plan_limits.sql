-- Pricing tiers: Free (Solo, one staff member, no AI features) and Studio
-- (£22/month, unlimited staff, AI assistant + AI page editor). This
-- migration enforces the free-plan staff-count limit at the database layer
-- (defense in depth — the client also blocks this in the UI, but a trigger
-- means it holds even if that's ever bypassed). It does NOT touch AI-feature
-- gating, which is enforced in the app server routes (api/chat,
-- api/page-ai-suggest) since those calls cost money per-request and aren't a
-- row insert this database can intercept.

-- Normalize `plan` to a known set of values so a typo doesn't silently
-- create a third, unsupported tier. Add "studio" as the only paid value for
-- now — extend this list here (and in the app's plan-settings UI) if you
-- ever add another paid tier.
ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_plan_check;
ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_plan_check CHECK (plan IN ('free', 'studio'));

CREATE OR REPLACE FUNCTION public.enforce_staff_plan_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  biz_plan text;
  existing_count int;
BEGIN
  SELECT plan INTO biz_plan FROM public.businesses WHERE id = NEW.business_id;

  IF biz_plan = 'free' THEN
    SELECT count(*) INTO existing_count FROM public.staff WHERE business_id = NEW.business_id;
    IF existing_count >= 1 THEN
      RAISE EXCEPTION 'PLAN_LIMIT: The free plan is limited to one staff member. Upgrade to Studio to add more.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staff_plan_limit ON public.staff;
CREATE TRIGGER staff_plan_limit
  BEFORE INSERT ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_staff_plan_limit();
