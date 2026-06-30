
-- Phase 2: multi-period opening hours per weekday
CREATE TABLE IF NOT EXISTS public.business_hour_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  open_time time NOT NULL,
  close_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.business_hour_periods TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_hour_periods TO authenticated;
GRANT ALL ON public.business_hour_periods TO service_role;

ALTER TABLE public.business_hour_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read business periods"
  ON public.business_hour_periods FOR SELECT
  USING (true);

CREATE POLICY "Owners manage periods"
  ON public.business_hour_periods FOR ALL
  USING (public.is_business_owner(business_id))
  WITH CHECK (public.is_business_owner(business_id));

CREATE INDEX IF NOT EXISTS idx_bhp_biz_weekday ON public.business_hour_periods(business_id, weekday);

-- Seed periods from existing business_hours rows (one period per open day)
INSERT INTO public.business_hour_periods (business_id, weekday, open_time, close_time)
SELECT bh.business_id, bh.weekday, bh.open_time, bh.close_time
FROM public.business_hours bh
LEFT JOIN public.business_hour_periods bhp
  ON bhp.business_id = bh.business_id AND bhp.weekday = bh.weekday
WHERE bh.closed = false
  AND bh.open_time IS NOT NULL
  AND bh.close_time IS NOT NULL
  AND bhp.id IS NULL;

-- Update ensure_business_hours to also seed periods
CREATE OR REPLACE FUNCTION public.ensure_business_hours(_business_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  d int;
BEGIN
  FOR d IN 0..6 LOOP
    INSERT INTO public.business_hours (business_id, weekday, open_time, close_time, closed)
    VALUES (
      _business_id, d,
      CASE WHEN d = 0 THEN NULL ELSE '09:00'::time END,
      CASE WHEN d = 0 THEN NULL ELSE '18:00'::time END,
      d = 0
    )
    ON CONFLICT (business_id, weekday) DO NOTHING;

    IF d <> 0 AND NOT EXISTS (
      SELECT 1 FROM public.business_hour_periods WHERE business_id = _business_id AND weekday = d
    ) THEN
      INSERT INTO public.business_hour_periods (business_id, weekday, open_time, close_time)
      VALUES (_business_id, d, '09:00'::time, '18:00'::time);
    END IF;
  END LOOP;
END;
$function$;
