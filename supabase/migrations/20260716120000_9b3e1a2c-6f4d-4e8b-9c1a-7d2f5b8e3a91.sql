
-- Unified booking-page theme (step 1 of the Page Builder + Branding merge):
-- a single jsonb object becomes the source of truth for public-page styling,
-- replacing the 7 flat scalar branding columns added in 20260630004413.
-- Old columns are kept for now (dropped in a later migration once the app
-- no longer reads them) so this ships without a hard cutover.

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS page_theme jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS business_type text,
  ADD COLUMN IF NOT EXISTS wizard_completed boolean NOT NULL DEFAULT false;

ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_business_type_check
  CHECK (business_type IS NULL OR business_type IN ('salon', 'barber', 'spa', 'nails', 'beauty', 'other'));

-- Backfill every existing business's page_theme from its current flat
-- branding columns, so nothing regresses in appearance the moment the
-- public page switches over to reading page_theme instead.
UPDATE public.businesses SET page_theme = jsonb_build_object(
  'version', 1,
  'preset', 'clean_minimal',
  'colors', jsonb_build_object(
    'primary', COALESCE(brand_color, '#8E2A38'),
    'accent', COALESCE(accent_color, secondary_color, brand_color, '#8E2A38'),
    'background', '#FFFFFF',
    'surface', '#F7F7F9',
    'text', '#16161A',
    'textMuted', '#6B6B76'
  ),
  'typography', jsonb_build_object(
    'displayFont', 'Fraunces',
    'bodyFont', 'Inter'
  ),
  'buttons', jsonb_build_object(
    'style', CASE button_style WHEN 'pill' THEN 'soft' WHEN 'square' THEN 'outline' ELSE 'solid' END,
    'cornerRadius', COALESCE(border_radius, 12)
  ),
  'logoUrl', logo_url,
  'updatedAt', to_jsonb(now())
)
WHERE page_theme = '{}'::jsonb;
