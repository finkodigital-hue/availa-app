-- The staff_plan_limit trigger added in 20260719172000_add_plan_limits.sql only
-- fires BEFORE INSERT. It does not fire when an existing (e.g. imported and
-- disabled) staff row is switched back to active via UPDATE. On the free plan
-- this let an owner re-enable an unlimited number of pre-existing staff rows
-- through the "Active" toggle on the Staff page, completely bypassing the
-- one-staff limit that's meant to gate the Studio upgrade.
--
-- Fix: also enforce the limit on UPDATE when a row's `active` column is being
-- set to true, counting only *active* staff (a free-plan business may still
-- hold any number of disabled staff rows, e.g. from an import).

CREATE OR REPLACE FUNCTION public.enforce_staff_plan_limit_on_activate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  biz_plan text;
  active_count int;
BEGIN
  -- Only relevant when the row is being turned on.
  IF NEW.active IS DISTINCT FROM true OR OLD.active IS TRUE THEN
    RETURN NEW;
  END IF;

  SELECT plan INTO biz_plan FROM public.businesses WHERE id = NEW.business_id;
  IF biz_plan = 'free' THEN
    SELECT count(*) INTO active_count
    FROM public.staff
    WHERE business_id = NEW.business_id
      AND active = true
      AND id <> NEW.id;
    IF active_count >= 1 THEN
      RAISE EXCEPTION 'PLAN_LIMIT: The free plan is limited to one staff member. Upgrade to Studio to add more.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staff_plan_limit_on_activate ON public.staff;
CREATE TRIGGER staff_plan_limit_on_activate
  BEFORE UPDATE OF active ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_staff_plan_limit_on_activate();
