-- Real subscription billing for the Studio plan (£22/month via Stripe
-- Checkout in subscription mode, on Bookzenvo's own platform account — NOT
-- the business's connected Stripe account, which handles their customers'
-- payments and payouts).
--
-- These columns track the billing relationship:
--   stripe_billing_customer_id  the owner as a customer of Bookzenvo
--   stripe_subscription_id      the £22/mo subscription, NULL for businesses
--                               granted Studio manually (e.g. test accounts) —
--                               the downgrade sweep must never touch those
--   stripe_subscription_status  last status seen from Stripe
--   billing_synced_at           throttle for the cron status sweep

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS stripe_billing_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_status text,
  ADD COLUMN IF NOT EXISTS billing_synced_at timestamptz;
