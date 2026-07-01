ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS is_custom boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_title text,
  ADD COLUMN IF NOT EXISTS custom_color text;

ALTER TABLE public.bookings ALTER COLUMN service_id DROP NOT NULL;
ALTER TABLE public.bookings ALTER COLUMN customer_id DROP NOT NULL;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_custom_shape_chk;
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_custom_shape_chk CHECK (
    (is_custom = true AND custom_title IS NOT NULL)
    OR (is_custom = false AND service_id IS NOT NULL AND customer_id IS NOT NULL)
  );