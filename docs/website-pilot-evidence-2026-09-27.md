# Website pilot evidence — 27 September 2026

Scope: production website only. Native mobile-app work and phone-based Tap to Pay were excluded.

## Release and public-route checks

- Production main release `c41a9de7536ae483d9922f43a0557f86bdf4379b` passed the GitHub website check, Cloudflare Workers build and live-domain check.
- `npm run audit:launch -- https://bookzenvo.com` passed 120 public pages and assets after the card-reader copy release.
- The public Playwright suite passed 12 active tests. Three booking tests were then run separately against `/book/pasha-hair` with one worker and all passed.
- The Pasha journey reached service, professional, available-time and customer-detail stages without creating a booking. Its 390-by-844 layout had no horizontal overflow.

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

## Boundaries still open

This evidence does not replace:

- a physical-device check by the pilot salon;
- a keyboard-only and named-screen-reader walkthrough by a person;
- an authorised real customer booking and reminder observation;
- a low-value live Stripe payment/refund;
- a supported physical-reader payment/cancellation/refund pilot; or
- qualified legal, ICO, grant-condition and asset-rights review.

No live charge, customer message, booking mutation or privacy request was created during this pass.
