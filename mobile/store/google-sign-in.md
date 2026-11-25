# Native Google sign-in release gate

The code is prepared and tested with isolated provider/browser adapters. The button is hidden by default. No Google/Supabase configuration, cloud build or real Google sign-in was performed by this change.

## Implementation

- `EXPO_PUBLIC_GOOGLE_AUTH_ENABLED=true` enables the button only in an iOS/Android build with a valid HTTPS website origin. Keep the default `false` until the checks below are complete.
- Expo's system authentication browser opens the same website gateway used by password sign-in. The app generates independent 32-byte cryptographic random values for the verifier and `native_state`, derives an S256 challenge with Expo Crypto, and stores the attempt in the existing encrypted native store under an origin-specific key.
- Supabase's `/authorize` and `/token?grant_type=pkce` endpoints perform the exchange. The normal Supabase SDK verifies and stores the returned session. The existing password/recovery flow and MFA WebView handover remain in use. No global switch to implicit/plain OAuth or global WebCrypto replacement is introduced.
- Only `bookzenvo://auth/google` with exactly one matching `native_state` and one code (or provider error) is accepted. Token fragments, duplicate fields, credentials, extra paths and unexpected parameters are rejected. Attempts expire after ten minutes and are consumed once. Cancellation, another sign-in, account recovery or sign-out invalidates an attempt. A cold callback cannot replace a signed-in account.
- Warm callbacks are owned by the system auth-browser result. The app listener only recovers a stored pending attempt after a cold launch. The verifier and returned tokens never enter website navigation URLs or logs.

## Configuration and real-device checks

1. Confirm Google is enabled for the intended Supabase project and its Google authorised redirect URI is the project's Supabase Auth callback. The app contains no OAuth client secret.
2. Allow the app's exact `bookzenvo://auth/google` callback path in Supabase's additional redirects, including the generated `native_state` query. Validate matching against `bookzenvo://auth/google?native_state=<64-hex-value>` in the test project. Do not widen this to every `bookzenvo://` path. Retain the separate existing `bookzenvo://auth/reset` recovery redirect.
3. Build a signed iPhone preview with the flag enabled for the intended test website/project. Expo Go's `exp://` address is not the configured callback. Verify success, user cancellation, Google denial, expired callback, wrong-state rejection, network loss, app kill/reopen and repeated callback delivery. Verify that password sign-in/reset still work after cancellation.
4. Verify Google account identity, existing account linking rules, AAL2 MFA handover, sign-out and account switching with approved review data. Confirm a browser session cannot replace an already signed-in phone account.
5. Enable the flag for a release build only after recording actual hosted settings and successful signed-device results. Repeat on Android before Android release.
6. Before enabling Google in an App Store release, satisfy [Apple guideline 4.8](https://developer.apple.com/app-store/review/guidelines/#login-services) with an equivalent privacy-preserving login option (for example Sign in with Apple), unless a documented exception actually applies to this app. Do not assume all salon accounts qualify for the enterprise/business-account exception. Password-only sign-in remains available while Google is gated; Apple-provider setup has not been performed.

Primary references: [Expo 58 WebBrowser](https://docs.expo.dev/versions/v58.0.0/sdk/webbrowser/), [Expo 58 Crypto](https://docs.expo.dev/versions/v58.0.0/sdk/crypto/), [Supabase PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [Supabase native deep links](https://supabase.com/docs/guides/auth/native-mobile-deep-linking). The request fields match the installed Supabase Auth client's `_getUrlForProvider` and `_exchangeCodeForSession` implementation; native S256 avoids that client's plain-PKCE fallback on runtimes without WebCrypto.
