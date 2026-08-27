-- Owner-managed service category names. Existing service categories become the
-- starting set; brand-new businesses receive a small editable base set.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS service_categories text[] NOT NULL
  DEFAULT ARRAY['Consultation', 'Cuts', 'Colouring', 'Styling', 'Treatments']::text[];

UPDATE public.businesses AS business
SET service_categories = COALESCE(
  (
    SELECT array_agg(category_name ORDER BY category_name)
    FROM (
      SELECT DISTINCT trim(service.category) AS category_name
      FROM public.services AS service
      WHERE service.business_id = business.id
        AND service.category IS NOT NULL
        AND trim(service.category) <> ''
    ) AS existing_categories
  ),
  ARRAY['Consultation', 'Cuts', 'Colouring', 'Styling', 'Treatments']::text[]
);

COMMENT ON COLUMN public.businesses.service_categories IS
  'Editable ordered category names used to organise services.';
