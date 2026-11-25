# Bookzenvo mobile

The Bookzenvo owner app for Android and iPhone. It uses the existing Bookzenvo Supabase project, so bookings and sign-ins are shared with the website.

## Run it on a phone

1. Copy `.env.example` to `.env` if you need to change a public build setting.
2. `EXPO_PUBLIC_APP_URL` defaults to `https://bookzenvo.com`. Native sign-in uses that website's guarded `/api/supabase` gateway; no Supabase URL or key is needed. Production builds require an HTTPS origin without a path, credentials, query or fragment. HTTP is permitted only for localhost/loopback in development.
3. In this `mobile` folder, run `npm ci`, then `npm start`.
4. Use an SDK 58-compatible development build. Expo Go must match the SDK; do not assume the current store version is compatible. Production-like device testing needs an actual development/internal build.

The current dependency baseline is Expo SDK 58 / React Native 0.88, requiring iOS 16.4 or later. Rebuild native binaries after upgrading; an older installed app cannot receive this SDK change as a JavaScript-only update. The 25 November release work retains the [12 November audit](../docs/mobile-readiness-audit-2026-11-12.md) session/MFA/storage/export safeguards, adds bounded network/startup recovery, and updates Expo/file-system patches. Native session keys are now isolated by website origin; users of older preview builds must sign in again. Old preview keychain entries are not migrated or indiscriminately deleted.

Never add a Supabase service-role key, Stripe secret key, Resend key, or webhook secret to the mobile app.

## What is in the app

- Secure Supabase session storage
- Sign in, password-reset request and sign out
- Google sign-in prepared behind a disabled build flag; see [Google setup](./store/google-sign-in.md) before enabling it
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

The current app uses native sign-in followed by the website's actual workspace screens. Earlier native calendar/demo and Tap to Pay experiments are not part of this release tree. Tap to Pay is not a shipped phone feature. Existing website payment controls remain available in the workspace.

## Release preparation

- Run `npm run check` before every preview or production build. It includes actual-code offline regressions for startup, OAuth, session/MFA handover, encrypted storage, exports and WebView behaviour.
- Use `npm run build:preview:ios` and `npm run build:preview:android` for internal testing.
- Read the drafts in [`store/`](./store/) before creating either store listing.
- Do not submit the app until live Stripe is stable and the complete iPhone and Android QA checklist has passed.

Jakob and Finlay currently have iPhones for acceptance testing. Prioritise a signed iPhone internal build, then TestFlight; Android JavaScript/configuration checks do not replace Android device acceptance. USB access is not needed for an EAS internal iPhone build, but an existing Expo project, Apple signing/account setup and a registered test device are required. No cloud build or store submission is started by the checks above.
