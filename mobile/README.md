# Bookzenvo mobile

The Bookzenvo owner app for Android and iPhone. It uses the existing Bookzenvo Supabase project, so bookings and sign-ins are shared with the website.

## Run it on a phone

1. Copy `.env.example` to `.env`.
2. Add the existing public Supabase URL and publishable key from the Bookzenvo website environment.
3. In this `mobile` folder, run `npm ci`, then `npm start`.
4. Use an SDK 58-compatible development build. Expo Go must match the SDK; do not assume the current store version is compatible. Production-like device testing needs an actual development/internal build.

The current dependency baseline is Expo SDK 58 / React Native 0.88, requiring iOS 16.4 or later. Rebuild native binaries after upgrading; an older installed app cannot receive this SDK change as a JavaScript-only update. See [the audit](../docs/mobile-readiness-audit-2026-11-12.md) for exact validation and remaining gates.

Never add a Supabase service-role key, Stripe secret key, Resend key, or webhook secret to the mobile app.

## What is in the app

- Secure Supabase session storage
- Sign in, password-reset request and sign out
- The live Bookzenvo workspace, loaded inside the app so it has the same
  bookings, clients, staff, services, stock, reports, page builder, settings,
  payments and help centre as the website
- Native handling for links that need a secure browser, including Stripe Checkout
- Deep links for the main workspace screens, for example
  `bookzenvo://workspace/calendar` or
  `bookzenvo://workspace/bookings?bookingId=...`
- A recovery screen if the live workspace cannot be loaded, plus Android back
  navigation and automatic recovery from a terminated WebView process

Before publishing, verify the exact `bookzenvo://auth/reset` redirect in Supabase Authentication and create the required Apple/Google developer accounts.

## Release preparation

- Run `npm run check` before every preview or production build.
- Use `npm run build:preview:ios` and `npm run build:preview:android` for internal testing.
- Read the drafts in [`store/`](./store/) before creating either store listing.
- Do not submit the app until live Stripe is stable and the complete iPhone and Android QA checklist has passed.
