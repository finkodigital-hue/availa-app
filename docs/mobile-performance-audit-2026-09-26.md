# Mobile performance audit — 26 September 2026

Lighthouse 13.5.0 tested the live `https://bookzenvo.com` homepage with its simulated mobile profile. This is one controlled lab run, not field data or proof of performance on every device and network.

| Category or metric | Result |
| --- | ---: |
| Performance | 85/100 |
| Accessibility | 97/100 |
| Best practices | 96/100 |
| SEO | 100/100 |
| First Contentful Paint | 2.6 s |
| Largest Contentful Paint | 3.7 s |
| Total Blocking Time | 80 ms |
| Cumulative Layout Shift | 0 |
| Speed Index | 2.7 s |
| Transferred page weight | 472 KiB |

The LCP resource was already discoverable in the initial HTML, loaded eagerly and marked with high fetch priority. Its measured breakdown was about 607 ms server response, 10 ms discovery delay, 618 ms resource loading and 39 ms rendering delay. Lighthouse estimated about 109 KiB of unused JavaScript; this remains a worthwhile bundle follow-up, but blocking time was low.

The accessibility audit identified three small text colours just below WCAG AA contrast: the hero label, the Studio price suffix and the Studio feature caption. Their targeted colours were darkened in `src/landing.css`. A second simulated-mobile audit against the local application scored accessibility 100/100 with no contrast failures. The local run reported a Windows temporary-folder cleanup error after writing the complete report; its audit results were still readable and complete.

After that release, the live mobile accessibility audit also scored 100/100 with no contrast failures. A repeat performance run scored 86, with FCP 2.2 s, LCP 3.8 s, TBT 50 ms and CLS 0. Lighthouse attributed its unused-JavaScript estimate to the shared entry bundle. The only application use of Zod was two simple URL query parsers, which made the whole validation library part of that entry. Replacing those parsers with equivalent allow-list and UUID checks reduced the production entry build from 659,359 to 583,959 bytes (11.4%) and its maximum-gzip size from 187,694 to 167,877 bytes (10.6%). The existing sign-in/reset/waitlist and signed-out redirect browser tests all pass.

The best-practices deduction included missing source maps for large first-party JavaScript and a Content Security Policy inspector warning. Production currently sends a CSP, but it permits inline scripts and styles because the React/TanStack render path uses them. Removing that allowance safely needs nonce support across normal SSR, hydration and the emergency client shell; it should be treated as a separate security change with browser regression coverage.

At the same time, production and full locked-dependency audits both reported zero known npm advisories. A single health request caught a four-second Supabase Auth timeout while the database remained healthy; three follow-up probes five seconds apart all returned healthy, with Auth latency of 260 ms, 98 ms and 107 ms. This matches the release monitor's sustained-failure policy and does not show a continuing outage.
