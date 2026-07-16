
-- Expose page_theme on the public-safe businesses view so the booking page
-- can read it as anon. business_type/wizard_completed are owner-only setup
-- state, not needed by the public page, so they're left off this view.
CREATE OR REPLACE VIEW public.public_businesses
WITH (security_invoker = off) AS
SELECT id, name, slug, logo_url, brand_color, description, address, phone, email,
       website, timezone, instagram, facebook, twitter, tiktok,
       cover_image_url, secondary_color, accent_color, font, button_style,
       border_radius, theme, welcome_message, booking_instructions,
       cancellation_policy, terms, faq, show_prices, show_staff, show_durations,
       emergency_message, emergency_active, custom_domain, favicon_url,
       browser_title, currency, hide_powered_by, deposit_percent, payment_mode,
       cancellation_window_hours, page_theme
FROM public.businesses;

GRANT SELECT ON public.public_businesses TO anon, authenticated;

-- anon's column-scoped grant on the raw businesses table (from 20260704200212)
-- also needs page_theme, since RLS + column grants apply independently of
-- the view for anything that queries businesses directly.
GRANT SELECT (page_theme) ON public.businesses TO anon;
