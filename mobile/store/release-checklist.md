# Mobile store release checklist

The project is prepared for internal builds, but store submission stays blocked until the website, live Stripe and real-device QA are stable.

## Already configured

- [x] App name and slug are set to Bookzenvo.
- [x] iOS bundle identifier is `com.finkodigital.bookzenvo`.
- [x] Android package is `com.finkodigital.bookzenvo`.
- [x] App icon, adaptive Android icon, monochrome Android icon and splash artwork are configured.
- [x] The app uses a light interface and portrait orientation.
- [x] The `bookzenvo://` deep-link scheme is configured.
- [x] Secure session storage is used by the app.
- [x] EAS preview and production profiles are defined.
- [x] Production build numbers use EAS remote auto-incrementing.
- [x] Store listing and privacy-disclosure drafts exist in this folder.

## Submission blockers

- [ ] Bookzenvo website is stable in production.
- [ ] Live Stripe is configured and tested end to end.
- [ ] Full iPhone QA passes on a production-like build.
- [ ] Full Android QA passes on a production-like build.
- [ ] Apple Developer Program account is active.
- [ ] Google Play Console developer account is active.
- [ ] The Expo project is linked with `eas init` and its project ID is committed in the Expo config.
- [ ] `bookzenvo://` is allowed in Supabase Authentication redirect URLs.
- [ ] A stable store-review account with representative test data exists.
- [ ] In-app account deletion is verified and documented for reviewers.
- [ ] Final screenshots contain no real customer or payment data.

## Internal testing

1. Install dependencies in `mobile/` with `npm install`.
2. Run `npm run check`.
3. Sign in to the Bookzenvo Expo organisation and run `eas init` once.
4. Create an iPhone internal build with `npm run build:preview:ios`.
5. Create an installable Android APK with `npm run build:preview:android`.
6. Test sign-in, password recovery, deep links, every workspace page, booking changes, payments, external links, offline recovery and sign-out on both platforms.
7. Record every device, operating-system version and result in the real-device QA checklist.

## Apple App Store

- [ ] Create the app record in App Store Connect using bundle ID `com.finkodigital.bookzenvo`.
- [ ] Complete age rating, privacy, encryption, support URL and account-deletion details.
- [ ] Upload the final screenshots and listing copy.
- [ ] Build with `npx eas-cli build --profile production --platform ios`.
- [ ] Send the build to TestFlight and complete internal testing.
- [ ] Resolve all TestFlight feedback before requesting App Review.

## Google Play

- [ ] Create the app in Play Console using package `com.finkodigital.bookzenvo`.
- [ ] Complete Data safety, content rating, target audience and account-deletion details.
- [ ] Upload the final screenshots, feature graphic and listing copy.
- [ ] Build with `npx eas-cli build --profile production --platform android`.
- [ ] Release first to the internal testing track.
- [ ] Resolve all internal-test feedback before production submission.

## Final release gate

Do not submit either store version until every submission blocker above is complete and the website, database, email delivery and live payment flows have been verified together in production.
