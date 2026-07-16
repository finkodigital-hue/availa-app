
-- Cleanup: page_theme has fully replaced the flat branding columns (public
-- page, portal, Design panel, and the invitation preview all read/write
-- page_theme now — see 20260716120000, 20260716120500, 20260716122000).
-- Drop the view's dependency on them first, then the columns themselves.
CREATE OR REPLACE VIEW public.public_businesses
WITH (security_invoker = off) AS
SELECT id, name, slug, logo_url, description, address, phone, email,
       website, timezone, instagram, facebook, twitter, tiktok,
       cover_image_url, welcome_message, booking_instructions,
       cancellation_policy, terms, faq, show_prices, show_staff, show_durations,
       emergency_message, emergency_active, custom_domain, favicon_url,
       browser_title, currency, hide_powered_by, deposit_percent, payment_mode,
       cancellation_window_hours, page_theme
FROM public.businesses;

GRANT SELECT ON public.public_businesses TO anon, authenticated;

ALTER TABLE public.businesses
  DROP COLUMN IF EXISTS brand_color,
  DROP COLUMN IF EXISTS secondary_color,
  DROP COLUMN IF EXISTS accent_color,
  DROP COLUMN IF EXISTS font,
  DROP COLUMN IF EXISTS button_style,
  DROP COLUMN IF EXISTS border_radius,
  DROP COLUMN IF EXISTS theme;
