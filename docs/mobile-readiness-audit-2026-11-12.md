# Mobile audit — 12 November 2026

This final report supersedes the earlier SDK 54 / 15-advisory snapshot. It records source review, isolated tests and JavaScript bundle exports. It is not a real-device pass, signed native build, penetration test or store approval. Website-first remains the launch route.

## Corrected behaviour

- Native and website sessions use `bookzenvo-auth` and Supabase BroadcastChannel notifications. Repeated injection does not repeat events; older WebViews have a bounded first-load fallback.
- The browser can complete MFA or rotate a token before native. Web-to-native handover now verifies the token with Supabase and requires the same current native user before SDK `setSession`. Neither direction replaces an unexpired higher-assurance session with AAL1 or a newer token with an older one. Decoded claims only select which existing session to preserve; they do not grant authorisation. No authentication timestamps are manufactured.
- Sign-out closes the handover queue, blocks late browser storage writes and serialises removal after an in-flight native write. Changing native user remounts the WebView. Foreign-origin and oversized messages are rejected. Recovery accepts only `bookzenvo://auth/reset`, recovery type and unambiguous token fields; Supabase validates the actual token.
- SecureStore uses UTF-8 byte limits, bounded chunk counts, generations and manifest-last commits. Interrupted replacement preserves the previous complete session; v1 remains readable. Failed root removal propagates. Best-effort orphan cleanup is not proof every interrupted chunk is erased.
- Print previously routed back into the same WebView. It now opens the trusted page in the system browser, using that browser's normal sign-in. The action does not transfer session tokens in the URL.
- Export sharing now checks availability before writing, uses only a dedicated temporary cache, confines/sanitises filenames, and avoids collisions. Failed shares remove their staging files. Files at least 24 hours old are cleaned on later launch/export: this is activity-triggered best-effort cleanup, **not guaranteed 24-hour deletion**. Successful shares remain temporarily because Android receivers may still read after the chooser resolves. User-saved copies remain under user control. Old versions' unscoped files are not indiscriminately deleted.
- Direct font imports retain seven assets instead of the original 47.

## Dependency upgrade and compatibility

Upgraded incrementally 54 → 55 → 56 → 57 → 58, aligning each stage with `expo install --fix` and inspecting TypeScript/Doctor results. Intermediate failures were resolved, not treated as passes. Final versions: **Expo 58.0.25, React Native 0.88.1, React 19.3.0, TypeScript 6.0.3, WebView 14.0.1**.

- Replaced removed `StyleSheet.absoluteFillObject`; made nullable AppState and WebView generic types explicit. No broad `any` or strict-API opt-out was added.
- FileSystem's documented `/legacy` API remains supported. Modern File.write/copy/move breaking changes do not affect current calls.
- Explicitly aligned `expo-constants` eliminates duplicate native copies. Existing `expo: $expo` override prevents conflicting majors.
- The last audit chain was one minimatch pattern-amplification advisory propagated through Expo fingerprint. Scoped override `@expo/fingerprint → minimatch 11.0.8` was checked against upstream breaking changes and actual fingerprint calls (`Minimatch`, `pattern`, `negate`, `match`). It uses none of the removed regex/AST APIs. Actual fingerprint generation and ignore/negation/directory/Windows-path tests passed. Do not broaden the override blindly.
- Clean `npm ci --ignore-scripts` succeeded. Final audit: **0 critical, 0 high, 0 moderate, 0 low**. This is known-advisory status at audit time, not a guarantee of no vulnerabilities. Earlier image-size/PostCSS highs were build-tool chains; their presence did not prove payment-runtime exploitability.
- **Expo Doctor 20/20**, mobile TypeScript and both native JavaScript exports passed. Native binaries must be rebuilt; this is not an OTA-compatible SDK change.
- **SDK 56+ requires iOS 16.4 or later**, dropping iPhone 6s/7/first-generation SE support. SDK58 needs supported Node22.13+/24.3+/26+ and current Apple/Android build tooling. Node24 was used. Final OS/device support still needs testing.

## Repeatable validation

| Check | Actual scope | Result |
| --- | --- | --- |
| test-mobile-session.mjs | Generated bridge JavaScript: initial/refresh/MFA handover, rotation, AAL2 preservation both directions, origins, duplicates, legacy fallback and recovery parsing; mocked provider identity and two async sign-out races | Passed |
| test-mobile-secure-store.mjs | Actual storage: Unicode limits, interrupted/concurrent writes, old/corrupt/missing manifests and chunks, shrinking, failed removal and oversize | Passed |
| test-mobile-exports.mjs | Actual helper with isolated file/share adapters: path confinement, expiry, concurrency, unavailable sharing, invalid content, failure cleanup | Passed |
| test-mobile-shell.mjs | Actual WebWorkspace component and injected script in fixtures: print dispatch, native message/navigation guards, same-origin fetch and existing MFA Authorization preservation | Passed |
| test-mobile-fingerprint.mjs | Installed Expo path helpers and complete project fingerprint | Passed; 30 sources |
| Compilation | TSC, Doctor, iOS/Android Metro/Hermes exports, maximum two workers | Passed; iOS720 modules, Android718; seven assets each; approximately2.4MB each |

Evidence lives under `C:\bookzenvo\private-launch-records`: `mobile-sdk58-audit-final-2026-11-12.json`, `mobile-sdk58-ios-2026-11-12`, `mobile-sdk58-android-2026-11-12`. These are JavaScript/assets exports, not installable signed IPA/APK files. No real accounts, messages or charges were used. Mobile CI now runs install, Doctor, TSC, advisory audit, all five mobile suites and both exports; root check:launch includes the mobile runtime regressions.

## Coverage and remaining gates

Manually reviewed App.tsx (active sign-in/recovery/WebWorkspace, fetch/XHR/navigation/download bridges, offline/process recovery, inactive OwnerApp and styles), src/lib/supabase.ts, workspace-session.ts, native-session-bridge.ts, secure-session-store.ts, workspace-export.ts; entrypoint, package/app/EAS/TypeScript config, README and store drafts. Selected installed Supabase Auth session/MFA/sign-out and Expo fingerprint implementations were inspected. Dependency source trees were scanned automatically, not exhaustively read line by line.

OwnerApp is unreachable legacy UI: the current App mounts WebWorkspace. Its partial calendar/payments/customer screens must not be described as shipped features. It remains cleanup work; website functionality and database permissions have separate audits.

Before store release:

1. Signed production-like iPhone/Android builds and device MFA, expiry/rotation, background/kill/relaunch, account switching, offline sign-out, Keychain/Keystore checks.
2. Verify hosted redirect allow-list for exact `bookzenvo://auth/reset` and cold/warm recovery links.
3. Device tests for external Stripe return, declines/cancellation/refunds, print/share/CSV/PDF, cache cleanup, offline reconnect, keyboard/safe areas and accessibility. Provider settings and fresh-sign-in requirements still apply.
4. Expo linkage, Apple/Google accounts/signing, reviewer account and account-deletion path. Review compiled manifests and production data flows against privacy disclosures. No paid build or store submission was started.

## Primary sources

- [Expo upgrade procedure](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/)
- [SDK55](https://expo.dev/changelog/sdk-55), [SDK56 and minimum iOS](https://expo.dev/changelog/sdk-56), [SDK57](https://expo.dev/changelog/sdk-57), [SDK58 breaking changes](https://expo.dev/changelog/sdk-58)
- [Required versioned reference](https://docs.expo.dev/versions/v57.0.0/), [SDK58 legacy FileSystem](https://docs.expo.dev/versions/v58.0.0/sdk/filesystem-legacy/), [SDK58 sharing](https://docs.expo.dev/versions/v58.0.0/sdk/sharing/)
- [Minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249), [Minimatch11 API changes](https://github.com/isaacs/minimatch/blob/main/changelog.md)
- [Supabase setSession](https://supabase.com/docs/reference/javascript/auth-setsession), [getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [WebView reference](https://github.com/react-native-webview/react-native-webview/blob/master/docs/Reference.md)
