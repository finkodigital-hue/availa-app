# Mobile audit — 12 November 2026

This is code/bundle evidence, not a real-device pass or store approval. Website-first remains the launch route; Jakob separately requested a deeper native-app audit on12November.

## Corrected and tested

- Native sign-in previously seeded `sb-<project>-auth-token`, while the shipping website reads `bookzenvo-auth`. Both now use the website key. Session changes notify Supabase through its actual BroadcastChannel mechanism; repeated injection does not repeat notifications. Older WebViews have a bounded first-load fallback.
- Session injection is limited to the configured website origin. Native messages from other origins and oversized messages are rejected. A delayed token refresh cannot silently restore a workspace after sign-out.
- Password recovery accepts only the configured `bookzenvo://auth/reset` callback, an explicit recovery type and unambiguous token fields.
- SecureStore chunks are limited by UTF-8 byte count, not JavaScript character count. Writes use distinct generations and commit the manifest last, preserving the previous session if replacement fails. Operations on one key are serialised; corrupted manifests cannot cause unbounded reads. Existing v1 sessions remain readable. Failure to remove the root session propagates rather than pretending sign-out succeeded.
- Direct font/icon imports reduced bundled assets from47 to7. Hermes JavaScript bundles decreased from approximately2.84MB to2.49MB on iOS and2.85MB to2.50MB on Android.
- Compatible dependency patches applied. Expo pinned within SDK54; an override prevents nested conflicting Expo majors introduced by npm's automated audit repair. Expo Doctor passed18/18 after deduplication.
- Added repeatable mobile compilation checks in CI; these do not submit a build to either app store.

## Validation

`test-mobile-session.mjs` exercises actual generated bridge JavaScript in isolated browser fixtures: initial/refresh handover, website-key alignment, hostile origins, duplicate suppression, legacy fallback, sign-out and recovery-link rejection.

`test-mobile-secure-store.mjs` exercises actual storage implementation: Unicode size, failed replacements, concurrent writes, old manifests, shrinking/cleanup, corrupt manifests, missing chunks, failed persistent sign-out and oversize rejection.

Both suites and the mobile TypeScript check passed. iOS and Android Metro/Hermes exports passed with seven assets each. These are JavaScript/assets exports, not signed installable binaries or real-device testing.

## Still open

- Mobile dependency audit improved from27 findings (including1 critical) to15 (0 critical,2 high,12 moderate,1 low). Remaining findings require further dependency/SDK work and are not waived; they include build tooling, and are not evidence that each advisory is reachable in a shipped app.
- Native sign-in/MFA, Keychain/Keystore behaviour after process termination, recovery redirects, external payment return, downloads, offline/reconnect, touch/keyboard/assistive technology and store-account deletion still require real iPhone/Android testing.
- Hosted Supabase redirect settings, Expo project/store accounts and signed builds are not established by compilation. No live payments, messages or store submission were initiated.
- SDK upgrades need separate compatibility verification. No claim of complete code review, penetration testing or perfection is made.

References: [Expo versioned reference](https://docs.expo.dev/versions/v57.0.0/) (required by mobile/AGENTS.md); [React Native WebView reference](https://github.com/react-native-webview/react-native-webview/blob/master/docs/Reference.md). The installed Supabase Auth client's BroadcastChannel handling was also inspected directly.
