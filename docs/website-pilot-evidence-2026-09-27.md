# Website pilot evidence — 27 September 2026

Scope: production website only. Native mobile-app work and phone-based Tap to Pay were excluded.

## Release and public-route checks

- Production main release `3ae5de7ed01dc58a50a574cd03871a342e5ea468` passed the GitHub website check, Cloudflare Workers build and live-domain check.
- `npm run audit:launch -- https://bookzenvo.com` passed 119 public pages and assets after the final unverified icon was removed. The lower count is expected because the redundant `.ico` file no longer exists.
- The public Playwright suite passed 12 active tests. Three booking tests were then run separately against `/book/pasha-hair` with one worker and all passed.
- The Pasha journey reached service, professional, available-time and customer-detail stages without creating a booking. Its 390-by-844 layout had no horizontal overflow.
- After the final asset deployment, all five focused public browser tests passed again against production, including legal navigation, the card-reader FAQ, narrow-phone layouts and the new PNG favicon reference.

## Signed-in phone-width checks

Using the production test workspace at a 390-by-844 viewport, the following routes rendered a main heading and stayed within the viewport:

- Dashboard
- Calendar
- Bookings
- Customers
- Services
- Payments
- Settings
- Help Centre

The control-name, image-alternative and minimum-target scan found a real Services editor accessibility gap. PR #127 linked the visible labels to their inputs, named both switches, enlarged the category-management target and raised the shared switch to the WCAG 2.2 minimum target size. The deployed Services page then passed the same scan with zero unnamed controls, missing image alternatives or targets below 24 pixels.

## Independent public-page audit

Lighthouse 12.8.2 mobile audits recorded:

| Page               | Accessibility | Best practices | SEO |
| ------------------ | ------------: | -------------: | --: |
| Homepage           |           100 |            100 | 100 |
| Pasha booking page |           100 |            100 | 100 |

Lighthouse did not produce a sign-in score because two isolated headless runs reported no first contentful paint. This is recorded as a tool limitation rather than a pass: the production sign-in page returned HTTP 200 with rendered HTML, the existing Playwright 320-pixel sign-in test passed, and the page was visible in the normal browser. Recheck with a second performance tool if a measured sign-in performance score is required.

## Live transport and browser headers

The homepage, sign-in page and Pasha booking page returned HTTP 200 with the same protections:

- HTTPS with HSTS (`max-age=31536000`)
- Content Security Policy restricting content to the intended same-origin and explicit image/data cases
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- camera, geolocation and microphone disabled by Permissions Policy

The certificate presented for `bookzenvo.com` was valid through 16 December 2026. Cloudflare is expected to renew it; production monitoring must still alert on future TLS or availability failures.

## Dependency, credential and asset checks

- `npm audit` reported zero known vulnerabilities across 521 production, development, optional and peer dependencies on 27 September 2026. This is a point-in-time registry result and must be rerun as packages and advisories change.
- A filename-only credential scan found no high-confidence Stripe live secret, Stripe webhook secret, GitHub token, Anthropic key, Google OAuth secret, private key or Supabase service JWT pattern in the working tree or Git history. This supplements provider-side secret rotation and access review; pattern scanning cannot prove that no secret exists.
- Six unused Pasha portraits, four unused or superseded landing files, three Pasha fallback premises images and three Testshop fallback images with unrecorded provenance were removed.
- The remaining bundled photograph has its Pexels creator, source and licence recorded. The favicon and social-share image are generated from `scripts/generate-brand-assets.mjs`, which is kept with the source. Their deployed SHA-256 hashes matched the release files after deployment.

## Company identity check

The [official Companies House overview](https://find-and-update.company-information.service.gov.uk/company/SC902170) was read on 27 September 2026. It showed:

- BOOKZENVO LTD;
- company number SC902170;
- active status;
- private limited company;
- registered office at Pinefield, Cannich, Beauly, Scotland, IV4 7LY;
- incorporation on 9 September 2026; and
- SIC 62012, business and domestic software development.

The name, number, legal form and registered office match the website disclosure. Companies House itself states that it does not check the accuracy of filed information, so this verifies consistency with the public register rather than the truth of the underlying filing. The support email is a Bookzenvo operational detail and is not part of that register.

## Boundaries still open

This evidence does not replace:

- a physical-device check by the pilot salon;
- a keyboard-only and named-screen-reader walkthrough by a person;
- an authorised real customer booking and reminder observation;
- a low-value live Stripe payment/refund;
- a supported physical-reader payment/cancellation/refund pilot; or
- qualified legal, ICO, grant-condition and contributor/IP ownership review.

No live charge, customer message, booking mutation or privacy request was created during this pass.
