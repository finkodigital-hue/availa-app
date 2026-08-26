-- Modular public-booking storefront settings. Stored beside page-builder
-- blocks so the existing owner/public page-layout policies apply unchanged.
alter table public.page_layouts
  add column if not exists storefront_settings jsonb not null default '{
    "sections": [
      {"id":"gallery","visible":true,"heading":"Our salon","itemLimit":3},
      {"id":"booking","visible":true,"heading":"What would you like to book?","itemLimit":6},
      {"id":"reviews","visible":true,"heading":"Loved by our clients","itemLimit":2},
      {"id":"location","visible":true,"heading":"Find us","itemLimit":7}
    ],
    "reviewScore": null,
    "reviewCount": null,
    "reviews": []
  }'::jsonb;
