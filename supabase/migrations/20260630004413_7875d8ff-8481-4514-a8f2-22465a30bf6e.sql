
-- Branding & customisation columns on businesses
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS secondary_color text,
  ADD COLUMN IF NOT EXISTS accent_color text,
  ADD COLUMN IF NOT EXISTS font text NOT NULL DEFAULT 'fraunces',
  ADD COLUMN IF NOT EXISTS button_style text NOT NULL DEFAULT 'rounded',
  ADD COLUMN IF NOT EXISTS border_radius int NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'light',
  ADD COLUMN IF NOT EXISTS tiktok text,
  ADD COLUMN IF NOT EXISTS welcome_message text,
  ADD COLUMN IF NOT EXISTS booking_instructions text,
  ADD COLUMN IF NOT EXISTS cancellation_policy text,
  ADD COLUMN IF NOT EXISTS terms text,
  ADD COLUMN IF NOT EXISTS faq jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS show_prices boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_staff boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_durations boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS emergency_message text,
  ADD COLUMN IF NOT EXISTS emergency_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_domain text,
  ADD COLUMN IF NOT EXISTS favicon_url text,
  ADD COLUMN IF NOT EXISTS browser_title text,
  ADD COLUMN IF NOT EXISTS email_logo_url text,
  ADD COLUMN IF NOT EXISTS email_footer text,
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS hide_powered_by boolean NOT NULL DEFAULT false;

ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_theme_check,
  ADD CONSTRAINT businesses_theme_check CHECK (theme IN ('light','dark','auto'));

ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_button_style_check,
  ADD CONSTRAINT businesses_button_style_check CHECK (button_style IN ('rounded','pill','square'));

CREATE UNIQUE INDEX IF NOT EXISTS businesses_custom_domain_idx
  ON public.businesses(lower(custom_domain)) WHERE custom_domain IS NOT NULL;

-- Extend media kinds (exterior, before-after, video)
ALTER TABLE public.business_media
  DROP CONSTRAINT IF EXISTS business_media_kind_check,
  ADD CONSTRAINT business_media_kind_check
    CHECK (kind IN ('cover','logo','interior','exterior','team','portfolio','before-after','video'));

-- Holiday closures
CREATE TABLE IF NOT EXISTS public.holiday_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  label text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.holiday_closures TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holiday_closures TO authenticated;
GRANT ALL ON public.holiday_closures TO service_role;
ALTER TABLE public.holiday_closures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner manages closures" ON public.holiday_closures;
CREATE POLICY "owner manages closures" ON public.holiday_closures
  FOR ALL TO authenticated
  USING (public.is_business_owner(business_id))
  WITH CHECK (public.is_business_owner(business_id));
DROP POLICY IF EXISTS "public reads closures" ON public.holiday_closures;
CREATE POLICY "public reads closures" ON public.holiday_closures
  FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "public reads closures authed" ON public.holiday_closures;
CREATE POLICY "public reads closures authed" ON public.holiday_closures
  FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS holiday_closures_biz_idx
  ON public.holiday_closures(business_id, starts_on);
