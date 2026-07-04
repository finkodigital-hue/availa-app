
-- FIX 1: businesses — hide sensitive columns from public
DROP POLICY IF EXISTS "public can view businesses" ON public.businesses;
DROP POLICY IF EXISTS "public can view businesses authed" ON public.businesses;

CREATE OR REPLACE VIEW public.public_businesses
WITH (security_invoker = off) AS
SELECT id, name, slug, logo_url, brand_color, description, address, phone, email,
       website, timezone, instagram, facebook, twitter, tiktok,
       cover_image_url, secondary_color, accent_color, font, button_style,
       border_radius, theme, welcome_message, booking_instructions,
       cancellation_policy, terms, faq, show_prices, show_staff, show_durations,
       emergency_message, emergency_active, custom_domain, favicon_url,
       browser_title, currency, hide_powered_by, deposit_percent, payment_mode,
       cancellation_window_hours
FROM public.businesses;

GRANT SELECT ON public.public_businesses TO anon, authenticated;

-- FIX 2: staff — hide email/phone from public
DROP POLICY IF EXISTS "public reads bookable staff safe cols" ON public.staff;

CREATE OR REPLACE VIEW public.public_staff
WITH (security_invoker = off) AS
SELECT id, business_id, name, role, photo_url, bio, bookable, active
FROM public.staff
WHERE bookable = true AND active = true;

GRANT SELECT ON public.public_staff TO anon, authenticated;

-- FIX 3: professional_invitations — require token to access
DROP POLICY IF EXISTS "public can read by token" ON public.professional_invitations;

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
  salon_logo_url text,
  salon_brand_color text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pi.id, pi.salon_business_id, pi.email, pi.chair_label, pi.rent_mode,
         pi.rent_amount_cents, pi.commission_percent, pi.agreement_start,
         pi.agreement_end, pi.rent_due_day, pi.message, pi.expires_at,
         b.name, b.logo_url, b.brand_color
  FROM public.professional_invitations pi
  JOIN public.businesses b ON b.id = pi.salon_business_id
  WHERE pi.token = _token
    AND pi.status = 'pending'
    AND pi.expires_at > now()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.accept_professional_invitation(
  _token text,
  _pro_business_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.professional_invitations%ROWTYPE;
  v_owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_invite FROM public.professional_invitations
   WHERE token = _token AND status = 'pending' AND expires_at > now()
   LIMIT 1;
  IF v_invite.id IS NULL THEN
    RAISE EXCEPTION 'Invitation is no longer valid';
  END IF;

  SELECT owner_id INTO v_owner FROM public.businesses WHERE id = _pro_business_id;
  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'You do not own this business';
  END IF;

  INSERT INTO public.salon_professionals (
    salon_business_id, pro_business_id, status, chair_label, rent_mode,
    rent_amount_cents, commission_percent, agreement_start, agreement_end, rent_due_day
  ) VALUES (
    v_invite.salon_business_id, _pro_business_id, 'active', v_invite.chair_label,
    v_invite.rent_mode, v_invite.rent_amount_cents, v_invite.commission_percent,
    v_invite.agreement_start, v_invite.agreement_end, v_invite.rent_due_day
  ) ON CONFLICT DO NOTHING;

  UPDATE public.professional_invitations
     SET status = 'accepted',
         accepted_at = now(),
         accepted_business_id = _pro_business_id
   WHERE id = v_invite.id;

  RETURN v_invite.id;
END $$;

GRANT EXECUTE ON FUNCTION public.accept_professional_invitation(text, uuid) TO authenticated;

-- FIX 4: storage — remove blanket public read on private bucket
DROP POLICY IF EXISTS "Public read business assets" ON storage.objects;
DROP POLICY IF EXISTS "public reads business assets" ON storage.objects;
