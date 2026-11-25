# Mobile store release checklist

The Bookzenvo website is live. The mobile project is prepared for internal builds; its successful iOS JavaScript export is not an installable IPA. Store submission remains gated on the applicable signing, payment and physical-device checks below.

Use the [iPhone preview and reviewer handoff](./iphone-preview.md) for the checked account state, executable installation steps, account-deletion path and device acceptance matrix.

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
- [ ] For iPhone release: full iPhone QA passes on a production-like build.
- [ ] For Android release: full Android QA passes on a production-like build.
- [ ] For iPhone release: the intended Apple Developer team, active membership and signing credentials are verified.
- [ ] For Android release: the Google Play Console developer account is active.
- [x] The Expo project is linked in the release checkout: `@jakobfinklers-team/bookzenvo`, `29705a11-9f04-4a4c-90b2-991f3a39077a`. Source changes still require the normal repository review/commit process.
- [ ] Exact `bookzenvo://auth/reset` callback is allowed and tested cold/warm in Supabase Authentication.
- [ ] If Google sign-in is offered, [its callback and signed-device tests](./google-sign-in.md) pass before setting `EXPO_PUBLIC_GOOGLE_AUTH_ENABLED=true`. It is disabled by default.
- [ ] SDK 58 builds are tested on supported phones (iOS 16.4+), including MFA refresh, sign-out races, print/share sheets and temporary export cleanup.
- [ ] A stable store-review account with representative test data exists.
- [ ] Native Account & data → Request account deletion works for owner, staff and no-workspace accounts on a physical device. The operator's completion/retention-confirmation process is verified; submitting a request is not immediate erasure.
- [ ] Native companion mode hides SaaS subscription purchase/upgrade/portal steering while retaining merchant and customer-service payment controls.
- [ ] Final screenshots contain no real customer or payment data.

## Internal testing

1. Install locked dependencies in `mobile/` with `npm ci`.
2. Run `npm run check`.
3. Verify `eas project:info` points to the linked Bookzenvo team project; do not create another project.
4. Create an iPhone internal build with `npm run build:preview:ios`. Jakob and Finlay currently have iPhones; register the intended test device for internal distribution and verify Apple signing first. This uses the build service, not USB access.
5. When preparing Android release, create an installable APK with `npm run build:preview:android`.
6. Test sign-in, password recovery, deep links, every workspace page, booking changes, payments, external links, offline recovery and sign-out on the platform being released.
7. Record every device, operating-system version and result in the real-device QA checklist. Android stays unverified until an actual Android phone is tested. JavaScript exports are not installable IPA/APK files.

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

Do not submit a store version until its platform-specific checks and all shared checks above are complete, and the website, database, email delivery and live payment flows have been verified together in production. Android's separate signing/device checks do not prevent completing the iPhone checks first.
