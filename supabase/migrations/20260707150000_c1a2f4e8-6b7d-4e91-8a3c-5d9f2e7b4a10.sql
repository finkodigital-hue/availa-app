
-- Independent Professionals: rent generation convenience.
--
-- Mark-paid / waive / manual entries are already covered by the existing
-- "salon owner manages rent" ALL policy on rent_payments — no new SQL needed
-- for those, they're plain CRUD from the client.
--
-- This adds one-click generation of the *next* period's rent_payments row
-- for fixed-amount agreements (weekly/monthly). Percentage and
-- fixed-commission modes are usage-based and have no fixed billing cadence
-- in the schema (a link is exactly one rent_mode, not a combination), so
-- generating those automatically would mean inventing a cadence that was
-- never specified — left to manual entry via the UI instead.
CREATE OR REPLACE FUNCTION public.generate_rent_payment(_link_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_link public.salon_professionals%ROWTYPE;
  v_period_start date;
  v_period_end date;
  v_id uuid;
BEGIN
  SELECT * INTO v_link FROM public.salon_professionals WHERE id = _link_id;
  IF v_link.id IS NULL THEN
    RAISE EXCEPTION 'Not found';
  END IF;
  IF NOT public.is_business_owner(v_link.salon_business_id) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF v_link.rent_mode NOT IN ('weekly', 'monthly') THEN
    RAISE EXCEPTION 'Only weekly or monthly rent can be auto-generated — add a manual payment for this agreement instead';
  END IF;

  SELECT MAX(period_end) INTO v_period_start FROM public.rent_payments WHERE salon_professional_id = _link_id;
  v_period_start := COALESCE(v_period_start, v_link.agreement_start, CURRENT_DATE);
  v_period_end := CASE
    WHEN v_link.rent_mode = 'weekly' THEN v_period_start + 7
    ELSE (v_period_start + INTERVAL '1 month')::date
  END;

  IF v_period_end > CURRENT_DATE THEN
    RAISE EXCEPTION 'NOTHING_DUE';
  END IF;

  INSERT INTO public.rent_payments (salon_professional_id, period_start, period_end, amount_cents, due_date, status)
  VALUES (_link_id, v_period_start, v_period_end, COALESCE(v_link.rent_amount_cents, 0), v_period_end, 'due')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_rent_payment(uuid) TO authenticated;
