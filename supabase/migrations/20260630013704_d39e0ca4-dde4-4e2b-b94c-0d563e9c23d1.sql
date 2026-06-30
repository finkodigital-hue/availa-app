
-- Customer profile fields (address + avatar)
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS avatar_url text;

-- Service organisation
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Index for fast service archive filtering
CREATE INDEX IF NOT EXISTS services_active_archived_idx
  ON public.services (business_id, active) WHERE archived_at IS NULL;

-- Helper to make sure every business has a full week of business_hours rows.
-- We use Mon–Sat 09:00–18:00, Sun closed as the sensible default.
CREATE OR REPLACE FUNCTION public.ensure_business_hours(_business_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d int;
BEGIN
  FOR d IN 0..6 LOOP
    INSERT INTO public.business_hours (business_id, weekday, open_time, close_time, closed)
    VALUES (
      _business_id,
      d,
      CASE WHEN d = 0 THEN NULL ELSE '09:00'::time END,
      CASE WHEN d = 0 THEN NULL ELSE '18:00'::time END,
      d = 0
    )
    ON CONFLICT (business_id, weekday) DO NOTHING;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_business_hours(uuid) TO authenticated;

-- Backfill: any business that has zero hours rows gets the default week
DO $$
DECLARE
  b record;
BEGIN
  FOR b IN SELECT id FROM public.businesses LOOP
    PERFORM public.ensure_business_hours(b.id);
  END LOOP;
END;
$$;

-- Auto-create hours for new businesses
CREATE OR REPLACE FUNCTION public.handle_new_business()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_business_hours(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_new_business ON public.businesses;
CREATE TRIGGER trg_handle_new_business
  AFTER INSERT ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_business();

-- Reassign all of a staff member's future bookings to another staff member.
-- Used by the "delete staff" flow so historic bookings are preserved.
CREATE OR REPLACE FUNCTION public.reassign_staff_bookings(
  _from_staff uuid,
  _to_staff uuid,
  _only_future boolean DEFAULT true
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bid uuid;
  to_bid uuid;
  moved integer;
BEGIN
  SELECT business_id INTO bid FROM public.staff WHERE id = _from_staff;
  SELECT business_id INTO to_bid FROM public.staff WHERE id = _to_staff;
  IF bid IS NULL OR to_bid IS NULL OR bid <> to_bid THEN
    RAISE EXCEPTION 'Both staff must belong to the same business';
  END IF;
  IF NOT public.is_business_owner(bid) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  UPDATE public.bookings
     SET staff_id = _to_staff
   WHERE staff_id = _from_staff
     AND (NOT _only_future OR starts_at >= now());
  GET DIAGNOSTICS moved = ROW_COUNT;
  RETURN moved;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reassign_staff_bookings(uuid, uuid, boolean) TO authenticated;
