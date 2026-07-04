ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_custom_shape_chk;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_custom_shape_chk CHECK (
  (is_custom = true AND custom_title IS NOT NULL)
  OR (
    is_custom = false
    AND service_id IS NOT NULL
    AND (customer_id IS NOT NULL OR customer_name IS NOT NULL)
  )
);