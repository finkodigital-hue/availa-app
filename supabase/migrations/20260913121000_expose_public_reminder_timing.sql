-- The reminder lead-time column was added after public_businesses was created,
-- but the booking page already selects it. Append it without exposing any
-- private business fields.
create or replace view public.public_businesses
with (security_invoker = off) as
select id, name, slug, logo_url, description, address, phone, email,
       website, timezone, instagram, facebook, twitter, tiktok,
       cover_image_url, welcome_message, booking_instructions,
       cancellation_policy, terms, faq, show_prices, show_staff, show_durations,
       emergency_message, emergency_active, custom_domain, favicon_url,
       browser_title, currency, hide_powered_by, deposit_percent, payment_mode,
       cancellation_window_hours, page_theme, reminder_hours_before
from public.businesses;

grant select on public.public_businesses to anon, authenticated;
