ALTER TABLE public.blocked_dates ADD COLUMN IF NOT EXISTS kind text DEFAULT 'other', ADD COLUMN IF NOT EXISTS title text;

CREATE TABLE IF NOT EXISTS public.business_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  month date NOT NULL,
  revenue_cents_target integer NOT NULL DEFAULT 0,
  bookings_target integer NOT NULL DEFAULT 0,
  customers_target integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_goals TO authenticated;
GRANT ALL ON public.business_goals TO service_role;

ALTER TABLE public.business_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read goals" ON public.business_goals FOR SELECT TO authenticated USING (public.is_business_owner(business_id));
CREATE POLICY "Owners insert goals" ON public.business_goals FOR INSERT TO authenticated WITH CHECK (public.is_business_owner(business_id));
CREATE POLICY "Owners update goals" ON public.business_goals FOR UPDATE TO authenticated USING (public.is_business_owner(business_id)) WITH CHECK (public.is_business_owner(business_id));
CREATE POLICY "Owners delete goals" ON public.business_goals FOR DELETE TO authenticated USING (public.is_business_owner(business_id));

CREATE TRIGGER set_business_goals_updated_at BEFORE UPDATE ON public.business_goals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();