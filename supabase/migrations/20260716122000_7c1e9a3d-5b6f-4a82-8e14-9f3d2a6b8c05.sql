
-- Repoint the two remaining readers of businesses.brand_color (the customer
-- portal's booking list, and the pro-invitation preview) at page_theme
-- before the old flat branding columns are dropped in the next migration.
CREATE OR REPLACE FUNCTION public.get_portal_bookings()
RETURNS TABLE(
  id uuid,
  business_id uuid,
  service_id uuid,
  staff_id uuid,
  customer_email text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  price_cents int,
  notes text,
  businesses jsonb,
  services jsonb,
  staff jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    b.id, b.business_id, b.service_id, b.staff_id, b.customer_email,
    b.starts_at, b.ends_at, b.status, b.price_cents, b.notes,
    jsonb_build_object(
      'id', biz.id, 'name', biz.name, 'slug', biz.slug, 'address', biz.address,
      'page_theme', biz.page_theme, 'cancellation_window_hours', biz.cancellation_window_hours
    ),
    jsonb_build_object('id', sv.id, 'name', sv.name, 'duration_minutes', sv.duration_minutes),
    jsonb_build_object('id', st.id, 'name', st.name)
  FROM public.bookings b
  LEFT JOIN public.businesses biz ON biz.id = b.business_id
  LEFT JOIN public.services sv ON sv.id = b.service_id
  LEFT JOIN public.staff st ON st.id = b.staff_id
  WHERE lower(b.customer_email) = public.current_user_email()
  ORDER BY b.starts_at DESC
  LIMIT 200;
$$;

-- salon_brand_color was assigned client-side but never actually rendered —
-- dropped rather than replaced.
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(_token text)
RETURNS TABLE (
  id uuid,
  salon_business_id uuid,
  email text,
  chair_label text,
  rent_mode text,
  rent_amount_cents integer,
  commission_percent numeric,
  agreement_start date,
  agreement_end date,
  rent_due_day smallint,
  message text,
  expires_at timestamptz,
  salon_name text,
  salon_logo_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pi.id, pi.salon_business_id, pi.email, pi.chair_label, pi.rent_mode,
         pi.rent_amount_cents, pi.commission_percent, pi.agreement_start,
         pi.agreement_end, pi.rent_due_day, pi.message, pi.expires_at,
         b.name, b.logo_url
  FROM public.professional_invitations pi
  JOIN public.businesses b ON b.id = pi.salon_business_id
  WHERE pi.token = _token
    AND pi.status = 'pending'
    AND pi.expires_at > now()
  LIMIT 1;
$$;
