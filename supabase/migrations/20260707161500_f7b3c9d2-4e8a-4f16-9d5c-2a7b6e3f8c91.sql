
-- Same bug class as 20260707160000, one table over: migration 20260704200212
-- dropped anon's SELECT policy on `businesses` when it introduced the
-- `public_businesses` view, but never restored an equivalent policy — and
-- never revoked the original full-column anon GRANT either. Net effect:
-- anon holds column privileges but RLS blocks every row, so any query that
-- touches the raw `businesses` table as anon (not the view) sees nothing.
--
-- This breaks the customers INSERT policy used by create_public_booking
-- ("public can insert customers for booking"), whose WITH CHECK does
-- `EXISTS (SELECT 1 FROM businesses WHERE id = customers.business_id)` —
-- always false for anon, so every anonymous booking failed at the
-- create-customer step with "new row violates row-level security policy
-- for table customers".
--
-- Fix the same way as staff: revoke the stale full-column grant, replace
-- with a column-scoped grant matching exactly what `public_businesses`
-- already exposes (excludes owner_id, stripe_*, plan, email template
-- fields), plus a permissive row policy (businesses are meant to be
-- publicly visible — that's the point of the public booking page).
--
-- Scoped to anon only. `authenticated` still has a full-column GRANT on
-- this table (required for owners to read their own business's every
-- column via useMyBusiness) with no equivalent row policy for non-owners —
-- that's the same deeper "owner vs. everyone else" column-grant tension
-- already flagged separately for `staff`, deliberately left alone here.
REVOKE SELECT ON public.businesses FROM anon;
GRANT SELECT (
  id, name, slug, logo_url, brand_color, description, address, phone, email,
  website, timezone, instagram, facebook, twitter, tiktok, cover_image_url,
  secondary_color, accent_color, font, button_style, border_radius, theme,
  welcome_message, booking_instructions, cancellation_policy, terms, faq,
  show_prices, show_staff, show_durations, emergency_message, emergency_active,
  custom_domain, favicon_url, browser_title, currency, hide_powered_by,
  deposit_percent, payment_mode, cancellation_window_hours
) ON public.businesses TO anon;

CREATE POLICY "public reads businesses for booking" ON public.businesses
  FOR SELECT TO anon
  USING (true);
