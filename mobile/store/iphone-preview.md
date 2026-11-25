# iPhone preview and review handoff

Current source is prepared for an internal preview, not submitted to Apple. The automated JavaScript export is not an installable IPA. Jakob and Finlay currently have iPhones; Android device acceptance is still outstanding. USB access is not required for the route below.

## Current account evidence, 25 November 2026

- EAS CLI confirms an authorised `jakobfinkler` login with owner access to the personal account and `jakobfinklers-team`.
- Read-only searches found no Bookzenvo, Chairly or Luma project in either authorised account. A single free [Bookzenvo project](https://expo.dev/accounts/jakobfinklers-team/projects/bookzenvo) was then created under `jakobfinklers-team` and linked in the release checkout: `29705a11-9f04-4a4c-90b2-991f3a39077a`. Team ownership keeps the business project with the cofounders' team. `eas project:info` confirms the link and the iOS build list is empty. The older dirty checkout was not changed. No plan purchase, signing change, build, invitation or submission was made.
- Apple Developer membership, the intended Apple team and valid Bookzenvo signing credentials have not been verified. This Windows machine has no Apple build tooling. An EAS login does not prove Apple signing is ready.

## Free development preview

From the release checkout's `mobile` directory, the following starts a local preview without buying or submitting anything:

```powershell
$env:EXPO_NO_DOTENV = '1'
$env:EXPO_PUBLIC_APP_URL = 'https://bookzenvo.com'
$env:EXPO_PUBLIC_GOOGLE_AUTH_ENABLED = 'false'
npm start -- --go --lan
```

Open an SDK 58-compatible Expo Go on the iPhone and scan the displayed QR code using the camera. The PC and iPhone must be on a network that permits local connections, with the development server allowed through Windows Firewall. This preview connects to the configured website; use an approved test account and do not make trial payments or edit live salon records. It can exercise email/password sign-in and the WebView interface. It does **not** validate signed-app custom-scheme recovery/Google return, store signing or Tap to Pay. If the installed Expo Go does not support SDK 58, use the signed internal route instead of downgrading the audited app.

## Signed internal installation

These commands are the prepared handoff; no cloud build or Apple setup has been run. The business Expo project is already linked. Use an existing paid Apple Developer membership if one is available; do not accept a paid build or enrolment without the owner choosing it.

1. Confirm the active account with `npx eas-cli@27.11.0 whoami`. If it has expired, the owner runs `npx eas-cli@27.11.0 login` themselves. Never paste passwords or tokens into the repository or chat.
2. Confirm the existing link with `npx eas-cli@27.11.0 project:info`: it must be `@jakobfinklers-team/bookzenvo`, project ID `29705a11-9f04-4a4c-90b2-991f3a39077a`. Do not create a second project.
3. Run `npx eas-cli@27.11.0 device:create` and open the registration URL on each test iPhone. Select the correct Apple team. Internal ad hoc builds can install only on devices included in the provisioning profile.
4. Run `npm run check`. Keep Google disabled until [its additional gates](./google-sign-in.md) are met. Confirm the build's website origin.
5. With the owner present for Apple login/signing prompts and build-cost approval, run `npm run build:preview:ios`. The existing profile creates an internally distributed signed iPhone app. Do not use an automated submission flag.
6. Open the resulting EAS installation URL on the registered iPhone and install the build. Record the build ID, app version, iPhone model and iOS version alongside the acceptance results.

The next free account check is whether Jakob/Finlay already have an active Apple Developer team for `com.finkodigital.bookzenvo`. Expo account/project setup is complete. No Apple enrolment purchase has been made.

## Device acceptance

Use representative review data and approved test provider accounts. Record actual outcomes; do not mark any item complete from a JavaScript export.

| Area | Required iPhone result |
| --- | --- |
| Startup and accounts | Install, cold restart, email/password sign-in, secure session restoration, MFA, expired token, sign-out and switching account. Offline/failed restoration offers Retry. |
| Password recovery | Exact `bookzenvo://auth/reset` redirect allowed; cold/warm reset works; expired link is recoverable; signing out during a delayed recovery cannot reopen the old session. |
| Workspace | Dashboard, calendar, booking editor, clients, staff/services, stock, consultations, gift cards, reports, settings and help render with keyboard/safe-area controls usable. |
| Payments | Existing customer-service payment controls and external browser return work in the approved test setup. SaaS subscription-purchase steering stays out of native companion mode. No phone Tap to Pay is included. |
| Files | CSV/JSON/PDF exports open the native share sheet; cancellation/unavailable sharing recovers; printing opens the system browser without credentials in URLs; temporary export cleanup works after later activity. |
| Photos | User-selected branding/gallery/staff/customer uploads work. Stock camera capture displays the camera purpose text; photo selection displays appropriate system UI; denied camera/photo access recovers without a crash. |
| Network and lifecycle | Background/foreground, airplane mode/reconnect, interrupted WebView process and Android-equivalent back behaviour where applicable. |
| Data rights | On a disposable owner workspace: Settings → Data & privacy → Export workspace, Delete account and recoverable closure match current website behaviour. Do not execute against a live business. Verify eventual deletion/server retention separately. |

## Store-review preparation

- Existing account required. Provide Apple with a dedicated review account and representative data through App Store Connect's private review fields, including a usable MFA review arrangement where required. Do not put those credentials in these documents.
- Reviewer support: [Help](https://bookzenvo.com/help). Public [Privacy](https://bookzenvo.com/privacy), [Terms](https://bookzenvo.com/terms) and [marketing](https://bookzenvo.com) URLs must remain reachable and accurate. Check final privacy disclosures against the signed binary and website uploads/consultation flows.
- Account/workspace closure is reached in Settings → Data & privacy. Verify whether user-account erasure and the current recoverable workspace-closure flow satisfy the actual App Store account-deletion requirements before claiming the submission gate is complete.
- Use fictional customer data in screenshots. Explain review-safe customer payment behaviour and do not claim phone Tap to Pay. Google remains hidden unless the provider/device gates and Apple 4.8 login-service requirement are satisfied.
- After internal acceptance and owner approval, build the iOS production profile and distribute through TestFlight. Store submission and public release are separate actions; neither has been performed here.

References: [Expo internal distribution](https://docs.expo.dev/build/internal-distribution/), [Expo build setup](https://docs.expo.dev/build/setup/), [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/).
